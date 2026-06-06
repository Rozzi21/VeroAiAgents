export function formatIDR(amount: number) {
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
