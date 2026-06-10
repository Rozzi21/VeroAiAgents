import { Search } from "lucide-react";

type TripsSearchHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
};

export function TripsSearchHeader({ query, onQueryChange }: TripsSearchHeaderProps) {
  return (
    <header className="flex justify-end">
      <label className="flex h-10 w-full max-w-[248px] items-center gap-3 rounded-xl bg-[#eef0ff] px-4 text-[#606473]">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#606473]"
          placeholder="Cari trips"
        />
      </label>
    </header>
  );
}
