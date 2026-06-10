import Link from "next/link";
import { Grid2X2, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Category, ViewMode } from "./types";

type TripsToolbarProps = {
  category: Category;
  viewMode: ViewMode;
  onCategoryChange: (category: Category) => void;
  onViewModeChange: (mode: ViewMode) => void;
};

export function TripsToolbar({
  category,
  viewMode,
  onCategoryChange,
  onViewModeChange,
}: TripsToolbarProps) {
  return (
    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div>
        <h1 className="text-5xl font-extrabold tracking-[-0.04em] text-[#111827] md:text-[54px]">
          Current Trips
        </h1>
        <p className="mt-3 text-lg font-medium text-[#7b7f8c]">
          Manage your active and upcoming itineraries.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-xl bg-white p-1 shadow-[0_12px_26px_-20px_rgba(17,24,39,0.7)] ring-1 ring-[#e4e7f2]">
          {(
            [
              ["all", "All"],
              ["international", "International"],
              ["local", "Local"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onCategoryChange(value)}
              className={cn(
                "h-10 rounded-lg px-5 text-sm font-semibold transition",
                category === value
                  ? "bg-[#c1121f] font-bold text-white shadow-[0_12px_24px_-16px_rgba(193,18,31,0.85)]"
                  : "text-[#535762]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex rounded-xl bg-[#f3f4fb] p-1 shadow-[0_14px_30px_-24px_rgba(17,24,39,0.7)]">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl transition",
              viewMode === "grid"
                ? "bg-[#c1121f] text-white shadow-[0_12px_28px_-16px_rgba(193,18,31,0.85)]"
                : "text-[#6b7280]"
            )}
          >
            <Grid2X2 size={19} />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl transition",
              viewMode === "list"
                ? "bg-[#c1121f] text-white shadow-[0_12px_28px_-16px_rgba(193,18,31,0.85)]"
                : "text-[#6b7280]"
            )}
          >
            <List size={19} />
          </button>
        </div>

        <Link
          href="/trips"
          className="flex h-12 items-center gap-2 rounded-xl bg-[#c1121f] px-6 text-sm font-bold text-white shadow-[0_16px_30px_-18px_rgba(193,18,31,0.85)]"
        >
          <Plus size={16} />
          New Trip
        </Link>
      </div>
    </div>
  );
}
