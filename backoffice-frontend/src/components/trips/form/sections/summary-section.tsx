import { FormSection } from "../ui/form-section";
import { Label } from "../ui/label";

export function SummarySection() {
  return (
    <FormSection title="Trip Summary">
      <div>
        <Label>Trip Summary</Label>
        <textarea
          name="summary"
          className="mt-2 h-28 w-full resize-none rounded-md border border-[#e6dfe5] bg-white px-3 py-3 text-sm outline-none placeholder:text-[#a0a4ad]"
          placeholder="Describe the essence of this journey..."
        />
      </div>
    </FormSection>
  );
}
