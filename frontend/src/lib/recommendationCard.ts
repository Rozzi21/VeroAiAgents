import type { TripPackage } from "./api.ts";
import { getTripAdultPrice, getTripChildPrice } from "./format.ts";

// Pure presentation mapping for one recommendation card. Values come only
// from structured package fields carried by ChatResult/history; assistant text
// is never parsed and absent legacy fields remain absent.
export function recommendationCardView(trip: TripPackage) {
  const adultPrice = getTripAdultPrice(trip);
  const childPrice = getTripChildPrice(trip);

  return {
    title: trip.title,
    description: trip.summary || trip.overview || trip.destination,
    destination: trip.destination || trip.location || "",
    duration: trip.duration || "",
    adultPrice: adultPrice.originalPrice > 0 ? adultPrice : null,
    childPrice: childPrice.originalPrice > 0 ? childPrice : null,
  };
}