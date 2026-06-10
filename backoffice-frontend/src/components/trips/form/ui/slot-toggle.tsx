export function SlotToggle({
  label,
  enabled,
  value,
  placeholder,
  onEnabledChange,
  onValueChange,
}: {
  label: string;
  enabled: boolean;
  value: string;
  placeholder: string;
  onEnabledChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg bg-[#fbfaff] p-3 ring-1 ring-[#f0e7ed]">
      <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="accent-[#e9272e]"
        />
        {label}
      </label>
      {enabled && (
        <input
          type="number"
          min="1"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none placeholder:text-[#9da2ad]"
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
