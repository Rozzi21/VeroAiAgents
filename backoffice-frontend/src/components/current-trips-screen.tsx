"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleHelp,
  Compass,
  X,
  Grid2X2,
  LayoutDashboard,
  List,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, assetURL, getToken, logout, TripPackage, TripStatus } from "@/lib/api";
import { formatIDR, getDiscountMeta } from "@/lib/format";
import {
  deleteTripPackage,
  formatTripStatus,
  getDeleteErrorMessage,
  getDeleteSuccessMessage,
  getStatusChangeErrorMessage,
  getStatusChangeSuccessMessage,
  updateTripStatus,
} from "@/lib/trip";
import { TripCardContextMenu } from "@/components/trip-card-context-menu";
import { ConfirmModal } from "@/components/confirm-modal";
import { ToastNotification, ToastState } from "@/components/toast-notification";

type Category = "all" | "international" | "local";
type ViewMode = "grid" | "list";
type ActivePanel = "trips" | "dashboard";
type ModalType = "help" | "privacy" | null;

type ConfirmAction =
  | { type: "delete"; trip: TripPackage }
  | { type: "status"; trip: TripPackage; targetStatus: TripStatus };

type ContextMenuState = {
  trip: TripPackage;
  x: number;
  y: number;
};

export function CurrentTripsScreen() {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<ActivePanel>("trips");
  const [category, setCategory] = useState<Category>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [packages, setPackages] = useState<TripPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (category !== "all") {
      params.set("category", category);
    }
    if (query) {
      params.set("search", query);
    }
    const path = `/api/v1/admin/packages?${params.toString()}`;

    apiFetch<TripPackage[]>(path, {}, true)
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
  }, [category, query]);

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
        setPackages((current) => current.filter((item) => item.id !== trip.id));
        setToast({ type: "success", text: getDeleteSuccessMessage() });
      } else {
        const updated = await updateTripStatus(trip.id, confirmAction.targetStatus);
        setPackages((current) =>
          current.map((item) =>
            item.id === trip.id
              ? { ...item, ...updated, status: updated.status }
              : item
          )
        );
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

  return (
    <div className="min-h-screen bg-white text-[#161a23]">
      <aside className="fixed inset-y-0 left-0 hidden w-[288px] flex-col bg-[#faf9ff] px-8 py-6 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c1121f] text-sm font-bold text-white">
            T
          </div>
          <div>
            <div className="text-xl font-extrabold leading-none text-[#c1121f]">
              TravelOS
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7b7f8c]">
              Autonomous Engine
            </div>
          </div>
        </div>

        <nav className="mt-16 space-y-3">
          <SidebarItem
            icon={<LayoutDashboard size={18} />}
            label="Dashboard"
            active={activePanel === "dashboard"}
            onClick={() => setActivePanel("dashboard")}
          />
          <SidebarItem
            icon={<Compass size={18} />}
            label="Trips"
            active={activePanel === "trips"}
            onClick={() => setActivePanel("trips")}
          />
        </nav>

        <div className="mt-auto border-t border-[#eceaf2] pt-6">
          <SidebarItem
            icon={<CircleHelp size={16} />}
            label="Help"
            subtle
            onClick={() => setModal("help")}
          />
          <SidebarItem
            icon={<LockKeyhole size={16} />}
            label="Privacy"
            subtle
            onClick={() => setModal("privacy")}
          />
          <SidebarItem
            icon={<LogOut size={16} />}
            label="Logout"
            subtle
            onClick={() => {
              void logout();
            }}
          />
        </div>
      </aside>

      <main className="lg:pl-[288px]">
        <div className="mx-auto min-h-screen max-w-[1180px] px-6 py-5 md:px-10 lg:px-14">
          <header className="flex justify-end">
            <label className="flex h-10 w-full max-w-[248px] items-center gap-3 rounded-xl bg-[#eef0ff] px-4 text-[#606473]">
              <Search size={18} />
              <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#606473]"
                placeholder="CariTrips"
              />
            </label>
          </header>

          <section className="mt-12">
            {activePanel === "dashboard" ? (
              <OnDevelopment />
            ) : (
              <>
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h1 className="text-5xl font-extrabold tracking-[-0.04em] text-[#111827] md:text-[54px]">
                  Current Trips
                </h1>
                <p className="mt-3 text-lg font-medium text-[#7b7f8c]">
                  Manage your active and upcoming itineraries.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex rounded-xl bg-white p-1 shadow-[0_12px_26px_-20px_rgba(17,24,39,0.7)] ring-1 ring-[#e4e7f2]">
                  <button
                    type="button"
                    onClick={() => setCategory("all")}
                    className={cn(
                      "h-10 rounded-lg px-5 text-sm font-semibold transition",
                      category === "all"
                        ? "bg-[#c1121f] font-bold text-white shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)]"
                        : "text-[#535762]"
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("international")}
                    className={cn(
                      "h-10 rounded-lg px-5 text-sm font-semibold transition",
                      category === "international"
                        ? "bg-[#c1121f] font-bold text-white shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)]"
                        : "text-[#535762]"
                    )}
                  >
                    International
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("local")}
                    className={cn(
                      "h-10 rounded-lg px-5 text-sm font-semibold transition",
                      category === "local"
                        ? "bg-[#c1121f] font-bold text-white shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)]"
                        : "text-[#535762]"
                    )}
                  >
                    Local
                  </button>
                </div>

                <div className="flex rounded-xl bg-[#f3f4fb] p-1 shadow-[0_14px_30px_-24px_rgba(17,24,39,0.7)]">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition",
                      viewMode === "grid"
                        ? "bg-[#c1121f] text-white shadow-[0_12px_28px_-16px_rgba(193,18,31,0.85)]"
                        : "text-[#6b7280]"
                    )}
                  >
                    <Grid2X2 size={19} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition",
                      viewMode === "list"
                        ? "bg-[#c1121f] text-white shadow-[0_12px_28px_-16px_rgba(193,18,31,0.85)]"
                        : "text-[#6b7280]"
                    )}
                  >
                    <List size={19} />
                  </button>
                </div>

                <Link
                  href="/trips"
                  className="flex h-12 items-center gap-2 rounded-xl bg-[#c1121f] px-6 text-sm font-bold text-white shadow-[0_16px_30px_-18px_rgba(193,18,31,0.85)]"
                >
                  <Plus size={16} />
                  New Trip
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="mt-12 rounded-2xl border border-[#eceaf2] bg-[#fdfbff] p-8 text-center text-sm font-semibold text-[#777c88]">
                Memuat paket trip...
              </div>
            ) : filteredTrips.length > 0 ? (
              <div
                className={cn(
                  "mt-12 grid gap-x-9 gap-y-9",
                  viewMode === "grid"
                    ? "md:grid-cols-2 xl:grid-cols-3"
                    : "grid-cols-1"
                )}
              >
                {filteredTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    viewMode={viewMode}
                    busy={pendingTripId === trip.id}
                    onContextMenu={handleTripContextMenu}
                  />
                ))}
                <CreateTripCard />
              </div>
            ) : (
              <EmptyPackagesState error={error} />
            )}
              </>
            )}
          </section>
        </div>
      </main>

      <InfoModal type={modal} onClose={() => setModal(null)} />
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
      {confirmModalContent && confirmAction && (
        <ConfirmModal
          open
          title={confirmModalContent.title}
          description={confirmModalContent.description}
          confirmLabel={confirmModalContent.confirmLabel}
          cancelLabel="Cancel"
          variant={confirmModalContent.variant}
          loading={pendingTripId === confirmAction.trip.id}
          onConfirm={executeConfirmedAction}
          onCancel={() => {
            if (pendingTripId !== confirmAction.trip.id) {
              setConfirmAction(null);
            }
          }}
        />
      )}
      {contextMenu && (
        <TripCardContextMenu
          trip={contextMenu.trip}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onEdit={handleEditTrip}
          onDelete={requestDeleteTrip}
          onStatusChange={requestStatusChange}
        />
      )}
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  subtle,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  subtle?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 w-full items-center gap-4 rounded-xl px-4 text-left text-sm font-semibold transition hover:bg-[#f0d8db]/70 hover:text-[#c1121f]",
        active
          ? "bg-[#f0d8db] text-[#c1121f]"
          : subtle
            ? "text-[#686c78]"
            : "text-[#535762]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TripCard({
  trip,
  viewMode,
  busy,
  onContextMenu,
}: {
  trip: TripPackage;
  viewMode: ViewMode;
  busy?: boolean;
  onContextMenu: (event: React.MouseEvent, trip: TripPackage) => void;
}) {
  const {
    id,
    title,
    status,
    duration,
    slots,
    package_start_date,
    package_end_date,
    image_url,
    media,
    base_price,
    estimated_price,
    discount_price,
    discount_enabled,
  } = trip;
  const image = assetURL(image_url || media?.[0]?.url);
  const date = formatDateRange(package_start_date, package_end_date);
  const price = getDiscountMeta(
    base_price || estimated_price,
    discount_price ?? 0,
    discount_enabled
  );
  const statusTone = getStatusTone(status);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-45px_rgba(17,24,39,0.75)] transition",
        busy && "pointer-events-none opacity-60",
        viewMode === "list" && "grid md:grid-cols-[300px_minmax(0,1fr)]"
      )}
      onContextMenu={(event) => onContextMenu(event, trip)}
    >
      <Link
        href={`/trips/${id}`}
        className={cn("block", viewMode === "list" && "contents")}
      >
        <div
          className={cn(
            "relative bg-gradient-to-br from-[#102b35] via-[#2f9aad] to-[#a7dee3]",
            viewMode === "grid" ? "h-[192px]" : "min-h-[220px]"
          )}
          style={
            image
              ? {
                  backgroundImage: `url(${image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.7),transparent_18rem)] opacity-50" />
          <div className="absolute inset-0 backdrop-blur-[1px]" />
          <div
            className={cn(
              "absolute right-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em]",
              statusTone.badge
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", statusTone.dot)} />
            {formatTripStatus(status)}
          </div>
        </div>

        <div className="p-6">
          <h2 className="whitespace-pre-line text-2xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#171923]">
            {title}
          </h2>
          <p className="mt-2 text-sm font-medium text-[#8a8f9d]">
            {duration || "Flexible"} - {slots || 0} Slots
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-[#c1121f]">
              {formatIDR(price.displayPrice)}
            </span>
            {price.hasDiscount && (
              <>
                <span className="text-sm font-medium text-[#8a8f9d] line-through">
                  {formatIDR(price.originalPrice)}
                </span>
                <span className="rounded-full bg-[#c1121f] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
                  -{price.percent}%
                </span>
              </>
            )}
          </div>

          <div className="mt-8 border-t border-[#eef0f4] pt-5">
            <div className="flex items-center gap-3 text-sm font-medium text-[#555b66]">
              <CalendarDays size={16} className="text-[#5f6570]" />
              {date}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}

function getStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "published":
      return {
        badge: "bg-emerald-50/95 text-emerald-800",
        dot: "bg-emerald-500",
      };
    case "pending":
      return {
        badge: "bg-amber-50/95 text-amber-800",
        dot: "bg-amber-500",
      };
    case "full":
      return {
        badge: "bg-sky-50/95 text-sky-800",
        dot: "bg-sky-500",
      };
    case "completed":
      return {
        badge: "bg-violet-50/95 text-violet-800",
        dot: "bg-violet-500",
      };
    default:
      return {
        badge: "bg-white/90 text-[#111827]",
        dot: "bg-[#be123c]",
      };
  }
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) {
    return "Flexible schedule";
  }
  const format = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value))
      : "";
  return [format(start), format(end)].filter(Boolean).join(" - ");
}

function CreateTripCard() {
  return (
    <Link
      href="/trips"
      className="flex min-h-[352px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#e9d9dd] bg-[#fdfbff] px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
        <Plus size={28} />
      </div>
      <div className="mt-7 text-2xl font-semibold tracking-[-0.03em]">
        Create New Trip
      </div>
      <p className="mt-3 max-w-[190px] text-sm leading-6 text-[#777c88]">
        Start planning your next adventure with our autonomous engine.
      </p>
    </Link>
  );
}

function EmptyPackagesState({ error }: { error?: string }) {
  return (
    <div className="mt-12 flex min-h-[360px] items-center justify-center rounded-2xl border-2 border-dashed border-[#e9d9dd] bg-[#fdfbff] px-8 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
          <Plus size={28} />
        </div>
        <h2 className="mt-7 text-3xl font-extrabold tracking-[-0.04em]">
          Belum ada paket trip
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#777c88]">
          {error ||
            "Belum ada paket trip yang cocok dengan filter saat ini. Buat paket baru atau ubah filter kategori."}
        </p>
        <Link
          href="/trips"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#c1121f] px-6 text-sm font-bold text-white shadow-[0_16px_30px_-18px_rgba(193,18,31,0.85)]"
        >
          <Plus size={16} />
          Tambah Trip
        </Link>
      </div>
    </div>
  );
}

function OnDevelopment() {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-[#e9d9dd] bg-[#fdfbff] text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
          <Check size={26} />
        </div>
        <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.04em]">
          On Development
        </h1>
        <p className="mt-3 text-base font-medium text-[#777c88]">
          Dashboard TravelOS sedang dalam pengembangan.
        </p>
      </div>
    </div>
  );
}

function InfoModal({
  type,
  onClose,
}: {
  type: ModalType;
  onClose: () => void;
}) {
  if (!type) {
    return null;
  }

  const title = type === "help" ? "Help" : "Privacy";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-[0_30px_90px_-50px_rgba(17,24,39,0.8)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.03em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f2f7] text-[#535762]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-5 leading-7 text-[#6f7480]">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer
          facilisis, nibh non varius pulvinar, lorem mauris pretium neque, vitae
          posuere justo lectus sed lorem. Donec ac sem sed ipsum gravida
          vestibulum.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 h-11 rounded-lg bg-[#c1121f] px-6 text-sm font-bold text-white"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
