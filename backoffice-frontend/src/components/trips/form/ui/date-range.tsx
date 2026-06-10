import { Label } from "./label";

export function DateRange({
  title,
  startName,
  endName,
}: {
  title: string;
  startName: string;
  endName: string;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          name={startName}
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
        <span className="text-xs text-[#8b909a]">to</span>
        <input
          name={endName}
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
      </div>
    </div>
  );
}
