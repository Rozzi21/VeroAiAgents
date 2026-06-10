import Link from "next/link";
import { Plus } from "lucide-react";

export function CreateTripCard() {
  return (
    <Link
      href="/trips"
      className="flex min-h-[352px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#e9d9dd] bg-[#fdfbff] px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
        <Plus size={28} />
      </div>
      <div className="mt-7 text-2xl font-semibold tracking-[-0.03em]">
        Create New Trip
      </div>
      <p className="mt-3 max-w-[190px] text-sm leading-6 text-[#777c88]">
        Start planning your next adventure with our autonomous engine.
      </p>
    </Link>
  );
}
