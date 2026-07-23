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
  adult_pax: number;
  child_pax: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  travel_date: string;
  trip?: TripPackage;
};

type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
  error?: unknown;
};

// Abort requests that hang so the UI does not stay in a loading state forever.
const REQUEST_TIMEOUT_MS = 35_000; // slightly above the max AI workflow timeout

async function parseJsonEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const contentType = response.headers.get("content-type") || "";
  // Proxy errors (e.g. 502/504 from Next.js rewrite or nginx) often return HTML.
  // Detect that early and surface a clearer message instead of "invalid JSON".
  const raw = await response.text();
  if (!contentType.includes("application/json") || !raw.trim().startsWith("{")) {
    // eslint-disable-next-line no-console
    console.error("[api] non-JSON response", {
      status: response.status,
      contentType,
      preview: raw.slice(0, 200),
    });
    if (!response.ok) {
      throw new Error(
        `Server mengalami gangguan (${response.status}). Coba beberapa saat lagi.`
      );
    }
    throw new Error("Server merespons dengan format yang tidak dikenal.");
  }
  try {
    return JSON.parse(raw) as Envelope<T>;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api] failed to parse JSON response", {
      status: response.status,
      preview: raw.slice(0, 200),
      error: err,
    });
    throw new Error("Gagal membaca respons dari server. Coba refresh halaman.");
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Server terlalu lama merespons. Pastikan backend berjalan dan coba lagi."
      );
    }
    throw new Error(
      "Tidak dapat terhubung ke server. Pastikan backend berjalan di http://localhost:8080."
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseJsonEnvelope<T>(response);
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
