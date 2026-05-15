"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Bot,
  Compass,
  CreditCard,
  LayoutDashboard,
  Logs,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trips", label: "Current Trips", icon: Compass },
  { href: "/orders", label: "Orders", icon: ReceiptText },
  { href: "/saved", label: "Saved Destinations", icon: Bookmark },
  { href: "/payments", label: "Payment Monitoring", icon: CreditCard },
  { href: "/logs", label: "AI Logs", icon: Logs },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen overflow-hidden text-[#111827]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-[290px] shrink-0 border-r border-slate-200/80 bg-white/70 px-6 py-6 backdrop-blur-xl lg:flex lg:flex-col">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-glow">
          <Bot size={22} />
        </div>
        <div>
          <div className="text-xl font-black tracking-tight text-primary">
            Vero Travel Agents
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            AI Travel Operator
          </div>
        </div>
      </Link>

      <Link
        href="/"
        className="mt-10 flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-red-700"
      >
        <Plus size={18} />
        New Chat
      </Link>

      <nav className="mt-8 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                active
                  ? "bg-secondary text-red-800 shadow-sm"
                  : "text-slate-500 hover:bg-white hover:text-slate-900"
              )}
            >
              <Icon size={18} className={active ? "text-primary" : "text-slate-400"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-5 border-t border-slate-200 pt-6">
        <div className="rounded-3xl bg-[#111827] p-4 text-white shadow-soft">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-100">
            <Sparkles size={14} />
            Live autonomous engine
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: "18%" }}
              animate={{ width: ["18%", "78%", "42%", "92%"] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">
            <UserRound size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">Agent Profile</div>
            <div className="text-xs text-slate-500">Pro License</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Shield size={14} />
          Enterprise-grade operator console
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/70 bg-white/65 px-6 backdrop-blur-xl lg:px-10">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white">
          <Bot size={20} />
        </div>
        <div className="font-black text-primary">Vero Travel Agents</div>
      </div>

      <div className="hidden items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft ring-1 ring-black/5 md:flex">
        <Search size={18} className="text-slate-400" />
        <input
          className="w-72 bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Search orders, trips, prompts..."
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="rounded-2xl bg-white p-3 text-slate-600 shadow-soft ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:text-primary">
          <Bell size={18} />
        </button>
        <button className="hidden rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-soft ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:text-primary sm:block">
          Share
        </button>
        <button className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-red-700">
          Execute Plan
        </button>
      </div>
    </header>
  );
}
