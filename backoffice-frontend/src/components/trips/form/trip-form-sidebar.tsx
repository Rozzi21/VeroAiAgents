import Link from "next/link";
import {
  CircleHelp,
  Compass,
  LayoutDashboard,
  LockKeyhole,
  Plus,
} from "lucide-react";

function SidebarLink({
  href,
  icon,
  label,
  active,
  muted,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex h-10 items-center gap-3 rounded-lg px-3 text-xs font-semibold",
        active
          ? "bg-[#f0d8db] text-[#c1121f]"
          : muted
            ? "text-[#69707c]"
            : "text-[#535762]",
      ].join(" ")}
    >
      {icon}
      {label}
    </Link>
  );
}

export function TripFormSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[188px] flex-col bg-[#faf9ff] px-5 py-6 lg:flex">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9272e] text-sm font-black text-white">
          T
        </div>
        <div>
          <div className="text-lg font-extrabold leading-none text-[#c1121f]">
            TravelOS
          </div>
          <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#7b7f8c]">
            Create AI Trips
          </div>
        </div>
      </Link>

      <Link
        href="/trips"
        className="mt-7 flex h-10 items-center justify-center gap-2 rounded-lg bg-[#e9272e] text-xs font-bold text-white shadow-[0_16px_28px_-20px_rgba(233,39,46,0.9)]"
      >
        <Plus size={14} />
        New Trip
      </Link>
      <Link
        href="/login"
        className="mt-3 flex h-10 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#e9272e] ring-1 ring-[#f0d8db]"
      >
        Login
      </Link>

      <nav className="mt-8 space-y-2">
        <SidebarLink href="/" icon={<LayoutDashboard size={14} />} label="Dashboard" />
        <SidebarLink href="/trips" icon={<Compass size={14} />} label="Trips" active />
      </nav>

      <div className="mt-auto border-t border-[#eceaf2] pt-5">
        <SidebarLink href="/" icon={<CircleHelp size={14} />} label="Help" muted />
        <SidebarLink href="/" icon={<LockKeyhole size={14} />} label="Privacy" muted />
      </div>
    </aside>
  );
}
