"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Compass, History, Bookmark, Settings, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthStatus } from "@/components/auth/AuthStatus";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      if (isOpen) {
        sidebar.removeAttribute("inert");
      } else {
        sidebar.setAttribute("inert", "");
      }
    }

    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  if (isAuthPage) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed left-5 top-5 z-40 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 text-slate-700 shadow-[0_12px_35px_-18px_rgba(15,23,42,0.5)] backdrop-blur transition hover:border-rose-200 hover:text-[#c92a2a]",
          isOpen && "pointer-events-none opacity-0"
        )}
        aria-label="Buka menu utama"
        aria-expanded={isOpen}
      >
        <Menu size={20} />
      </button>

      <button
        type="button"
        tabIndex={isOpen ? 0 : -1}
        disabled={!isOpen}
        aria-hidden={!isOpen}
        aria-label="Tutup menu utama"
        onClick={() => setIsOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px] transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        ref={sidebarRef}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col justify-between border-r border-white/70 bg-[#f6f4f4]/95 px-5 py-6 shadow-[24px_0_70px_-35px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-hidden={!isOpen}
        aria-label="Menu utama"
      >
        <div>
          <div className="mb-8 flex items-start justify-between px-2">
            <div>
              <h1 className="text-xl font-bold text-[#c92a2a] tracking-tight">Vero Travel</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">AI Travel Assistant</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
              aria-label="Tutup menu utama"
            >
              <X size={18} />
            </button>
          </div>

          <Link href="/" className="w-full bg-[#df3333] hover:bg-[#c92a2a] text-white rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-medium transition-colors shadow-sm mb-8">
            <Plus size={18} />
            New Chat
          </Link>

          <nav className="space-y-2">
            <NavItem href="/" icon={<Compass size={18} />} label="Current Trip" active />
            <NavItem href="#" icon={<History size={18} />} label="Past Journeys" />
            <NavItem href="#" icon={<Bookmark size={18} />} label="Saved Places" />

            <div className="pt-8">
              <NavItem href="#" icon={<Settings size={18} />} label="Settings" />
            </div>
          </nav>
        </div>

        {/* Signed-in identity + logout, or Login/Register links for guests.
            Client component: resolves the session from the refresh cookie. */}
        <AuthStatus />
      </aside>
    </>
  );
}

function NavItem({ icon, label, href, active = false }: { icon: React.ReactNode; label: string; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
        active
          ? "bg-[#eadddd] text-[#a41e1e]"
          : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
