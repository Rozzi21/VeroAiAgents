import { ImageIcon, Trash2 } from "lucide-react";
import { assetURL } from "@/lib/api";

export function UploadPreview({
  url,
  onUpload,
  onRemove,
}: {
  url?: string;
  onUpload?: (file?: File) => void;
  onRemove?: () => void;
}) {
  if (url) {
    return (
      <div className="relative flex aspect-square overflow-hidden rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${assetURL(url)})` }}
        />
        <div className="absolute inset-0 bg-black/10" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#e9272e] shadow-sm"
          aria-label="Remove uploaded media"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <label className="relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
      <ImageIcon size={18} />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onUpload?.(event.target.files?.[0])}
      />
    </label>
  );
}
