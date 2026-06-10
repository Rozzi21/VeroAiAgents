import { ChevronDown, ChevronUp } from "lucide-react";

export function NumberStepper({
  label,
  value,
  onChange,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  placeholder: string;
}) {
  const numericValue = Number(value || 0);
  const setNextValue = (nextValue: number) => {
    onChange(String(Math.max(min, nextValue)));
  };

  return (
    <div className="rounded-lg border border-[#e6dfe5] bg-white px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b7f89]">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent text-lg font-extrabold text-[#171923] outline-none"
          placeholder={placeholder}
        />
        <div className="flex flex-col overflow-hidden rounded-md border border-[#eadfe5]">
          <button
            type="button"
            onClick={() => setNextValue(numericValue + 1)}
            className="flex h-5 w-7 items-center justify-center bg-[#fbfaff] text-[#6f7480] hover:bg-[#f6edf0]"
            aria-label={`Increase ${label}`}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => setNextValue(numericValue - 1)}
            className="flex h-5 w-7 items-center justify-center border-t border-[#eadfe5] bg-[#fbfaff] text-[#6f7480] hover:bg-[#f6edf0]"
            aria-label={`Decrease ${label}`}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
