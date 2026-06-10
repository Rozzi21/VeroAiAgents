import { Check } from "lucide-react";

export function OnDevelopmentPanel() {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-[#e9d9dd] bg-[#fdfbff] text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0ff] text-[#c1121f]">
          <Check size={26} />
        </div>
        <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.04em]">
          On Development
        </h1>
        <p className="mt-3 text-base font-medium text-[#777c88]">
          Dashboard TravelOS sedang dalam pengembangan.
        </p>
      </div>
    </div>
  );
}
