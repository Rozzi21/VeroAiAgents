export function getStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "published":
      return {
        badge: "bg-emerald-50/95 text-emerald-800",
        dot: "bg-emerald-500",
      };
    case "pending":
      return {
        badge: "bg-amber-50/95 text-amber-800",
        dot: "bg-amber-500",
      };
    case "full":
      return {
        badge: "bg-sky-50/95 text-sky-800",
        dot: "bg-sky-500",
      };
    case "completed":
      return {
        badge: "bg-violet-50/95 text-violet-800",
        dot: "bg-violet-500",
      };
    default:
      return {
        badge: "bg-white/90 text-[#111827]",
        dot: "bg-[#be123c]",
      };
  }
}
