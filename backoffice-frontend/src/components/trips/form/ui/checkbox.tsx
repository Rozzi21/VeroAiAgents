export function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
      <input
        name={name}
        defaultChecked={checked}
        type="checkbox"
        className="accent-[#e9272e]"
      />
      {label}
    </label>
  );
}
