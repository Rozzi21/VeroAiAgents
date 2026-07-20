"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, LockKeyhole, UserRound } from "lucide-react";
import {
  apiFetch,
  isBackofficeRole,
  logout,
  setAuthSession,
  startAuthRefreshScheduler,
} from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "no-access") {
      setMessage(
        "Akun ini tidak memiliki akses backoffice. Gunakan akun operator atau admin."
      );
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Signing in...");
    try {
      const data = await apiFetch<{
        access_token: string;
        expires_in: number;
        user: { role: string };
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, email: username, password }),
      });

      if (!isBackofficeRole(data.user.role)) {
        await logout({ redirect: false });
        setMessage(
          "Akun ini tidak memiliki akses backoffice. Gunakan akun operator atau admin."
        );
        return;
      }

      setAuthSession(data.access_token, data.user.role, data.expires_in);
      startAuthRefreshScheduler();
      setMessage(`Signed in as ${data.user.role}. Redirecting...`);
      const redirectPath = new URLSearchParams(window.location.search).get(
        "redirect"
      );
      const allowedPaths = ["/", "/trips", "/orders", "/settings"];
      const target =
        redirectPath &&
        redirectPath.startsWith("/") &&
        !redirectPath.startsWith("//") &&
        allowedPaths.some((prefix) => redirectPath === prefix || redirectPath.startsWith(`${prefix}/`))
          ? redirectPath
          : "/";
      window.location.href = target;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9ff] px-8 py-7 text-[#161a23]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9272e] text-base font-black text-white shadow-[0_12px_24px_-16px_rgba(233,39,46,0.9)]">
          V
        </div>
        <div className="text-2xl font-extrabold tracking-[-0.03em] text-[#c1121f]">
          TravelOS
        </div>
      </div>

      <section className="flex min-h-[calc(100vh-88px)] items-center justify-center pb-16">
        <div className="w-full max-w-[480px] rounded-2xl bg-white px-12 py-12 shadow-[0_30px_90px_-62px_rgba(17,24,39,0.55)]">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold tracking-[-0.045em] text-[#111827]">
              Welcome Back
            </h1>
            <p className="mt-4 text-base font-medium text-[#6f7480]">
              Sign in to your TravelOS account to continue.
            </p>
          </div>

          <form className="mt-12 space-y-7" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-bold text-[#6a5f64]">Username</span>
              <div className="mt-2 flex h-12 items-center gap-3 rounded-lg border border-[#d6cbd0] bg-[#fdfbff] px-4 text-[#8d858b]">
                <UserRound size={18} />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#171923] outline-none placeholder:text-[#6f7480]"
                  placeholder="email@travelos.local"
                  type="text"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-[#6a5f64]">Password</span>
              <div className="mt-2 flex h-12 items-center gap-3 rounded-lg border border-[#d6cbd0] bg-[#fdfbff] px-4 text-[#8d858b]">
                <LockKeyhole size={18} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium tracking-[0.32em] text-[#171923] outline-none placeholder:tracking-normal placeholder:text-[#6f7480]"
                  type="password"
                />
                <button
                  type="button"
                  aria-label="Show password"
                  className="text-[#8d858b]"
                >
                  <Eye size={18} />
                </button>
              </div>
            </label>

            <button
              type="submit"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#e9272e] text-sm font-bold text-white shadow-[0_18px_32px_-20px_rgba(233,39,46,0.85)]"
            >
              Sign In
              <ArrowRight size={17} />
            </button>
            {message && (
              <p className="text-center text-sm font-semibold text-[#6f7480]">
                {message}
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
