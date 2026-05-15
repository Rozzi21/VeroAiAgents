"use client";

import { motion } from "framer-motion";
import {
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  QrCode,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { payments } from "@/lib/data";

export default function PaymentsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
          <CreditCard size={16} />
          Payment Monitoring
        </div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Live Payment Console
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-500">
          Monitor QRIS, virtual account, verification, payment countdowns, and
          transaction logs from autonomous booking workflows.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PaymentRail
          icon={<QrCode size={24} />}
          title="QRIS Payments"
          value="Rp 42.800.000"
          status="Instant verification active"
        />
        <PaymentRail
          icon={<Banknote size={24} />}
          title="Virtual Account"
          value="Rp 68.500.000"
          status="3 payments waiting"
        />
        <PaymentRail
          icon={<ShieldCheck size={24} />}
          title="Success Rate"
          value="99.2%"
          status="Last 7 days"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass-card rounded-[2rem] p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black">Transaction Logs</h2>
            <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-black text-green-700">
              <Radio size={14} className="animate-pulse" />
              Realtime
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {payments.map((payment, index) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="grid gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 md:grid-cols-[1.2fr_1fr_1fr_1fr]"
              >
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                    {payment.id}
                  </div>
                  <div className="mt-1 font-black">{payment.customer}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Method</div>
                  <div className="font-bold">{payment.method}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Amount</div>
                  <div className="font-black text-primary">{payment.amount}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">{payment.time}</div>
                  <div className="font-bold text-slate-700">{payment.status}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-[2rem] p-7">
          <h2 className="text-2xl font-black">Verification Flow</h2>
          <div className="mt-6 space-y-5">
            {[
              ["Payment link created", "Completed"],
              ["Customer opened QRIS", "Completed"],
              ["Payment received", "Live"],
              ["Booking confirmation", "Queued"],
              ["Invoice + WhatsApp sent", "Queued"],
            ].map(([title, status], index) => (
              <div key={title} className="flex gap-4">
                <div className="mt-1">
                  {index < 2 ? (
                    <CheckCircle2 size={20} className="text-green-600" />
                  ) : (
                    <Clock3 size={20} className="text-primary" />
                  )}
                </div>
                <div>
                  <div className="font-black">{title}</div>
                  <div className="text-sm text-slate-500">{status}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 rounded-3xl bg-[#111827] p-5 text-white">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-red-100">
              Payment Countdown
            </div>
            <div className="mt-3 text-4xl font-black">14:58</div>
            <div className="mt-2 text-sm text-white/60">
              Waiting VA settlement from Sarah Williams.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PaymentRail({
  icon,
  title,
  value,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  status: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-[2rem] p-6"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
        {icon}
      </div>
      <div className="mt-5 text-sm font-bold text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      <div className="mt-4 text-xs font-bold text-primary">{status}</div>
    </motion.div>
  );
}
