export function formatDateRange(start?: string, end?: string) {
  if (!start && !end) {
    return "Flexible schedule";
  }
  const format = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        }).format(new Date(value))
      : "";
  return [format(start), format(end)].filter(Boolean).join(" - ");
}
