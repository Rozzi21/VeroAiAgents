"use client";

import { motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  CircleDot,
  Code2,
  PlayCircle,
  Terminal,
  Workflow,
} from "lucide-react";

const logs = [
  ["PROMPT", "Trip to Japan for 10 days"],
  ["REASON", "Identify premium cultural itinerary with manageable budget envelope."],
  ["TOOL", "search_hotel(location='Kyoto', tier='boutique_ryokan')"],
  ["TOOL", "generate_itinerary(days=10, interests=['culture','dining'])"],
  ["TOOL", "create_payment(methods=['QRIS','VirtualAccount'])"],
  ["STATUS", "SUCCESS"],
];

const workflow = [
  "Search destination",
  "Generate itinerary",
  "Calculate budget",
  "Create payment",
  "Send confirmation",
];

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
          <Terminal size={16} />
          AI Logs Panel
        </div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Workflow Monitoring
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-500">
          Observe user prompts, reasoning, MCP tool calls, workflow execution,
          and autonomous agent activity.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[2rem] bg-[#111827] p-7 text-white shadow-soft">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
                <Terminal size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black">Agent Execution Stream</h2>
                <p className="text-sm text-white/50">MCP + reasoning + actions</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-black text-red-200">
              <CircleDot size={14} className="animate-pulse text-primary" />
              LIVE
            </div>
          </div>

          <div className="mt-6 space-y-5 font-mono text-sm">
            {logs.map(([type, text], index) => (
              <motion.div
                key={`${type}-${text}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="grid gap-3 md:grid-cols-[110px_1fr]"
              >
                <span className="font-black text-primary">[{type}]</span>
                <span className="text-white/75">{text}</span>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="glass-card rounded-[2rem] p-7">
            <div className="flex items-center gap-3">
              <Workflow size={20} className="text-primary" />
              <h2 className="text-xl font-black">Workflow Status</h2>
            </div>
            <div className="mt-6 space-y-4">
              {workflow.map((item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 size={19} className="text-green-600" />
                  <div className="flex-1">
                    <div className="text-sm font-black">{item}</div>
                    <div className="text-xs text-slate-500">
                      Step {index + 1} completed by autonomous engine
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-green-50 px-4 py-3 text-sm font-black text-green-700">
              STATUS: SUCCESS
            </div>
          </div>

          <div className="glass-card rounded-[2rem] p-7">
            <h2 className="text-xl font-black">Tool Call Summary</h2>
            <div className="mt-5 space-y-3">
              {[
                ["search_hotel()", "183ms"],
                ["generate_itinerary()", "411ms"],
                ["create_payment()", "205ms"],
              ].map(([tool, latency]) => (
                <div key={tool} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center gap-3">
                    <Code2 size={17} className="text-primary" />
                    <span className="font-mono text-sm font-black">{tool}</span>
                  </div>
                  <span className="text-xs font-black text-slate-400">{latency}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="glass-card rounded-[2rem] p-7">
        <h2 className="text-2xl font-black">Autonomous Agent Activity</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ActivityCard icon={<Bot />} title="Reasoning" text="Budget and preference constraints resolved." />
          <ActivityCard icon={<PlayCircle />} title="Execution" text="Booking workflow prepared for operator approval." />
          <ActivityCard icon={<CheckCircle2 />} title="Output" text="Itinerary, payment, and confirmation generated." />
        </div>
      </section>
    </div>
  );
}

function ActivityCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="text-primary">{icon}</div>
      <div className="mt-4 text-lg font-black">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
