import { Plus, Trash2 } from "lucide-react";
import { FormSection } from "../ui/form-section";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "itinerary">;

export function ItinerarySection({ itinerary }: Props) {
  const { itineraries, addItinerary, removeItinerary, updateItinerary } = itinerary;

  return (
    <FormSection title="Itinerary (Rencana Perjalanan)">
      <div className="space-y-4">
        {itineraries.map((item, index) => (
          <div
            key={item.day}
            className="rounded-lg border border-[#eadfe5] bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="rounded bg-[#ffe8ea] px-3 py-1 text-xs font-bold text-[#e9272e]">
                Day {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeItinerary(index)}
                className="text-[#8b7f89]"
                aria-label={`Remove day ${index + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={item.title}
                onChange={(event) =>
                  updateItinerary(index, "title", event.target.value)
                }
                className="h-10 rounded-md border border-[#e6dfe5] px-3 text-sm outline-none"
                placeholder="Day Title (e.g. Arrival in Tokyo)"
              />
              <textarea
                value={item.description}
                onChange={(event) =>
                  updateItinerary(index, "description", event.target.value)
                }
                className="h-20 resize-none rounded-md border border-[#e6dfe5] px-3 py-2 text-sm outline-none"
                placeholder="Description of the day's events..."
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItinerary}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#dacfd6] bg-white text-xs font-bold text-[#6f7480]"
      >
        <Plus size={14} />
        Add Another Day
      </button>
    </FormSection>
  );
}
