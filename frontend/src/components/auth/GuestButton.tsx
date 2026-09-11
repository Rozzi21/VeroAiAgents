"use client";

import { useState } from "react";
import { customerLogout } from "@/lib/api";
import { enterGuestMode } from "@/lib/guestMode";

export function GuestButton({ label = "Try As Guest" }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  async function startGuestMode() {
    if (loading) return;
    setLoading(true);
    const destination = await enterGuestMode(customerLogout);
    window.location.replace(destination);
  }

  return (
    <button
      type="button"
      onClick={startGuestMode}
      disabled={loading}
      className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Starting Guest Session..." : label}
    </button>
  );
}
