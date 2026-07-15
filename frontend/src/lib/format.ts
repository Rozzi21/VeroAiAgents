import { TripPackage } from "@/lib/api";

export function formatIDR(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(amount)) {
    return "TBD";
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDiscountMeta(
  basePrice: number,
  discountPrice: number,
  discountEnabled?: boolean
) {
  const base = basePrice > 0 ? basePrice : 0;
  const hasDiscount =
    Boolean(discountEnabled) &&
    discountPrice > 0 &&
    base > 0 &&
    discountPrice < base;

  if (!hasDiscount) {
    return {
      hasDiscount: false,
      percent: 0,
      displayPrice: base,
      originalPrice: base,
    };
  }

  const percent = Math.round((1 - discountPrice / base) * 100);

  return {
    hasDiscount: true,
    percent,
    displayPrice: discountPrice,
    originalPrice: base,
  };
}

export function getTripAdultPrice(trip: TripPackage) {
  const base = trip.base_price || trip.estimated_price || 0;
  return getDiscountMeta(base, trip.discount_price ?? 0, trip.discount_enabled);
}

export function getTripChildPrice(trip: TripPackage) {
  const base = trip.child_price ?? 0;
  return getDiscountMeta(
    base,
    trip.child_discount_price ?? 0,
    trip.child_discount_enabled
  );
}
