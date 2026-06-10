import { ImageIcon } from "lucide-react";

export function UploadBox({
  primary,
  onUpload,
}: {
  primary?: boolean;
  onUpload?: (file?: File) => void;
}) {
  return (
    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
      <ImageIcon size={18} className={primary ? "text-[#e9272e]" : undefined} />
      {primary && <span className="mt-2 text-[10px] font-bold text-[#8b7f89]">Upload</span>}
      {primary && (
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onUpload?.(event.target.files?.[0])}
        />
      )}
    </label>
  );
}
