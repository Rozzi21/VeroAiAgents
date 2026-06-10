import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { assetURL, TripPackage } from "@/lib/api";
import { formatIDR, getDiscountMeta } from "@/lib/format";
import { formatTripStatus } from "@/lib/trip";
import { formatDateRange } from "../shared/format-date-range";
import { formatTripPax } from "../shared/format-trip-pax";
import { getStatusTone } from "../shared/trip-status-tone";
import { ViewMode } from "./types";

type TripCardProps = {
  trip: TripPackage;
  viewMode: ViewMode;
  busy?: boolean;
  onContextMenu: (event: React.MouseEvent, trip: TripPackage) => void;
};

export function TripCard({
  trip,
  viewMode,
  busy,
  onContextMenu,
}: TripCardProps) {
  const {
    id,
    title,
    status,
    duration,
    adult_pax,
    child_pax,
    package_start_date,
    package_end_date,
    image_url,
    media,
    base_price,
    estimated_price,
    discount_price,
    discount_enabled,
  } = trip;
  const image = assetURL(image_url || media?.[0]?.url);
  const date = formatDateRange(package_start_date, package_end_date);
  const price = getDiscountMeta(
    base_price || estimated_price,
    discount_price ?? 0,
    discount_enabled
  );
  const statusTone = getStatusTone(status);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-45px_rgba(17,24,39,0.75)] transition",
        busy && "pointer-events-none opacity-60",
        viewMode === "list" && "grid md:grid-cols-[300px_minmax(0,1fr)]"
      )}
      onContextMenu={(event) => onContextMenu(event, trip)}
    >
      <Link
        href={`/trips/${id}`}
        className={cn("block", viewMode === "list" && "contents")}
      >
        <div
          className={cn(
            "relative bg-gradient-to-br from-[#102b35] via-[#2f9aad] to-[#a7dee3]",
            viewMode === "grid" ? "h-[192px]" : "min-h-[220px]"
          )}
          style={
            image
              ? {
                  backgroundImage: `url(${image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.7),transparent_18rem)] opacity-50" />
          <div className="absolute inset-0 backdrop-blur-[1px]" />
          <div
            className={cn(
              "absolute right-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em]",
              statusTone.badge
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", statusTone.dot)} />
            {formatTripStatus(status)}
          </div>
        </div>

        <div className="p-6">
          <h2 className="whitespace-pre-line text-2xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#171923]">
            {title}
          </h2>
          <p className="mt-2 text-sm font-medium text-[#8a8f9d]">
            {duration || "Flexible"} - {formatTripPax(adult_pax, child_pax)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-[#c1121f]">
              {formatIDR(price.displayPrice)}
            </span>
            {price.hasDiscount && (
              <>
                <span className="text-sm font-medium text-[#8a8f9d] line-through">
                  {formatIDR(price.originalPrice)}
                </span>
                <span className="rounded-full bg-[#c1121f] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
                  -{price.percent}%
                </span>
              </>
            )}
          </div>

          <div className="mt-8 border-t border-[#eef0f4] pt-5">
            <div className="flex items-center gap-3 text-sm font-medium text-[#555b66]">
              <CalendarDays size={16} className="text-[#5f6570]" />
              {date}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
