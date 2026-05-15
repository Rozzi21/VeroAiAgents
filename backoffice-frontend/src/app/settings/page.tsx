import { Settings, ShieldCheck, UserRound } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
          <Settings size={16} />
          Settings
        </div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Operator Preferences
        </h1>
        <p className="mt-3 text-lg text-slate-500">
          Configure profile, automation thresholds, and payment verification rules.
        </p>
      </div>

      <section className="glass-card rounded-[2rem] p-7">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary">
            <UserRound size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black">Agent Profile</h2>
            <p className="text-slate-500">Pro License - autonomous booking enabled</p>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-[2rem] p-7">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-primary" />
          <h2 className="text-2xl font-black">Automation Guardrails</h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {["Manual approval above Rp 25.000.000", "Verify payments before hotel booking", "Send WhatsApp after invoice", "Log every MCP tool call"].map(
            (item) => (
              <div key={item} className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-black/5">
                {item}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
