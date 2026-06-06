"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-6"
      onClick={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-[0_30px_90px_-50px_rgba(17,24,39,0.8)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="confirm-modal-title"
          className="text-2xl font-extrabold tracking-[-0.03em] text-[#111827]"
        >
          {title}
        </h2>
        <p className="mt-5 leading-7 text-[#6f7480]">{description}</p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-11 rounded-lg border border-[#e4e7f2] bg-white px-6 text-sm font-bold text-[#535762] transition hover:bg-[#faf9ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-11 rounded-lg px-6 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60",
              variant === "danger"
                ? "bg-[#c1121f] shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)] hover:bg-[#a50f1a]"
                : "bg-[#c1121f] shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)] hover:bg-[#a50f1a]"
            )}
          >
            {loading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
