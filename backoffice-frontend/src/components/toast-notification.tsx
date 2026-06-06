"use client";

import { useEffect } from "react";

export type ToastState = {
  type: "success" | "error" | "info";
  text: string;
};

type ToastNotificationProps = {
  toast: ToastState | null;
  onClose: () => void;
  autoDismissMs?: number;
};

export function ToastNotification({
  toast,
  onClose,
  autoDismissMs = 4000,
}: ToastNotificationProps) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onClose, toast]);

  if (!toast) {
    return null;
  }

  const tone =
    toast.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : toast.type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div className="fixed right-6 top-6 z-[120] max-w-sm">
      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${tone}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span className="leading-6">{toast.text}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-current opacity-70 hover:opacity-100"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
