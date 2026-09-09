"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogOut, User } from "lucide-react";
import {
  customerLogout,
  CustomerProfile,
  ensureCustomerSession,
  fetchCurrentCustomer,
} from "@/lib/api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: CustomerProfile };

// AuthStatus is the single source of "am I signed in?" for the customer UI.
// On mount it renews the access token from the refresh cookie when needed
// (ensureCustomerSession) and then loads the profile via /auth/me. Anonymous
// visitors get Login/Register links; signed-in customers get their name and a
// real logout (revokes the server session, clears the local token, then sends
// the user to /login).
export function AuthStatus() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if ((await ensureCustomerSession()) !== "active") {
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }
      try {
        const user = await fetchCurrentCustomer();
        if (!cancelled) setState({ status: "authenticated", user });
      } catch {
        // Session rejected server-side (revoked/expired) — fall back to the
        // anonymous UI instead of showing a stale identity.
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    // customerLogout revokes the server refresh session AND clears the local
    // token even when the network fails; the full-page navigation then drops
    // every component's in-memory auth state.
    await customerLogout();
    window.location.href = "/login";
  }, [loggingOut]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (state.status === "anonymous") {
    return (
      <div className="grid gap-2 px-2 py-3">
        <Link
          href="/login"
          className="rounded-lg bg-[#df3333] px-3 py-2 text-center text-sm font-bold text-white transition-colors hover:bg-[#c92a2a]"
        >
          Login
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-bold text-slate-700 transition-colors hover:bg-white"
        >
          Create Account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-3 transition-colors hover:border-slate-200 hover:bg-white/60">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-300">
        <User size={16} className="text-slate-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{state.user.name || state.user.email}</p>
        <p className="truncate text-xs text-slate-500">{state.user.email}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        title="Sign out"
        aria-label="Sign out"
        className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-[#c92a2a] disabled:opacity-50"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
