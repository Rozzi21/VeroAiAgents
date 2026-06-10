import { FormSection } from "../ui/form-section";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "highlights">;

export function HighlightsSection({ highlights: highlightsProps }: Props) {
  const {
    highlights,
    highlightInput,
    setHighlightInput,
    addHighlight,
    removeHighlight,
  } = highlightsProps;

  return (
    <FormSection title="Highlights (Sorotan)">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e6dfe5] bg-white p-2">
        {highlights.length === 0 && (
          <span className="px-2 py-2 text-sm text-[#8a8f9d]">
            Belum ada highlight. Ketik lalu tekan Enter.
          </span>
        )}
        {highlights.map((highlight) => (
          <button
            key={highlight}
            type="button"
            onClick={() => removeHighlight(highlight)}
            className="rounded-md bg-[#f6edf0] px-3 py-2 text-xs font-semibold text-[#6f4751]"
            title="Klik untuk menghapus highlight"
          >
            {highlight} ×
          </button>
        ))}
        <input
          value={highlightInput}
          onChange={(event) => setHighlightInput(event.target.value)}
          onBlur={() => addHighlight(highlightInput)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addHighlight(highlightInput);
            }
          }}
          className="min-w-[180px] flex-1 px-2 py-2 text-sm outline-none"
          placeholder="Type highlight and press Enter..."
        />
      </div>
    </FormSection>
  );
}
