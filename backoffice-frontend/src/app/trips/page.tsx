"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { travelCards } from "@/lib/data";

export default function TripsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-sm font-black uppercase tracking-[0.16em] text-primary">
          Current Trips
        </div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Active AI-Curated Trips
        </h1>
        <p className="mt-3 text-lg text-slate-500">
          Live travel packages generated and monitored by the autonomous engine.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {travelCards.map((trip, index) => (
          <motion.div
            key={trip.slug}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
          >
            <Link
              href={`/trips/${trip.slug}`}
              className="group block overflow-hidden rounded-[2rem] bg-white shadow-soft ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-glow"
            >
              <div
                className="relative h-64 bg-cover bg-center"
                style={{ backgroundImage: `url(${trip.image})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/80">
                    <MapPin size={14} />
                    {trip.location}
                  </div>
                  <h2 className="mt-2 text-3xl font-black">{trip.title}</h2>
                </div>
              </div>
              <div className="p-6">
                <p className="line-clamp-3 text-sm leading-6 text-slate-500">
                  {trip.description}
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <TripMeta icon={<CalendarDays size={16} />} label={trip.duration} />
                  <TripMeta icon={<Sparkles size={16} />} label={`${trip.match} match`} />
                  <TripMeta label={trip.price} />
                </div>
                <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-black text-red-800 transition group-hover:bg-primary group-hover:text-white">
                  Open Detail
                  <ArrowRight size={16} />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TripMeta({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center text-xs font-black text-slate-600">
      <div className="mb-1 flex justify-center text-primary">{icon}</div>
      {label}
    </div>
  );
}
