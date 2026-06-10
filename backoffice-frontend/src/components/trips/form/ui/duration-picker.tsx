import { Label } from "./label";
import { NumberStepper } from "./number-stepper";

export function DurationPicker({
  days,
  nights,
  onDaysChange,
  onNightsChange,
}: {
  days: string;
  nights: string;
  onDaysChange: (value: string) => void;
  onNightsChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>Duration</Label>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <NumberStepper
          label="Days"
          value={days}
          onChange={onDaysChange}
          min={0}
          placeholder="0"
        />
        <NumberStepper
          label="Nights"
          value={nights}
          onChange={onNightsChange}
          min={0}
          placeholder="0"
        />
      </div>
    </div>
  );
}
