import { X } from "lucide-react";
import { ModalType } from "./types";

export function InfoModal({
  type,
  onClose,
}: {
  type: ModalType;
  onClose: () => void;
}) {
  if (!type) {
    return null;
  }

  const title = type === "help" ? "Help" : "Privacy";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-[0_30px_90px_-50px_rgba(17,24,39,0.8)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.03em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f2f7] text-[#535762]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-5 leading-7 text-[#6f7480]">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer
          facilisis, nibh non varius pulvinar, lorem mauris pretium neque, vitae
          posuere justo lectus sed lorem. Donec ac sem sed ipsum gravida
          vestibulum.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 h-11 rounded-lg bg-[#c1121f] px-6 text-sm font-bold text-white"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
