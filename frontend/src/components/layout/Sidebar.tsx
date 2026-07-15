import Link from "next/link";
import { Plus, Compass, History, Bookmark, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-[#f3f4f9] border-r border-slate-200 flex flex-col justify-between py-6 px-4 shrink-0">
      <div>
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold text-[#c92a2a] tracking-tight">Vero Travel</h1>
          <p className="text-xs text-slate-500 font-medium tracking-wide">AI Assistant</p>
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

      <div className="flex items-center gap-3 px-2 py-3 hover:bg-white/60 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200">
        <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center overflow-hidden">
          <User size={16} className="text-slate-600" />
        </div>
        <span className="text-sm font-medium text-slate-700">My Profile</span>
      </div>
    </aside>
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
