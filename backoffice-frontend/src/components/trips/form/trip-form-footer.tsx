import Link from "next/link";
import { Save, Send } from "lucide-react";
import { SubmitStatus } from "./types";

type TripFormFooterProps = {
  saving: boolean;
  isEditMode?: boolean;
  submitStatus: React.MutableRefObject<SubmitStatus>;
  onDraftClick: () => void;
  onPublishClick: () => void;
};

export function TripFormFooter({
  saving,
  isEditMode = false,
  submitStatus,
  onDraftClick,
  onPublishClick,
}: TripFormFooterProps) {
  const primaryLabel = isEditMode ? "Save Trip" : "Publish Trip";
  const primarySavingLabel = isEditMode ? "Saving..." : "Publishing...";
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#eceaf2] bg-white/85 px-6 py-4 shadow-[0_-20px_60px_-48px_rgba(17,24,39,0.8)] backdrop-blur lg:left-[288px]">
      <div className="mx-auto flex max-w-[760px] justify-end gap-3">
        <Link
          href="/"
          className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-xs font-bold text-[#6f7480] ring-1 ring-[#e6dfe5] transition hover:bg-[#faf9ff]"
        >
          Cancel
        </Link>
        <button
          form="trip-form"
          type="submit"
          onClick={onDraftClick}
          disabled={saving}
          className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-xs font-bold text-[#6f7480] ring-1 ring-[#e6dfe5] disabled:opacity-60"
        >
          <Save size={14} />
          {saving && submitStatus.current === "draft" ? "Saving..." : "Save as Draft"}
        </button>
        <button
          form="trip-form"
          type="submit"
          onClick={onPublishClick}
          disabled={saving}
          className="flex h-11 items-center gap-2 rounded-lg bg-[#e9272e] px-5 text-xs font-bold text-white disabled:opacity-60"
        >
          <Send size={14} />
          {saving && submitStatus.current === "published"
            ? primarySavingLabel
            : primaryLabel}
        </button>
      </div>
    </footer>
  );
}
