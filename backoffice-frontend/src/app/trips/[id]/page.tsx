"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Hotel,
  MapPin,
  Plane,
  Sparkles,
  Sun,
  Train,
} from "lucide-react";
import { travelCards } from "@/lib/data";

export default function TripDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const trip =
    travelCards.find((item) => item.slug === params.id) ?? travelCards[1];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative min-h-[430px] overflow-hidden rounded-[2.5rem] bg-slate-900 shadow-soft"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${trip.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />
        <div className="relative z-10 flex min-h-[430px] flex-col justify-between p-8 md:p-10">
          <Link
            href="/"
            className="flex w-max items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
          >
            <ArrowLeft size={16} />
            Back to Chat
          </Link>

          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-100">
              <MapPin size={14} />
              {trip.location}
            </div>
            <h1 className="mt-4 text-5xl font-black tracking-tight text-white md:text-7xl">
              {trip.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/80">
              AI-generated premium travel package with tailored hotel
              inventory, transportation planning, budget confidence, and
              booking-ready payment workflow.
            </p>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="space-y-8">
          <div className="grid gap-4 md:grid-cols-4">
            <InfoPill icon={<CalendarDays size={18} />} label="Duration" value={trip.duration} />
            <InfoPill icon={<Sun size={18} />} label="Best Season" value="Oct - Nov" />
            <InfoPill icon={<Train size={18} />} label="Transit" value="Private + Rail" />
            <InfoPill icon={<Sparkles size={18} />} label="AI Match" value={trip.match} />
          </div>

          <section className="glass-card rounded-[2rem] p-7">
            <h2 className="text-2xl font-black">Autonomous Overview</h2>
            <p className="mt-4 text-[15px] leading-8 text-slate-600">
              Based on the user profile, this package prioritizes high-end
              tranquility, culture, food discovery, and low-friction logistics.
              The autonomous engine pre-calculates transfers, hotel quality,
              payment readiness, and post-booking communication.
            </p>
          </section>

          <section className="glass-card rounded-[2rem] p-7">
            <h2 className="text-2xl font-black">Itinerary Timeline</h2>
            <div className="mt-7 space-y-5">
              {[
                ["Days 1 - 3", "Arrival & Coastal Relaxation", "Private airport pickup, boutique check-in, spa ritual, and curated sunset dining."],
                ["Days 4 - 7", "Culture & Heritage Route", "Guided temple access, artisan neighborhoods, local dining, and scenic rail transfer."],
                ["Days 8 - 10", "Farewell & Booking Closure", "Flexible morning activities, invoice generation, and WhatsApp confirmation."],
              ].map(([days, title, text], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="relative rounded-3xl bg-slate-50 p-5 pl-7"
                >
                  <div className="absolute -left-2 top-7 h-4 w-4 rounded-full border-4 border-white bg-primary shadow" />
                  <div className="w-max rounded-full bg-secondary px-3 py-1 text-xs font-black text-red-800">
                    {days}
                  </div>
                  <h3 className="mt-3 text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="glass-card rounded-[2rem] p-7">
            <h2 className="text-2xl font-black">AI Reasoning Panel</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                "Matches cultural preferences and premium dining intent.",
                "Fits the selected budget with controlled hotel inventory.",
                "Weather window is optimal for walkable sightseeing.",
                "Transportation is convenient through rail and private transfers.",
              ].map((reason) => (
                <div
                  key={reason}
                  className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
                >
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-sm font-semibold leading-6 text-slate-600">
                    {reason}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="glass-card sticky top-24 rounded-[2rem] p-7">
            <h2 className="text-2xl font-black">Pricing Breakdown</h2>
            <div className="mt-6 space-y-4">
              <PriceRow icon={<Hotel size={17} />} label="Accommodation" value="$3,200" />
              <PriceRow icon={<Plane size={17} />} label="Flights / Transfer" value="$1,100" />
              <PriceRow icon={<Train size={17} />} label="Local transport" value="$450" />
              <PriceRow icon={<Sparkles size={17} />} label="Curated experiences" value="$650" />
            </div>
            <div className="mt-7 border-t border-slate-200 pt-6">
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-slate-500">Total Estimate</span>
                <span className="text-4xl font-black text-primary">{trip.price}</span>
              </div>
              <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-black text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-red-700">
                <CreditCard size={18} />
                Book This Trip
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function InfoPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="text-primary">{icon}</div>
      <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function PriceRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <span className="font-black">{value}</span>
    </div>
  );
}
