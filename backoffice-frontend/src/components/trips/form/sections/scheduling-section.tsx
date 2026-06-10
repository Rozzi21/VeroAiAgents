import { FormSection } from "../ui/form-section";
import { Label } from "../ui/label";
import { DateRange } from "../ui/date-range";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "scheduling">;

export function SchedulingSection({ scheduling }: Props) {
  const { scheduleType, setScheduleType, visibilityEnabled, setVisibilityEnabled } =
    scheduling;

  return (
    <FormSection title="Scheduling">
      <div>
        <Label>Schedule Type</Label>
        <div className="mt-2 flex w-fit rounded-lg border border-[#e6dfe5] bg-white p-1">
          <button
            type="button"
            onClick={() => setScheduleType("date_range")}
            className={`h-9 rounded-md px-4 text-xs font-semibold ${scheduleType === "date_range" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
          >
            Date Range
          </button>
          <button
            type="button"
            onClick={() => setScheduleType("flexible")}
            className={`h-9 rounded-md px-4 text-xs font-bold ${scheduleType === "flexible" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
          >
            Custom / Flexible
          </button>
        </div>
      </div>
      <div className="space-y-5">
        {scheduleType === "date_range" && (
          <DateRange
            title="Package Dates"
            startName="package_start"
            endName="package_end"
          />
        )}

        <div className="rounded-xl border border-[#eadfe5] bg-white p-4">
          <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
            <input
              type="checkbox"
              checked={visibilityEnabled}
              onChange={(event) => setVisibilityEnabled(event.target.checked)}
              className="accent-[#e9272e]"
            />
            Add Visibility Schedule
          </label>
          <p className="mt-2 text-[11px] font-medium text-[#8b909a]">
            Jika tidak dicentang, trip bisa muncul terus tanpa batas tanggal publish.
          </p>
          {visibilityEnabled && (
            <div className="mt-4">
              <DateRange
                title="Visibility Schedule (When to publish)"
                startName="publish_start"
                endName="publish_end"
              />
            </div>
          )}
        </div>
      </div>
    </FormSection>
  );
}
