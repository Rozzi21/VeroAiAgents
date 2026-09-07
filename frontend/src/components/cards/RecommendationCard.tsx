import Link from "next/link";

interface RecommendationCardProps {
  title: string;
  description: string;
  image: string;
  category: string;
  icon: React.ReactNode;
  href?: string;
  // View Details opens the existing PackageDetailPanel ONLY. It never selects
  // the package and never touches selected_trip_id (B-GENUI-3).
  onViewDetails?: () => void;
  // Select Package invokes the backend select_package flow. The card shows
  // the selected state ONLY after the backend persisted the selection —
  // never on click alone, never because the detail panel opened (B-GENUI-3).
  onSelectPackage?: () => void;
  selected?: boolean;
  selecting?: boolean;
}

export default function RecommendationCard({
  title,
  description,
  image,
  category,
  icon,
  href,
  onViewDetails,
  onSelectPackage,
  selected = false,
  selecting = false,
}: RecommendationCardProps) {
  const imageBlock = (
    <div className="relative h-48 w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
        style={{
          backgroundImage: image
            ? `url(${image})`
            : "linear-gradient(135deg,#111827,#df3333)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm text-slate-700">
        {icon}
        {category}
      </div>
      {selected ? (
        <div className="absolute top-3 left-3 bg-[#df3333] text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">
          Terpilih
        </div>
      ) : null}
    </div>
  );

  // Chat mode (B-GENUI-3): two explicit, separate actions. The card body is
  // NOT one big button anymore, so "View Details" and "Select Package" can
  // never be conflated.
  if (onViewDetails || onSelectPackage) {
    return (
      <div
        className={`bg-white rounded-2xl overflow-hidden border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-lg transition-all duration-300 flex flex-col group ${
          selected ? "border-[#df3333] ring-2 ring-[#df3333]/40" : "border-slate-100"
        }`}
      >
        {imageBlock}
        <div className="p-5 flex flex-col flex-grow">
          <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 flex-grow leading-relaxed line-clamp-4">
            {description}
          </p>
          <div className="mt-5 flex gap-2">
            {onViewDetails ? (
              <button
                type="button"
                onClick={onViewDetails}
                className="flex-1 py-2.5 rounded-xl border border-[#df3333]/30 text-[#df3333] font-medium text-sm hover:bg-[#df3333]/5 transition-colors"
              >
                View Details
              </button>
            ) : null}
            {onSelectPackage ? (
              <button
                type="button"
                onClick={onSelectPackage}
                disabled={selected || selecting}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                  selected
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-[#df3333] text-white hover:bg-[#c92a2a] disabled:opacity-60"
                }`}
              >
                {selected ? "Terpilih" : selecting ? "Memilih..." : "Pilih Paket Ini"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Legacy link mode (marketing/listing contexts): unchanged behaviour.
  return (
    <Link
      href={href ?? `/trip/${title.toLowerCase()}`}
      className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-lg transition-all duration-300 flex flex-col group cursor-pointer"
    >
      {imageBlock}
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 flex-grow leading-relaxed line-clamp-4">
          {description}
        </p>
        <span className="mt-5 w-full py-2.5 rounded-xl border border-[#df3333]/30 text-[#df3333] font-medium text-sm group-hover:bg-[#df3333] group-hover:text-white transition-colors flex justify-center items-center">
          View Details
        </span>
      </div>
    </Link>
  );
}

