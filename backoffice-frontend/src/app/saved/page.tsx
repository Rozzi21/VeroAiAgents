import { Bookmark, MapPin } from "lucide-react";
import { travelCards } from "@/lib/data";

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-primary">
          <Bookmark size={16} />
          Saved Destinations
        </div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Saved AI Recommendations
        </h1>
        <p className="mt-3 text-lg text-slate-500">
          Destinations kept for future autonomous itinerary generation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {travelCards.map((trip) => (
          <article key={trip.slug} className="glass-card rounded-[2rem] p-5">
            <div
              className="h-44 rounded-3xl bg-cover bg-center"
              style={{ backgroundImage: `url(${trip.image})` }}
            />
            <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              <MapPin size={14} />
              {trip.location}
            </div>
            <h2 className="mt-2 text-2xl font-black">{trip.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{trip.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
