"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Bot,
  CalendarCheck,
  CircleDot,
  DollarSign,
  Plane,
} from "lucide-react";

const chartPoints = [22, 30, 42, 58, 66, 72, 88];

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.16em] text-primary">
            Admin Analytics Dashboard
          </div>
          <h1 className="mt-4 text-5xl font-black tracking-tight">
            Platform Overview
          </h1>
          <p className="mt-3 text-lg text-slate-500">
            Real-time telemetry from the autonomous booking engine.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-secondary px-4 py-2 text-sm font-black text-red-800">
            Engine Online
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-bold shadow-soft ring-1 ring-black/5">
            Last 7 Days
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric title="Total Bookings" value="1,248" change="+12%" icon={<CalendarCheck />} />
        <Metric title="Gross Revenue" value="$342.5k" change="+8%" icon={<DollarSign />} />
        <Metric title="Active Trips" value="84" change="-0%" icon={<Plane />} />
        <Metric title="AI Usage" value="18.2k" change="+31%" icon={<Bot />} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="glass-card rounded-[2rem] p-7">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black">Revenue Trajectory</h2>
              <p className="mt-1 text-slate-500">
                Cumulative gross revenue vs target trajectory.
              </p>
            </div>
            <ArrowUpRight className="text-primary" />
          </div>

          <div className="mt-8 h-72">
            <div className="relative h-full rounded-3xl bg-gradient-to-b from-slate-50 to-white p-6">
              <div className="absolute inset-x-6 top-8 h-px bg-slate-200" />
              <div className="absolute inset-x-6 top-1/3 h-px bg-slate-200" />
              <div className="absolute inset-x-6 top-2/3 h-px bg-slate-200" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                {chartPoints.map((height, index) => (
                  <div key={index} className="flex h-52 flex-col items-center justify-end gap-3">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ delay: index * 0.08, duration: 0.7 }}
                      className="w-3 rounded-full bg-primary shadow-glow"
                    />
                    <span className="text-xs font-bold text-slate-400">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-[#111827] p-7 text-white shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black">Engine Telemetry</h2>
            <div className="flex items-center gap-2 text-xs font-black text-red-200">
              <CircleDot size={14} className="animate-pulse text-primary" />
              LIVE
            </div>
          </div>
          <div className="mt-8 space-y-5 font-mono text-xs text-white/70">
            {[
              "14:02:11 EXEC call_tool(search_hotel)",
              "14:02:14 INFO parsing inventory signals",
              "14:02:18 EXEC generate_itinerary()",
              "14:02:22 SUCCESS payment_intent.created",
            ].map((line) => (
              <div key={line} className="border-l-2 border-primary pl-4">
                {line}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="glass-card rounded-[2rem] p-7">
        <h2 className="text-2xl font-black">Recent Customer Activity</h2>
        <div className="mt-6 divide-y divide-slate-100">
          {[
            ["Michael Chen", "Kyoto, Japan (7 Days)", "$4,250.00", "Confirmed"],
            ["Sarah Anderson", "Amalfi Coast, Italy (10 Days)", "$8,900.00", "Confirmed"],
            ["Emma Roberts", "Reykjavik, Iceland (5 Days)", "$3,120.00", "Processing"],
          ].map(([name, trip, value, status]) => (
            <div key={name} className="grid gap-3 py-4 md:grid-cols-4">
              <div>
                <div className="font-black">{name}</div>
                <div className="text-sm text-slate-500">{trip}</div>
              </div>
              <div className="font-bold text-slate-500">Today</div>
              <div className="font-black">{value}</div>
              <div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-black text-red-800">
                  {status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  change,
  icon,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-[2rem] p-6"
    >
      <div className="flex items-center justify-between">
        <div className="text-primary">{icon}</div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-black text-red-800">
          {change}
        </span>
      </div>
      <div className="mt-5 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
        {title}
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </motion.div>
  );
}
