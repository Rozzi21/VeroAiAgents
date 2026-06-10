import { FormSection } from "../ui/form-section";

export function ReferenceSection() {
  return (
    <FormSection title="Other Package Reference">
      <p className="text-xs text-[#7d838d]">
        Add reference packages so this content finds alternatives if this package is a
        perfect match.
      </p>
      <input
        name="reference"
        className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
        placeholder="Search package title..."
      />
    </FormSection>
  );
}
