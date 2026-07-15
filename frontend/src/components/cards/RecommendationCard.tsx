import Link from "next/link";

interface RecommendationCardProps {
  title: string;
  description: string;
  image: string;
  category: string;
  icon: React.ReactNode;
  href?: string;
  onSelect?: () => void;
}

export default function RecommendationCard({
  title,
  description,
  image,
  category,
  icon,
  href,
  onSelect,
}: RecommendationCardProps) {
  const content = (
    <>
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
      </div>
      
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 flex-grow leading-relaxed line-clamp-4">
          {description}
        </p>

        <span className="mt-5 w-full py-2.5 rounded-xl border border-[#df3333]/30 text-[#df3333] font-medium text-sm group-hover:bg-[#df3333] group-hover:text-white transition-colors flex justify-center items-center">
          View Details
        </span>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-lg transition-all duration-300 flex flex-col group cursor-pointer text-left"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href ?? `/trip/${title.toLowerCase()}`}
      className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-lg transition-all duration-300 flex flex-col group cursor-pointer"
    >
      {content}
    </Link>
  );
}
