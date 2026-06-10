import { FormSection } from "../ui/form-section";
import { Field } from "../ui/field";
import { Checkbox } from "../ui/checkbox";

export function PricingSection() {
  return (
    <FormSection title="Pricing & Discount">
      <div className="grid gap-5 md:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Field name="base_price" label="Base Price" placeholder="0.00" />
          <Checkbox name="discount_enabled" label="Enable Discount" />
          <Field name="child_price" label="Child Pricing" placeholder="0.00" />
          <Checkbox name="child_discount_enabled" label="Enable Discount" />
        </div>
        <div className="rounded-xl bg-[#f4f7ff] p-5">
          <Field name="discount_price" label="Discount Price" placeholder="0.00" />
          <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
            15%
          </div>
          <Field
            name="child_discount_price"
            label="Child Discount Price"
            placeholder="0.00"
          />
          <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
            10%
          </div>
        </div>
      </div>
    </FormSection>
  );
}
