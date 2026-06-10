import { apiFetch, TripPackage, TripStatus } from "@/lib/api";

export function buildTripUpdatePayload(
  trip: TripPackage,
  status?: TripStatus
): Record<string, unknown> {
  return {
    title: trip.title,
    slug: trip.slug,
    destination: trip.destination,
    location: trip.location,
    category: trip.category,
    status: status ?? trip.status,
    overview: trip.overview,
    summary: trip.summary,
    duration: trip.duration,
    adult_pax: trip.adult_pax,
    child_pax: trip.child_pax,
    estimated_price: trip.estimated_price,
    base_price: trip.base_price,
    discount_price: trip.discount_price ?? 0,
    child_price: trip.child_price ?? 0,
    child_discount_price: trip.child_discount_price ?? 0,
    discount_enabled: trip.discount_enabled ?? false,
    child_discount_enabled: trip.child_discount_enabled ?? false,
    image_url: trip.image_url,
    media: trip.media ?? [],
    highlights: trip.highlights ?? [],
    amenities_included: trip.amenities_included ?? [],
    amenities_excluded: trip.amenities_excluded ?? [],
    references: trip.references ?? [],
    schedule_type: trip.schedule_type ?? "",
    package_start_date: trip.package_start_date ?? "",
    package_end_date: trip.package_end_date ?? "",
    publish_start_date: trip.publish_start_date ?? "",
    publish_end_date: trip.publish_end_date ?? "",
    itineraries: trip.itineraries ?? [],
  };
}

export function buildTripFormSubmitPayload(
  body: Record<string, unknown>,
  existing?: TripPackage
): Record<string, unknown> {
  if (!existing) {
    return body;
  }

  return {
    ...body,
    slug: existing.slug,
    estimated_price: existing.estimated_price,
  };
}

export async function fetchTripDetail(tripId: string) {
  return apiFetch<TripPackage>(`/api/v1/trips/${tripId}`, {}, true);
}

export async function updateTripStatus(tripId: string, status: TripStatus) {
  const full = await fetchTripDetail(tripId);
  return apiFetch<TripPackage>(
    `/api/v1/admin/packages/${tripId}`,
    {
      method: "PUT",
      body: JSON.stringify(buildTripUpdatePayload(full, status)),
    },
    true
  );
}

export async function deleteTripPackage(tripId: string) {
  await apiFetch(`/api/v1/admin/packages/${tripId}`, { method: "DELETE" }, true);
}

export function formatTripStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function getDeleteSuccessMessage() {
  return "Paket berhasil dihapus.";
}

export function getDeleteErrorMessage(error?: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message === "Insufficient permission") {
      return "Akses ditolak. Akun Anda tidak memiliki izin untuk menghapus paket ini.";
    }
    return error.message;
  }
  return "Gagal menghapus paket.";
}

export function getStatusChangeSuccessMessage(status: TripStatus) {
  return `Status paket berhasil diubah menjadi ${formatTripStatus(status)}.`;
}

export function getStatusChangeErrorMessage(error?: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Gagal mengubah status paket.";
}
