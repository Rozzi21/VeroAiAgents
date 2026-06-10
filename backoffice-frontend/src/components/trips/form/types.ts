export type ItineraryItem = {
  day: number;
  title: string;
  description: string;
};

export type TripCategory = "local" | "international";
export type ScheduleType = "date_range" | "flexible";
export type SubmitStatus = "draft" | "published";

export type UploadedMedia = { url: string; type: string };

export const INITIAL_ITINERARIES: ItineraryItem[] = [
  { day: 1, title: "", description: "" },
];

export const INITIAL_AMENITIES = [""];
export const INITIAL_HIGHLIGHTS: string[] = [];
