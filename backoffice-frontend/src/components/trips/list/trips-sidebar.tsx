import {
  CircleHelp,
  Compass,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/api";
import { ActivePanel, ModalType } from "./types";

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

type TripsSidebarProps = {
  activePanel: ActivePanel;
  onPanelChange: (panel: ActivePanel) => void;
  onModalOpen: (type: ModalType) => void;
};

export function TripsSidebar({
  activePanel,
  onPanelChange,
  onModalOpen,
}: TripsSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[288px] flex-col bg-[#faf9ff] px-8 py-6 lg:flex">
      <div className="flex items-center gap-3">
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
      </div>

      <nav className="mt-16 space-y-3">
        <SidebarItem
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          active={activePanel === "dashboard"}
          onClick={() => onPanelChange("dashboard")}
        />
        <SidebarItem
          icon={<Compass size={18} />}
          label="Trips"
          active={activePanel === "trips"}
          onClick={() => onPanelChange("trips")}
        />
      </nav>

      <div className="mt-auto border-t border-[#eceaf2] pt-6">
        <SidebarItem
          icon={<CircleHelp size={16} />}
          label="Help"
          subtle
          onClick={() => onModalOpen("help")}
        />
        <SidebarItem
          icon={<LockKeyhole size={16} />}
          label="Privacy"
          subtle
          onClick={() => onModalOpen("privacy")}
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
