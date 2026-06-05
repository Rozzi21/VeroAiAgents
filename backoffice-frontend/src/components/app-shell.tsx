"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

const publicRoutes = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
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

    setCheckingAuth(false);
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
