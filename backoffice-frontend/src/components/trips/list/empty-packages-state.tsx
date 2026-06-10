import Link from "next/link";
import { Plus } from "lucide-react";

export function EmptyPackagesState({ error }: { error?: string }) {
  return (
    <div className="mt-12 flex min-h-[360px] items-center justify-center rounded-2xl border-2 border-dashed border-[#e9d9dd] bg-[#fdfbff] px-8 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
          <Plus size={28} />
        </div>
        <h2 className="mt-7 text-3xl font-extrabold tracking-[-0.04em]">
          Belum ada paket trip
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#777c88]">
          {error ||
            "Belum ada paket trip yang cocok dengan filter saat ini. Buat paket baru atau ubah filter kategori."}
        </p>
        <Link
          href="/trips"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#c1121f] px-6 text-sm font-bold text-white shadow-[0_16px_30px_-18px_rgba(193,18,31,0.85)]"
        >
          <Plus size={16} />
          Tambah Trip
        </Link>
      </div>
    </div>
  );
}
