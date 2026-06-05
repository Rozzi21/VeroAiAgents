"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, assetURL, getToken, TripPackage } from "@/lib/api";

type Category = "all" | "international" | "local";
type ViewMode = "grid" | "list";
type ActivePanel = "trips" | "dashboard";
type ModalType = "help" | "privacy" | null;

export function CurrentTripsScreen() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("trips");
  const [category, setCategory] = useState<Category>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [packages, setPackages] = useState<TripPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    const hasToken = Boolean(getToken());
    const path = hasToken
      ? `/api/v1/admin/packages?${params.toString()}`
      : `/api/v1/packages?${params.toString()}`;

    apiFetch<TripPackage[]>(path, {}, hasToken)
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
                  <TripCard key={trip.title} viewMode={viewMode} {...trip} />
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
  id,
  title,
  status,
  duration,
  slots,
  package_start_date,
  package_end_date,
  image_url,
  media,
  viewMode,
}: {
  id: string;
  title: string;
  status: string;
  duration: string;
  slots: number;
  package_start_date?: string;
  package_end_date?: string;
  image_url?: string;
  media?: Array<{ url: string }>;
  viewMode: ViewMode;
}) {
  const image = assetURL(image_url || media?.[0]?.url);
  const date = formatDateRange(package_start_date, package_end_date);
  return (
    <Link
      href={`/trips/${id}`}
      className={cn(
        "overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-45px_rgba(17,24,39,0.75)]",
        viewMode === "list" && "grid md:grid-cols-[300px_minmax(0,1fr)]"
      )}
    >
      <div
        className={cn("relative bg-gradient-to-br from-[#102b35] via-[#2f9aad] to-[#a7dee3]", viewMode === "grid" ? "h-[192px]" : "min-h-[220px]")}
        style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.7),transparent_18rem)] opacity-50" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#111827]">
          <span className="h-2 w-2 rounded-full bg-[#be123c]" />
          {status}
        </div>
      </div>

      <div className="p-6">
        <h2 className="whitespace-pre-line text-2xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#171923]">
          {title}
        </h2>
        <p className="mt-2 text-sm font-medium text-[#8a8f9d]">
          {duration || "Flexible"} - {slots || 0} Slots
        </p>

        <div className="mt-8 border-t border-[#eef0f4] pt-5">
          <div className="flex items-center gap-3 text-sm font-medium text-[#555b66]">
            <CalendarDays size={16} className="text-[#5f6570]" />
            {date}
          </div>
        </div>
      </div>
    </Link>
  );
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
