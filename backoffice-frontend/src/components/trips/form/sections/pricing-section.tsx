import { FormSection } from "../ui/form-section";
import { Field } from "../ui/field";
import { Checkbox } from "../ui/checkbox";
import { TripFormStaticDefaults } from "../map-trip-to-form";

type Props = Pick<
  TripFormStaticDefaults,
  | "base_price"
  | "child_price"
  | "discount_price"
  | "child_discount_price"
  | "discount_enabled"
  | "child_discount_enabled"
>;

export function PricingSection({
  base_price = "",
  child_price = "",
  discount_price = "",
  child_discount_price = "",
  discount_enabled = false,
  child_discount_enabled = false,
}: Partial<Props> = {}) {
  return (
    <FormSection title="Pricing & Discount">
      <div className="grid gap-5 md:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Field
            name="base_price"
            label="Base Price"
            placeholder="0.00"
            defaultValue={base_price}
          />
          <Checkbox
            name="discount_enabled"
            label="Enable Discount"
            checked={discount_enabled}
          />
          <Field
            name="child_price"
            label="Child Pricing"
            placeholder="0.00"
            defaultValue={child_price}
          />
          <Checkbox
            name="child_discount_enabled"
            label="Enable Discount"
            checked={child_discount_enabled}
          />
        </div>
        <div className="rounded-xl bg-[#f4f7ff] p-5">
          <Field
            name="discount_price"
            label="Discount Price"
            placeholder="0.00"
            defaultValue={discount_price}
          />
          <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
            15%
          </div>
          <Field
            name="child_discount_price"
            label="Child Discount Price"
            placeholder="0.00"
            defaultValue={child_discount_price}
          />
          <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
            10%
          </div>
        </div>
      </div>
    </FormSection>
  );
}
