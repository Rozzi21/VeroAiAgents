import { FormSection } from "../ui/form-section";
import { UploadBox } from "../ui/upload-box";
import { UploadPreview } from "../ui/upload-preview";
import { UseTripFormReturn } from "../use-trip-form";

type Props = Pick<UseTripFormReturn, "media">;

export function MediaSection({ media }: Props) {
  const { uploadedMedia, handleUpload, removeMedia } = media;

  return (
    <FormSection
      title="Media"
      action={
        <span className="text-[10px] font-bold text-[#8b7f89]">
          {uploadedMedia.length} / 5 Uploaded
        </span>
      }
    >
      <div className="grid grid-cols-5 gap-3">
        {uploadedMedia.length < 5 && (
          <UploadBox primary onUpload={handleUpload} />
        )}
        {uploadedMedia.map((item) => (
          <UploadPreview
            key={item.url}
            url={item.url}
            onRemove={() => removeMedia(item.url)}
          />
        ))}
        {Array.from({ length: Math.max(0, 4 - uploadedMedia.length) }).map(
          (_, index) => (
            <UploadPreview key={`empty-${index}`} onUpload={handleUpload} />
          )
        )}
      </div>
    </FormSection>
  );
}
