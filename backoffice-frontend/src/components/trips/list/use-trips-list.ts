"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken, TripPackage, TripStatus } from "@/lib/api";
import { ToastState } from "@/components/toast-notification";
import {
  deleteTripPackage,
  formatTripStatus,
  getDeleteErrorMessage,
  getDeleteSuccessMessage,
  getStatusChangeErrorMessage,
  getStatusChangeSuccessMessage,
  updateTripStatus,
} from "@/lib/trip";
import { ActivePanel, Category, ModalType, ViewMode } from "./types";

type ConfirmAction =
  | { type: "delete"; trip: TripPackage }
  | { type: "status"; trip: TripPackage; targetStatus: TripStatus };

type ContextMenuState = {
  trip: TripPackage;
  x: number;
  y: number;
};

const TRIPS_CACHE_TTL_MS = 60_000;

let tripsCache: { data: TripPackage[]; expiresAt: number } | null = null;
let tripsRequest: Promise<TripPackage[]> | null = null;

function hasFreshTripsCache() {
  return Boolean(tripsCache && tripsCache.expiresAt > Date.now());
}

function cacheTrips(data: TripPackage[]) {
  tripsCache = {
    data,
    expiresAt: Date.now() + TRIPS_CACHE_TTL_MS,
  };
}

async function fetchTripsOnce() {
  if (hasFreshTripsCache() && tripsCache) {
    return tripsCache.data;
  }

  if (!tripsRequest) {
    tripsRequest = apiFetch<TripPackage[]>("/api/v1/admin/packages", {}, true)
      .then((data) => {
        cacheTrips(data);
        return data;
      })
      .finally(() => {
        tripsRequest = null;
      });
  }

  return tripsRequest;
}

export function invalidateTripsCache() {
  tripsCache = null;
}

export function useTripsList() {
  const router = useRouter();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const [activePanel, setActivePanel] = useState<ActivePanel>(
    pathname.includes("/orders") ? "orders" : "trips"
  );
  const [category, setCategory] = useState<Category>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [packages, setPackages] = useState<TripPackage[]>(() => tripsCache?.data ?? []);
  const [loading, setLoading] = useState(() => !hasFreshTripsCache());
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);

  useEffect(() => {
    if (activePanel !== "trips") {
      return;
    }

    let cancelled = false;
    setError("");
    if (hasFreshTripsCache() && tripsCache) {
      setPackages(tripsCache.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchTripsOnce()
      .then((data) => {
        if (!cancelled) {
          setPackages(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPackages([]);
          setError(err instanceof Error ? err.message : "Gagal memuat paket trip.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePanel]);

  const handleTripContextMenu = useCallback(
    (event: React.MouseEvent, trip: TripPackage) => {
      if (!getToken()) {
        return;
      }
      event.preventDefault();
      const menuWidth = 200;
      const menuHeight = 220;
      setContextMenu({
        trip,
        x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
        y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      });
    },
    []
  );

  const handleEditTrip = useCallback(
    (trip: TripPackage) => {
      router.push(`/trips?edit=${trip.id}`);
    },
    [router]
  );

  const requestDeleteTrip = useCallback((trip: TripPackage) => {
    setConfirmAction({ type: "delete", trip });
  }, []);

  const requestStatusChange = useCallback(
    (trip: TripPackage, targetStatus: TripStatus) => {
      setConfirmAction({ type: "status", trip, targetStatus });
    },
    []
  );

  const executeConfirmedAction = useCallback(async () => {
    if (!confirmAction) {
      return;
    }

    const { trip } = confirmAction;
    setPendingTripId(trip.id);

    try {
      if (confirmAction.type === "delete") {
        await deleteTripPackage(trip.id);
        setPackages((current) => {
          const updated = current.filter((item) => item.id !== trip.id);
          cacheTrips(updated);
          return updated;
        });
        setToast({ type: "success", text: getDeleteSuccessMessage() });
      } else {
        const updated = await updateTripStatus(trip.id, confirmAction.targetStatus);
        setPackages((current) => {
          const nextPackages = current.map((item) =>
            item.id === trip.id
              ? { ...item, ...updated, status: updated.status }
              : item
          );
          cacheTrips(nextPackages);
          return nextPackages;
        });
        setToast({
          type: "success",
          text: getStatusChangeSuccessMessage(confirmAction.targetStatus),
        });
      }
      setConfirmAction(null);
    } catch (err) {
      setToast({
        type: "error",
        text:
          confirmAction.type === "delete"
            ? getDeleteErrorMessage(err)
            : getStatusChangeErrorMessage(err),
      });
    } finally {
      setPendingTripId(null);
    }
  }, [confirmAction]);

  const confirmModalContent = useMemo(() => {
    if (!confirmAction) {
      return null;
    }

    if (confirmAction.type === "delete") {
      return {
        title: "Hapus Paket?",
        description:
          "Paket yang dihapus tidak dapat dikembalikan. Apakah Anda yakin ingin melanjutkan?",
        confirmLabel: "Delete",
        variant: "danger" as const,
      };
    }

    return {
      title: "Ubah Status Paket?",
      description: `Apakah Anda yakin ingin mengubah status paket ini menjadi ${formatTripStatus(confirmAction.targetStatus)}?`,
      confirmLabel: "Confirm",
      variant: "default" as const,
    };
  }, [confirmAction]);

  const filteredTrips = useMemo(() => {
    return packages.filter((trip) => {
      const matchesCategory = category === "all" || trip.category === category;
      const matchesQuery = trip.title.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [category, packages, query]);

  const cancelConfirm = useCallback(() => {
    if (confirmAction && pendingTripId !== confirmAction.trip.id) {
      setConfirmAction(null);
    }
  }, [confirmAction, pendingTripId]);

  return {
    activePanel,
    setActivePanel,
    category,
    setCategory,
    viewMode,
    setViewMode,
    query,
    setQuery,
    modal,
    setModal,
    loading,
    error,
    toast,
    setToast,
    confirmAction,
    contextMenu,
    setContextMenu,
    pendingTripId,
    filteredTrips,
    confirmModalContent,
    handleTripContextMenu,
    handleEditTrip,
    requestDeleteTrip,
    requestStatusChange,
    executeConfirmedAction,
    cancelConfirm,
  };
}
