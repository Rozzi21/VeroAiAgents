import { formatIDR, getDiscountMeta } from "@/lib/format";

type PriceMeta = ReturnType<typeof getDiscountMeta>;

export function TripPriceBlock({
  label,
  price,
  size = "md",
}: {
  label: string;
  price: PriceMeta;
  size?: "md" | "lg";
}) {
  const priceClass =
    size === "lg"
      ? "text-4xl font-black text-[#df3333]"
      : "text-3xl font-black text-[#df3333]";

  return (
    <div>
      <div className="text-sm font-bold text-slate-500">{label}</div>
      <div className={`mt-1 ${priceClass}`}>{formatIDR(price.displayPrice)}</div>
      {price.hasDiscount ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">
            -{price.percent}%
          </span>
          <span className="text-sm font-semibold text-slate-400 line-through">
            {formatIDR(price.originalPrice)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function TripPriceInline({ price }: { price: PriceMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-bold text-slate-900">{formatIDR(price.displayPrice)}</span>
      {price.hasDiscount ? (
        <>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
            -{price.percent}%
          </span>
          <span className="text-sm text-slate-400 line-through">
            {formatIDR(price.originalPrice)}
          </span>
        </>
      ) : null}
    </div>
  );
}
