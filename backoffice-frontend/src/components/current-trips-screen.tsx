"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

type Category = "international" | "local";
type ViewMode = "grid" | "list";
type ActivePanel = "trips" | "dashboard";
type ModalType = "help" | "privacy" | null;

const hasPublishedPackages = false;

const trips = [
  {
    title: "Kyoto, Japan",
    meta: "7 Days - 10 Slots",
    date: "Oct 12 - Oct 19, 2024",
    status: "Active",
    statusColor: "bg-[#be123c]",
    imageClass: "from-[#102b35] via-[#2f9aad] to-[#a7dee3]",
    category: "international",
  },
  {
    title: "Amalfi Coast, Italy",
    meta: "10 Days - 8 Slots",
    date: "Nov 02 - Nov 12, 2024",
    status: "Upcoming",
    statusColor: "bg-[#111827]",
    imageClass: "from-[#3d8790] via-[#aee6de] to-[#e7fff7]",
    category: "international",
  },
  {
    title: "Reykjavik, Iceland",
    meta: "5 Days - 12 Slots",
    date: "Dec 15 - Dec 20, 2024",
    status: "Planning",
    statusColor: "bg-[#0f6b9d]",
    imageClass: "from-[#062b27] via-[#2f8f91] to-[#dae8de]",
    category: "international",
  },
  {
    title: "Bali, Indonesia",
    meta: "3 Days - 20 Slots",
    date: "Jun 12 - Jun 15, 2024",
    status: "Active",
    statusColor: "bg-[#be123c]",
    imageClass: "from-[#285943] via-[#77b255] to-[#f2e7c9]",
    category: "local",
  },
  {
    title: "Labuan Bajo",
    meta: "4 Days - 14 Slots",
    date: "Jul 04 - Jul 08, 2024",
    status: "Upcoming",
    statusColor: "bg-[#111827]",
    imageClass: "from-[#15324a] via-[#2f8db8] to-[#f7b267]",
    category: "local",
  },
] satisfies Array<{
  title: string;
  meta: string;
  date: string;
  status: string;
  statusColor: string;
  imageClass: string;
  category: Category;
}>;

export function CurrentTripsScreen() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("trips");
  const [category, setCategory] = useState<Category>("international");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalType>(null);

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchesCategory = trip.category === category;
      const matchesQuery = trip.title.toLowerCase().includes(query.toLowerCase());

      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

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

            {hasPublishedPackages ? (
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
              <EmptyPackagesState />
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
  title,
  meta,
  date,
  status,
  statusColor,
  imageClass,
  viewMode,
}: {
  title: string;
  meta: string;
  date: string;
  status: string;
  statusColor: string;
  imageClass: string;
  viewMode: ViewMode;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-45px_rgba(17,24,39,0.75)]",
        viewMode === "list" && "grid md:grid-cols-[300px_minmax(0,1fr)]"
      )}
    >
      <div
        className={cn(
          "relative bg-gradient-to-br",
          viewMode === "grid" ? "h-[192px]" : "min-h-[220px]",
          imageClass
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.7),transparent_18rem)] opacity-50" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#111827]">
          <span className={cn("h-2 w-2 rounded-full", statusColor)} />
          {status}
        </div>
      </div>

      <div className="p-6">
        <h2 className="whitespace-pre-line text-2xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#171923]">
          {title}
        </h2>
        <p className="mt-2 text-sm font-medium text-[#8a8f9d]">{meta}</p>

        <div className="mt-8 border-t border-[#eef0f4] pt-5">
          <div className="flex items-center gap-3 text-sm font-medium text-[#555b66]">
            <CalendarDays size={16} className="text-[#5f6570]" />
            {date}
          </div>
        </div>
      </div>
    </article>
  );
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

function EmptyPackagesState() {
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
          Card trip masih disembunyikan. Nanti komponen card akan dipanggil
          lagi setelah paket berhasil dibuat.
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
