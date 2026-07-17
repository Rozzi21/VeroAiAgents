import Link from "next/link";
import {
  CircleHelp,
  Compass,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/api";
import { ActivePanel, ModalType } from "../list/types";

function SidebarItem({
  icon,
  label,
  active,
  subtle,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  subtle?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 w-full items-center gap-4 rounded-xl px-4 text-left text-sm font-semibold transition hover:bg-[#f0d8db]/70 hover:text-[#c1121f]",
        active
          ? "bg-[#f0d8db] text-[#c1121f]"
          : subtle
            ? "text-[#686c78]"
            : "text-[#535762]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-12 w-full items-center gap-4 rounded-xl px-4 text-sm font-semibold transition hover:bg-[#f0d8db]/70 hover:text-[#c1121f]",
        active
          ? "bg-[#f0d8db] text-[#c1121f]"
          : "text-[#535762]"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

type BackofficeSidebarProps =
  | {
      mode: "list";
      activePanel: ActivePanel;
      onPanelChange: (panel: ActivePanel) => void;
      onModalOpen: (type: ModalType) => void;
    }
  | {
      mode: "form";
      onModalOpen: (type: ModalType) => void;
    };

export function BackofficeSidebar(props: BackofficeSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[288px] flex-col bg-[#faf9ff] px-8 py-6 lg:flex">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c1121f] text-sm font-bold text-white">
          T
        </div>
        <div>
          <div className="text-xl font-extrabold leading-none text-[#c1121f]">
            TravelOS
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7b7f8c]">
            Autonomous Engine
          </div>
        </div>
      </Link>

      <nav className="mt-16 space-y-3">
        {props.mode === "list" ? (
          <>
            <SidebarItem
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
              active={props.activePanel === "dashboard"}
              onClick={() => props.onPanelChange("dashboard")}
            />
            <SidebarItem
              icon={<Compass size={18} />}
              label="Trips"
              active={props.activePanel === "trips"}
              onClick={() => props.onPanelChange("trips")}
            />
            <SidebarItem
              icon={<ShoppingCart size={18} />}
              label="Orders"
              active={props.activePanel === "orders"}
              onClick={() => props.onPanelChange("orders")}
            />
          </>
        ) : (
          <>
            <SidebarLink
              href="/"
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
            />
            <SidebarLink
              href="/"
              icon={<Compass size={18} />}
              label="Trips"
              active
            />
            <SidebarLink
              href="/orders"
              icon={<ShoppingCart size={18} />}
              label="Orders"
            />
          </>
        )}
      </nav>

      <div className="mt-auto border-t border-[#eceaf2] pt-6">
        <SidebarItem
          icon={<CircleHelp size={16} />}
          label="Help"
          subtle
          onClick={() => props.onModalOpen("help")}
        />
        <SidebarItem
          icon={<LockKeyhole size={16} />}
          label="Privacy"
          subtle
          onClick={() => props.onModalOpen("privacy")}
        />
        <SidebarItem
          icon={<LogOut size={16} />}
          label="Logout"
          subtle
          onClick={() => {
            void logout();
          }}
        />
      </div>
    </aside>
  );
}
