// Forward only headers required by backend authentication and tracing.
const FORWARDED_REQUEST_HEADERS = [
  "authorization",
  "cookie",
  "x-request-id",
] as const;

export function forwardedChatHeaders(incoming: Headers): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value) {
      headers[canonicalHeaderName(name)] = value;
    }
  }
  return headers;
}

export function forwardedChatResponseHeaders(incoming: Headers): Record<string, string> {
  const requestID = incoming.get("x-request-id");
  return requestID ? { "X-Request-ID": requestID } : {};
}

function canonicalHeaderName(lower: string): string {
  return lower
    .split("-")
    .map((part) => (part === "id" ? "ID" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("-");
}
