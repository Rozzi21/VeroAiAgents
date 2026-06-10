import { FormSection } from "../ui/form-section";
import { Field } from "../ui/field";
import { Label } from "../ui/label";
import { DurationPicker } from "../ui/duration-picker";
import { SlotToggle } from "../ui/slot-toggle";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "basicInfo">;

export function BasicInfoSection({ basicInfo }: Props) {
  const {
    category,
    setCategory,
    durationDays,
    setDurationDays,
    durationNights,
    setDurationNights,
    adultSlotsEnabled,
    setAdultSlotsEnabled,
    childSlotsEnabled,
    setChildSlotsEnabled,
    adultSlots,
    setAdultSlots,
    childSlots,
    setChildSlots,
  } = basicInfo;

  return (
    <FormSection title="Basic Info">
      <Field name="title" label="Trip Name" placeholder="e.g. Kyoto Autumn Immersion" />
      <Field name="location" label="Location" placeholder="City, Region, or Country" />
      <DurationPicker
        days={durationDays}
        nights={durationNights}
        onDaysChange={setDurationDays}
        onNightsChange={setDurationNights}
      />
      <div className="rounded-xl border border-[#eadfe5] bg-white p-4">
        <Label>Package Slots (Optional)</Label>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <SlotToggle
            label="Enable slots adults"
            enabled={adultSlotsEnabled}
            value={adultSlots}
            placeholder="Adult slots"
            onEnabledChange={(checked) => {
              setAdultSlotsEnabled(checked);
              if (!checked) {
                setAdultSlots("");
              }
            }}
            onValueChange={setAdultSlots}
          />
          <SlotToggle
            label="Enable slots child"
            enabled={childSlotsEnabled}
            value={childSlots}
            placeholder="Child slots"
            onEnabledChange={(checked) => {
              setChildSlotsEnabled(checked);
              if (!checked) {
                setChildSlots("");
              }
            }}
            onValueChange={setChildSlots}
          />
        </div>
        <p className="mt-3 text-[11px] font-medium text-[#8b909a]">
          Jika disabled, slot tidak akan dihitung. Total slots disimpan sebagai kapasitas paket.
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
