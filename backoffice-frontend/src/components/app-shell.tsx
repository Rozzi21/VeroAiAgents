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

function isPublicRoute(pathname: string) {
  return publicRoutes.includes(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      setCheckingAuth(true);
      setAuthorized(false);

      const publicRoute = isPublicRoute(pathname);
      const hasToken = Boolean(getToken());

      if (!hasToken) {
        if (!publicRoute) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        } else if (!cancelled) {
          setAuthorized(true);
          setCheckingAuth(false);
        }
        return;
      }

      if (pathname === "/login") {
        router.replace("/");
        return;
      }

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

        if (!cancelled) {
          setAuthorized(true);
          setCheckingAuth(false);
        }
      } catch {
        if (cancelled) {
          return;
        }
        clearAuthTokens();
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9ff] text-sm font-bold text-[#6f7480]">
        Memeriksa akses...
      </main>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
