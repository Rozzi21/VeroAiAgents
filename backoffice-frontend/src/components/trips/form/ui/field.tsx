import { Label } from "./label";

export function Field({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        name={name}
        className="mt-2 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none placeholder:text-[#9da2ad]"
        placeholder={placeholder}
      />
    </label>
  );
}
