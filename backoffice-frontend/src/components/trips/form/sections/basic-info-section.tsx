import { FormSection } from "../ui/form-section";
import { Field } from "../ui/field";
import { Label } from "../ui/label";
import { DurationPicker } from "../ui/duration-picker";
import { SlotToggle } from "../ui/slot-toggle";
import { TripFormStaticDefaults } from "../map-trip-to-form";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "basicInfo"> &
  Pick<TripFormStaticDefaults, "title" | "location">;

export function BasicInfoSection({ basicInfo, title = "", location = "" }: Props) {
  const {
    category,
    setCategory,
    durationDays,
    setDurationDays,
    durationNights,
    setDurationNights,
    adultPaxEnabled,
    setAdultPaxEnabled,
    childPaxEnabled,
    setChildPaxEnabled,
    adultPax,
    setAdultPax,
    childPax,
    setChildPax,
  } = basicInfo;

  return (
    <FormSection title="Basic Info">
      <Field name="title" label="Trip Name" placeholder="e.g. Kyoto Autumn Immersion" defaultValue={title} />
      <Field name="location" label="Location" placeholder="City, Region, or Country" defaultValue={location} />
      <DurationPicker
        days={durationDays}
        nights={durationNights}
        onDaysChange={setDurationDays}
        onNightsChange={setDurationNights}
      />
      <div className="rounded-xl border border-[#eadfe5] bg-white p-4">
        <Label>Package Pax (Optional)</Label>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <SlotToggle
            label="Enable adult pax"
            enabled={adultPaxEnabled}
            value={adultPax}
            placeholder="Adult pax"
            onEnabledChange={(checked) => {
              setAdultPaxEnabled(checked);
              if (!checked) {
                setAdultPax("");
              }
            }}
            onValueChange={setAdultPax}
          />
          <SlotToggle
            label="Enable child pax"
            enabled={childPaxEnabled}
            value={childPax}
            placeholder="Child pax"
            onEnabledChange={(checked) => {
              setChildPaxEnabled(checked);
              if (!checked) {
                setChildPax("");
              }
            }}
            onValueChange={setChildPax}
          />
        </div>
        <p className="mt-3 text-[11px] font-medium text-[#8b909a]">
          Jika disabled, pax tidak akan dihitung. Adult dan child pax disimpan terpisah.
        </p>
      </div>

      <div>
        <Label>Trip Category</Label>
        <div className="mt-2 flex w-fit rounded-lg border border-[#e6dfe5] bg-white p-1">
          <button
            type="button"
            onClick={() => setCategory("local")}
            className={`h-9 rounded-md px-5 text-xs font-bold ${category === "local" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
          >
            Domestic
          </button>
          <button
            type="button"
            onClick={() => setCategory("international")}
            className={`h-9 rounded-md px-5 text-xs font-bold ${category === "international" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
          >
            International
          </button>
        </div>
      </div>
    </FormSection>
  );
}
