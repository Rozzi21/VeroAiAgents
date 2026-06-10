"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAuthTokens,
  fetchCurrentUser,
  getToken,
  isBackofficeRole,
  logout,
  setAuthSession,
  startAuthRefreshScheduler,
} from "@/lib/api";

const publicRoutes = ["/login"];

type AuthState = "loading" | "authenticated" | "unauthenticated";

function isPublicRoute(pathname: string) {
  return publicRoutes.includes(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    let active = true;

    async function verifySession() {
      const hasToken = Boolean(getToken());

      if (!hasToken) {
        if (active) {
          setAuthState("unauthenticated");
        }
        return;
      }

      try {
        const user = await fetchCurrentUser();
        if (!active) {
          return;
        }

        if (!isBackofficeRole(user.role)) {
          await logout({ redirect: false });
          setAuthState("unauthenticated");
          return;
        }

        setAuthSession(getToken(), user.role);
        startAuthRefreshScheduler();
        setAuthState("authenticated");
      } catch {
        if (!active) {
          return;
        }
        clearAuthTokens();
        setAuthState("unauthenticated");
      }
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState === "loading") {
      return;
    }

    const publicRoute = isPublicRoute(pathname);

    if (authState === "unauthenticated" && !publicRoute) {
      routerRef.current.replace(
        `/login?redirect=${encodeURIComponent(pathname)}`
      );
      return;
    }

    if (authState === "authenticated" && pathname === "/login") {
      routerRef.current.replace("/");
    }
  }, [authState, pathname]);

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9ff] text-sm font-bold text-[#6f7480]">
        Memeriksa akses...
      </main>
    );
  }

  if (authState === "unauthenticated" && !isPublicRoute(pathname)) {
    return null;
  }

  return <>{children}</>;
}
