"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Mail,
  Phone,
  ReceiptText,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { orders } from "@/lib/data";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  PAID: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-blue-50 text-blue-700",
};

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
            <ReceiptText size={16} />
            Booking Management
          </div>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Orders</h1>
          <p className="mt-3 text-lg text-slate-500">
            Manage and track autonomous agent bookings in one premium command center.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-full bg-white p-3 shadow-soft ring-1 ring-black/5">
          <Search size={18} className="text-primary" />
          <input
            className="w-72 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Filter by name, status, or date..."
          />
          <button className="rounded-full bg-slate-100 p-2 text-slate-600">
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {orders.map((order, index) => (
          <motion.article
            key={order.id}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="glass-card rounded-[2rem] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-glow"
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                Ref: #{order.id}
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-black",
                  statusStyles[order.paymentStatus]
                )}
              >
                {order.paymentStatus}
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-black leading-tight">
              {order.packageName}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {order.destination} - {order.duration}
            </p>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <UserRound size={18} />
              </div>
              <div>
                <div className="font-black">{order.customer}</div>
                <div className="text-sm text-slate-500">{order.email}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
              <OrderMeta icon={<CalendarDays size={15} />} label="Schedule" value={order.schedule} />
              <OrderMeta label="Total" value={order.total} />
              <OrderMeta label="Order" value={order.orderStatus} />
              <OrderMeta label="Booked" value={order.bookingDate} />
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Phone size={15} />
                {order.phone}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Mail size={15} />
                {order.email}
              </div>
            </div>

            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-black text-red-800 transition hover:bg-primary hover:text-white">
              View Details
              <ArrowRight size={16} />
            </button>
          </motion.article>
        ))}
      </div>

      <section className="mt-10 glass-card rounded-[2rem] p-7">
        <h2 className="text-2xl font-black">Order Status Flow</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          {["Pending", "Waiting Payment", "Paid", "Processing", "Completed"].map(
            (step, index) => (
              <div key={step} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-black text-primary">
                  {index + 1}
                </div>
                <div className="text-sm font-black">{step}</div>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function OrderMeta({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold text-slate-700">{value}</div>
    </div>
  );
}
