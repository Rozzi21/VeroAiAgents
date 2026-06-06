export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const ACCESS_TOKEN_KEY = "backoffice_token";
const LEGACY_REFRESH_TOKEN_KEY = "backoffice_refresh_token";

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
  slots: number;
  image_url: string;
  media?: Array<{ url: string; type: string; alt_text?: string }>;
  highlights?: string[];
  amenities_included?: string[];
  amenities_excluded?: string[];
  base_price: number;
  estimated_price: number;
  discount_price?: number;
  child_price?: number;
  child_discount_price?: number;
  discount_enabled?: boolean;
  child_discount_enabled?: boolean;
  references?: string[];
  schedule_type?: string;
  publish_start_date?: string;
  publish_end_date?: string;
  package_start_date?: string;
  package_end_date?: string;
  itineraries?: Array<{ day: number; title: string; description: string }>;
};

export type TripStatus =
  | "draft"
  | "pending"
  | "published"
  | "full"
  | "completed";

type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
  error?: unknown;
};

type AuthTokens = {
  access_token: string;
};

let refreshPromise: Promise<string | null> | null = null;

if (typeof window !== "undefined") {
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function getToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function setAuthTokens(accessToken: string) {
  setAccessToken(accessToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }
  const redirect = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`
  );
  window.location.href = `/login?redirect=${redirect}`;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as Envelope<AuthTokens>;
      if (!response.ok || !payload.success) {
        return null;
      }

      setAccessToken(payload.data.access_token);
      return payload.data.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = false,
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = accessToken ?? getToken();
    if (!token) {
      throw new Error(
        "Silakan login terlebih dahulu sebelum mengakses fitur backoffice."
      );
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const payload = (await response.json()) as Envelope<T>;

  if (response.status === 401 && auth) {
    const authError = new Error(payload.message || "Unauthorized");
    authError.name = "AuthError";
    throw authError;
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed");
  }

  return payload.data;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = false
) {
  if (!auth) {
    return request<T>(path, options, false);
  }

  if (!getToken()) {
    throw new Error(
      "Silakan login terlebih dahulu sebelum mengakses fitur backoffice."
    );
  }

  try {
    return await request<T>(path, options, true);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AuthError") {
      throw error;
    }

    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, options, true, newToken);
    }

    clearAuthTokens();
    redirectToLogin();
    throw new Error("Sesi Anda telah berakhir. Silakan login kembali.");
  }
}

export async function logout() {
  try {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearAuthTokens();
    redirectToLogin();
  }
}

export function assetURL(path?: string) {
  if (!path) {
    return "";
  }
  if (path.startsWith("http")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}
