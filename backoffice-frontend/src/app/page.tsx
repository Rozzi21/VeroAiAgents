 "use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Hotel,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { travelCards, workflowSteps } from "@/lib/data";

export default function Home() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-red-800">
            <Sparkles size={14} />
            Autonomous Travel Operating System
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-[#111827] md:text-6xl">
            AI travel operator for planning, booking, and payments.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-500">
            Manage premium itineraries through an AI copilot that reasons,
            searches inventory, creates payment flows, and tracks bookings in
            realtime.
          </p>
        </motion.div>

        <div className="glass-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-black">Vero Autonomous Engine</div>
                <div className="mt-1 text-xs text-slate-500">
                  Today, 10:42 AM - workspace: Luxury Japan
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-red-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Processing
              </div>
            </div>
          </div>

          <div className="space-y-8 p-6">
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-auto max-w-3xl rounded-[1.75rem] rounded-tr-md bg-[#dfe5ff] px-6 py-5 text-slate-800 shadow-soft"
            >
              Plan a 10-day luxury trip to Japan for two adults. Focus on
              cultural immersion, premium dining, and boutique ryokans.
            </motion.div>

            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                <MessageSquare size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-sm font-black">
                    Vero Travel Agents
                  </span>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-red-800">
                    Autonomous workflow
                  </span>
                </div>

                <WorkflowStrip />

                <p className="mt-6 max-w-4xl text-[15px] leading-8 text-slate-700">
                  I am crafting a premium itinerary around the Golden Route:
                  Tokyo for modern luxury, Kyoto for heritage ryokans, and Bali
                  as a romantic add-on option. The engine is checking hotels,
                  estimating payment readiness, and preparing an order-ready
                  itinerary.
                </p>

                <div className="mt-6 grid gap-5 md:grid-cols-3">
                  {travelCards.map((card, index) => (
                    <motion.div
                      key={card.slug}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                    >
                      <Link
                        href={`/trips/${card.slug}`}
                        className="group block overflow-hidden rounded-[1.75rem] bg-white shadow-soft ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-glow"
                      >
                        <div
                          className="relative h-44 bg-cover bg-center"
                          style={{ backgroundImage: `url(${card.image})` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                          <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-red-800 backdrop-blur">
                            {card.match} Match
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                            <MapPin size={13} />
                            {card.location}
                          </div>
                          <h3 className="mt-2 text-2xl font-black tracking-tight">
                            {card.title}
                          </h3>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                            {card.description}
                          </p>
                          <div className="mt-5 flex items-end justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-400">
                                Est. Price
                              </div>
                              <div className="font-black text-primary">
                                {card.price}
                              </div>
                            </div>
                            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                              {card.duration}
                            </div>
                          </div>
                          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition group-hover:bg-primary group-hover:text-white">
                            View Details
                            <ArrowRight size={16} />
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    "Suggest luxury hotels",
                    "Show budget breakdown",
                    "Create QRIS payment",
                    "Send WhatsApp confirmation",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-red-800 transition hover:-translate-y-0.5 hover:bg-red-100"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-slate-200/70 bg-white/80 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-soft ring-1 ring-black/5">
              <button className="rounded-2xl bg-slate-100 p-3 text-slate-500">
                <Plus size={18} />
              </button>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Instruct the autonomous engine..."
              />
              <button className="rounded-2xl bg-primary p-3 text-white shadow-glow">
                <Send size={18} />
              </button>
            </div>
            <div className="mt-3 text-center text-xs font-medium text-slate-400">
              Vero Travel Agents Engine v2.4 - Shift + Enter for new line
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <RightPanelCard title="Live AI Status">
          <div className="space-y-4">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary">
                  {index < 4 ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-800">{step}...</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: index < 4 ? "100%" : "48%" }}
                      transition={{ duration: 1.2, delay: index * 0.12 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </RightPanelCard>

        <RightPanelCard title="Order Preview">
          <div className="space-y-4">
            <MiniMetric icon={<Hotel size={17} />} label="Hotel inventory" value="18 options" />
            <MiniMetric icon={<CreditCard size={17} />} label="Payment rail" value="QRIS + VA" />
            <MiniMetric icon={<Sparkles size={17} />} label="AI success score" value="99.2%" />
            <button className="mt-2 w-full rounded-2xl bg-primary py-3 text-sm font-black text-white shadow-glow">
              Initialize Booking
            </button>
          </div>
        </RightPanelCard>
      </aside>
    </div>
  );
}

function WorkflowStrip() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {["Analyzing Preferences", "Structuring Route", "Sourcing Luxury Inventory"].map(
        (item, index) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="rounded-2xl border border-red-100 bg-secondary/60 p-4"
          >
            <div className="flex items-center justify-between">
              <Sparkles size={15} className="text-primary" />
              <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
            </div>
            <div className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-red-900">
              {item}
            </div>
          </motion.div>
        )
      )}
    </div>
  );
}

function RightPanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card rounded-[2rem] p-6"
    >
      <h2 className="mb-5 text-lg font-black">{title}</h2>
      {children}
    </motion.div>
  );
}

function MiniMetric({
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
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
          {icon}
        </div>
        <span className="text-sm font-semibold text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}
