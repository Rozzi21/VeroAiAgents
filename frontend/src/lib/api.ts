const SERVER_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export const API_BASE_URL = SERVER_API_BASE_URL;

function resolveApiBase() {
  if (typeof window !== "undefined") {
    return "";
  }
  return SERVER_API_BASE_URL;
}

export type TripPackage = {
  id: string;
  title: string;
  slug: string;
  destination: string;
  location: string;
  category: string;
  status: string;
  summary: string;
  overview: string;
  duration: string;
  adult_pax?: number;
  child_pax?: number;
  image_url: string;
  media?: Array<{ url: string; type: string; alt_text?: string }>;
  highlights?: string[];
  amenities_included?: string[];
  amenities_excluded?: string[];
  base_price: number;
  estimated_price: number;
  discount_price?: number;
  discount_enabled?: boolean;
  child_price?: number;
  child_discount_price?: number;
  child_discount_enabled?: boolean;
  package_start_date?: string;
  package_end_date?: string;
  itineraries?: Array<{ day: number; title: string; description: string }>;
};

export type BookingOrder = {
  id: string;
  user_id: string;
  trip_id: string;
  booking_status: string;
  payment_status: string;
  total_price: number;
  booking_date: string;
  trip?: TripPackage;
};

type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
  error?: unknown;
};

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Tidak dapat terhubung ke server. Pastikan backend berjalan di http://localhost:8080."
    );
  }

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new Error("Respons server tidak valid. Coba refresh halaman.");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed");
  }
  return payload.data;
}

export function assetURL(path?: string) {
  if (!path) {
    return "";
  }
  if (path.startsWith("http")) {
    return path;
  }
  return `${SERVER_API_BASE_URL}${path}`;
}
