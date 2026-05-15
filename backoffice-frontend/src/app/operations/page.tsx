"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDot,
  CreditCard,
  Terminal,
  Users,
} from "lucide-react";

const timelineItems = [
  {
    time: "Just now",
    title: "Payment Received",
    desc: "ID #8829 - Rp 4.800.000 via QRIS",
    status: "success",
  },
  {
    time: "2 min ago",
    title: "Booking Hotel",
    desc: "Autonomous engine checking villa inventory...",
    status: "processing",
  },
  {
    time: "5 min ago",
    title: "Generating Itinerary",
    desc: "Bali Honeymoon Package - 3 Days 2 Nights",
    status: "success",
  },
  {
    time: "12 min ago",
    title: "Sending WhatsApp Confirmation",
    desc: "Message delivered to +62 812-3456-7890",
    status: "success",
  },
  {
    time: "18 min ago",
    title: "MCP Tool Called",
    desc: "search_hotels(destination='Bali', type='villa')",
    status: "info",
  },
] as const;

const logs = [
  ["USER", "Create a Bali honeymoon package for John Doe, June 12 - June 15."],
  ["THINK", "Analyzing customer intent, preferred date range, and couple-friendly inventory."],
  ["MCP_CALL", "server: hotel-api, tool: search_hotels(destination='Bali', tier='premium')"],
  ["MCP_RES", "Found 18 matching villas with private pool availability."],
  ["THINK", "Budget fits Rp 4.800.000 envelope with curated experiences and transfer buffer."],
  ["MCP_CALL", "server: payment-api, tool: create_qris_payment(amount=4800000)"],
  ["ACTION", "Booking workflow queued for operator approval."],
  ["UI_UPDATE", "Pushing order status and payment verification to dashboard."],
] as const;

export default function OperationsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col justify-between gap-5 md:flex-row md:items-end"
      >
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
            <Activity size={16} />
            AI Operations
          </div>
          <h1 className="mt-4 text-5xl font-black tracking-tight">
            AI Operations Center
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-500">
            Monitor autonomous booking, payment, itinerary generation, tool
            calls, and customer communication from one operator console.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm font-black text-green-700 ring-1 ring-green-100">
          <CircleDot size={14} className="animate-pulse" />
          System Healthy
        </div>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-4">
        <StatCard
          title="Active AI Sessions"
          value="142"
          icon={<Bot size={20} />}
          trend="+12% today"
        />
        <StatCard
          title="Autonomous Bookings"
          value="28"
          icon={<Activity size={20} />}
          trend="+3 in last hr"
        />
        <StatCard
          title="Payments Processed"
          value="Rp 42.5jt"
          icon={<CreditCard size={20} />}
          trend="QRIS/VA active"
        />
        <StatCard
          title="Users Managed"
          value="1,204"
          icon={<Users size={20} />}
          trend="+54 new"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
        <section className="glass-card flex h-[640px] flex-col rounded-[2rem] p-6">
          <h2 className="mb-6 flex items-center gap-2 text-lg font-black">
            <Activity size={18} className="text-primary" />
            Live Execution Timeline
          </h2>

          <div className="flex-1 space-y-6 overflow-y-auto pr-2">
            {timelineItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <StatusDot status={item.status} />
                  <div className="mt-2 h-full w-px bg-slate-200" />
                </div>
                <div className="pb-6">
                  <div className="mb-1 text-xs font-black text-primary">
                    {item.time}
                  </div>
                  <h3 className="text-sm font-black">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="flex h-[640px] flex-col rounded-[2rem] bg-[#111827] p-6 text-white shadow-soft">
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-5">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Terminal size={18} className="text-primary" />
              Agent Reasoning Logs
            </h2>
            <div className="flex gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-green-500" />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-2 font-mono text-sm">
            {logs.map(([type, text], index) => (
              <motion.div
                key={`${type}-${text}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="grid gap-3 leading-relaxed md:grid-cols-[110px_1fr]"
              >
                <span className="font-black text-primary">[{type}]</span>
                <span className="text-white/75">{text}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  trend,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-[2rem] p-6"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="rounded-2xl bg-secondary p-3 text-primary">{icon}</div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-black/5">
          {trend}
        </span>
      </div>
      <h3 className="text-sm font-bold text-slate-500">{title}</h3>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </motion.div>
  );
}

function StatusDot({
  status,
}: {
  status: "success" | "processing" | "info";
}) {
  if (status === "success") {
    return <CheckCircle2 size={18} className="mt-1 text-green-600" />;
  }

  return (
    <span
      className={`mt-2 h-3 w-3 rounded-full ${
        status === "processing"
          ? "animate-pulse bg-amber-500"
          : "bg-blue-500"
      }`}
    />
  );
}
