import { FormSection } from "../ui/form-section";

type Props = {
  defaultValue?: string;
};

export function ReferenceSection({ defaultValue = "" }: Props) {
  return (
    <FormSection title="Other Package Reference">
      <p className="text-xs text-[#7d838d]">
        Add reference packages so this content finds alternatives if this package is a
        perfect match.
      </p>
      <input
        name="reference"
        defaultValue={defaultValue}
        className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
        placeholder="Search package title..."
      />
    </FormSection>
  );
}
