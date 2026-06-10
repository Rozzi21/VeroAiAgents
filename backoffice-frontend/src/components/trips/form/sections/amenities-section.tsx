import { FormSection } from "../ui/form-section";
import { AmenityColumn } from "../ui/amenity-column";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "amenities">;

export function AmenitiesSection({ amenities }: Props) {
  const { amenitiesIncluded, amenitiesExcluded, addAmenity, removeAmenity, updateAmenity } =
    amenities;

  return (
    <FormSection title="Amenities & Facilities">
      <div className="grid gap-5 md:grid-cols-2">
        <AmenityColumn
          title="What's included"
          items={amenitiesIncluded}
          placeholder="e.g. 4-star accommodation"
          onAdd={() => addAmenity("included")}
          onRemove={(index) => removeAmenity("included", index)}
          onChange={(index, value) => updateAmenity("included", index, value)}
        />
        <AmenityColumn
          title="What's not included"
          items={amenitiesExcluded}
          placeholder="e.g. International flights"
          onAdd={() => addAmenity("excluded")}
          onRemove={(index) => removeAmenity("excluded", index)}
          onChange={(index, value) => updateAmenity("excluded", index, value)}
        />
      </div>
    </FormSection>
  );
}
