"use client";

import { useEffect, useState } from "react";
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const isPublicRoute = publicRoutes.includes(pathname);
      const hasToken = Boolean(getToken());

      if (!hasToken && !isPublicRoute) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      if (hasToken && pathname === "/login") {
        router.replace("/");
        return;
      }

      if (hasToken && !isPublicRoute) {
        try {
          const user = await fetchCurrentUser();
          if (cancelled) {
            return;
          }

          if (!isBackofficeRole(user.role)) {
            await logout({ redirect: false });
            router.replace("/login?reason=no-access");
            return;
          }

          setAuthSession(getToken(), user.role);
          startAuthRefreshScheduler();
        } catch {
          if (cancelled) {
            return;
          }
          clearAuthTokens();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
      }

      if (!cancelled) {
        setCheckingAuth(false);
      }
    }

    setCheckingAuth(true);
    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9ff] text-sm font-bold text-[#6f7480]">
        Checking access...
      </main>
    );
  }

  return <>{children}</>;
}
