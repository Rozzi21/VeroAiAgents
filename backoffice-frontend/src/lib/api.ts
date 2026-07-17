export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

function resolveApiBase() {
  if (typeof window !== "undefined") {
    return "";
  }
  return API_BASE_URL;
}

const ACCESS_TOKEN_KEY = "backoffice_token";
const USER_ROLE_KEY = "backoffice_user_role";
const TOKEN_EXPIRES_AT_KEY = "backoffice_token_expires_at";
const LEGACY_REFRESH_TOKEN_KEY = "backoffice_refresh_token";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const FALLBACK_REFRESH_INTERVAL_MS = 50 * 60 * 1000;
// Default access token lifetime fallback (seconds). Kept in sync with the
// backend default JWT_ACCESS_TTL_MINUTES (15 minutes) so the proactive refresh
// schedule stays accurate even if the server omits expires_in.
const DEFAULT_ACCESS_TTL_SECONDS = 900;
// Name of the cross-tab coordination channel for auth refresh.
const AUTH_CHANNEL_NAME = "vero_auth";

export type BackofficeRole = "admin" | "operator" | "user" | string;

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
  adult_pax: number;
  child_pax: number;
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

export type BookingOrder = {
  id: string;
  user_id: string;
  user?: { id: string; name: string; email: string; role?: string };
  trip_id: string;
  trip?: TripPackage;
  booking_status: string;
  payment_status: string;
  total_price: number;
  booking_date: string;
  created_at: string;
};

type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
  error?: unknown;
};

type AuthTokens = {
  access_token: string;
  expires_in?: number;
};

type AuthUser = {
  role: BackofficeRole;
};

let refreshPromise: Promise<string | null> | null = null;
let refreshSchedulerStarted = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHandler: (() => void) | null = null;
let authChannel: BroadcastChannel | null = null;

type AuthBroadcast = {
  type: "token_refreshed";
  access_token: string;
  expires_at: number;
};

// adoptBroadcastToken applies a token that another tab just refreshed, without
// calling the refresh endpoint again. This avoids a race where multiple tabs
// each rotate the refresh token and invalidate each other.
function adoptBroadcastToken(accessToken: string, expiresAt: number) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (expiresAt > 0) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
  }
  scheduleProactiveRefresh();
}

function getAuthChannel(): BroadcastChannel | null {
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
  ) {
    return null;
  }
  if (!authChannel) {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    authChannel.onmessage = (event: MessageEvent<AuthBroadcast>) => {
      const data = event.data;
      if (!data || data.type !== "token_refreshed" || !data.access_token) {
        return;
      }
      adoptBroadcastToken(data.access_token, data.expires_at);
    };
  }
  return authChannel;
}

// broadcastTokenRefreshed notifies other tabs that this tab just rotated the
// refresh token, so they can adopt the new access token instead of calling the
// refresh endpoint themselves (which would invalidate this tab's session).
function broadcastTokenRefreshed(accessToken: string) {
  const channel = getAuthChannel();
  if (!channel) {
    return;
  }
  channel.postMessage({
    type: "token_refreshed",
    access_token: accessToken,
    expires_at: getTokenExpiresAt(),
  } satisfies AuthBroadcast);
}

if (typeof window !== "undefined") {
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function getToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

export function getUserRole(): BackofficeRole {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(USER_ROLE_KEY) ?? "";
}

export function isBackofficeRole(role: string) {
  return role === "admin" || role === "operator";
}

export function isAdminRole(role: string) {
  return role === "admin";
}

function getTokenExpiresAt() {
  if (typeof window === "undefined") {
    return 0;
  }
  return Number(localStorage.getItem(TOKEN_EXPIRES_AT_KEY) ?? 0);
}

function setTokenExpiry(expiresInSeconds?: number) {
  if (typeof window === "undefined" || !expiresInSeconds) {
    return;
  }
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

export function setAccessToken(accessToken: string, expiresInSeconds?: number) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  setTokenExpiry(expiresInSeconds);
  scheduleProactiveRefresh();
}

export function setAuthSession(
  accessToken: string,
  role?: BackofficeRole,
  expiresInSeconds?: number
) {
  setAccessToken(accessToken, expiresInSeconds);
  if (role) {
    localStorage.setItem(USER_ROLE_KEY, role);
  }
}

export function setAuthTokens(accessToken: string, role?: BackofficeRole) {
  setAuthSession(accessToken, role);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  stopAuthRefreshScheduler();
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

function mapForbiddenMessage(message: string) {
  if (message === "Insufficient permission") {
    return "Akses ditolak. Akun Anda tidak memiliki izin untuk aksi ini.";
  }
  return message || "Akses ditolak.";
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${resolveApiBase()}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as Envelope<AuthTokens>;
      if (!response.ok || !payload.success) {
        return null;
      }

      setAccessToken(
        payload.data.access_token,
        payload.data.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS
      );
      broadcastTokenRefreshed(payload.data.access_token);
      try {
        const user = await request<AuthUser>(
          "/api/v1/auth/me",
          {},
          true,
          payload.data.access_token
        );
        if (user.role) {
          localStorage.setItem(USER_ROLE_KEY, user.role);
        }
      } catch {
        // Token refresh succeeded; role sync is best-effort.
      }
      return payload.data.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function scheduleProactiveRefresh() {
  if (typeof window === "undefined" || !getToken()) {
    return;
  }

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const expiresAt = getTokenExpiresAt();
  const delay =
    expiresAt > 0
      ? Math.max(expiresAt - Date.now() - REFRESH_BUFFER_MS, 30_000)
      : FALLBACK_REFRESH_INTERVAL_MS;

  refreshTimer = setTimeout(async () => {
    if (!getToken()) {
      return;
    }
    const newToken = await refreshAccessToken();
    if (!newToken) {
      clearAuthTokens();
      redirectToLogin();
    }
  }, delay);
}

export function startAuthRefreshScheduler() {
  if (typeof window === "undefined" || refreshSchedulerStarted) {
    return;
  }
  refreshSchedulerStarted = true;
  scheduleProactiveRefresh();
  // Initialize the cross-tab channel eagerly so this tab starts receiving
  // token_refreshed broadcasts from other tabs immediately.
  getAuthChannel();

  visibilityHandler = () => {
    if (document.visibilityState !== "visible" || !getToken()) {
      return;
    }
    const expiresAt = getTokenExpiresAt();
    if (expiresAt > 0 && expiresAt - Date.now() <= REFRESH_BUFFER_MS) {
      void refreshAccessToken().then((token) => {
        if (!token) {
          clearAuthTokens();
          redirectToLogin();
        }
      });
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);
}

export function stopAuthRefreshScheduler() {
  refreshSchedulerStarted = false;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
}

export async function fetchCurrentUser() {
  return apiFetch<AuthUser>("/api/v1/auth/me", {}, true);
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

  const response = await fetch(`${resolveApiBase()}${path}`, {
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

  if (response.status === 403) {
    throw new Error(mapForbiddenMessage(payload.message));
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

export async function logout(options?: { redirect?: boolean }) {
  try {
    await fetch(`${resolveApiBase()}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearAuthTokens();
    if (options?.redirect !== false) {
      redirectToLogin();
    }
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
