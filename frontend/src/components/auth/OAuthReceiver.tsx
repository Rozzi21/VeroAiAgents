"use client";

import { useEffect } from "react";
import {
  consumeOAuthFragment,
  oauthErrorMessage,
  postOAuthSuccessPath,
  sanitizeOAuthReturnQuery,
  setCustomerAccessToken,
} from "@/lib/authToken";

// Shown when the browser refuses to persist the session (storage full/blocked).
// Never treated as a successful sign-in.
const OAUTH_STORAGE_ERROR =
  "Your session could not be saved in this browser. Please enable site storage and try again.";

// OAuthReceiver consumes the backend's Google callback redirect. The access
// token arrives in the URL fragment (#access_token=...) — which is never sent
// to any server — so this runs client-side, validates and stores the token via
// the shared token helpers, then strips the fragment from the address bar.
//
// Hardening notes:
// - The fragment value is validated (JWT shape + size cap) before storage, so
//   a crafted/malicious fragment is never persisted or later sent as Bearer.
// - ANY fragment carrying an access_token key is removed from the URL, even
//   when invalid, so attacker input never lingers in history/share.
// - It also surfaces a backend auth_error (?auth_error=...) so the hosting page
//   can show a message, then strips that code from the URL too.
// - On success from the dedicated auth pages (/login, /register) the user is
//   redirected to "/" — consistent with password login; elsewhere the current
//   page reloads in place.
export function OAuthReceiver({ onError }: { onError?: (message: string) => void }) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const result = consumeOAuthFragment(window.location.hash);
    if (result.kind !== "none") {
      // Clean the fragment FIRST so the token (or attacker input) does not
      // linger in history/share, whatever happens next. One-shot OAuth query
      // params (a stale auth_error) are stripped too.
      const cleanQuery = sanitizeOAuthReturnQuery(window.location.search);
      const clean = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "");
      window.history.replaceState(null, "", clean);
      if (result.kind === "token") {
        if (setCustomerAccessToken(result.token, result.expiresIn)) {
          // From /login or /register land on "/" (consistent with password
          // login); otherwise reload the current page so it reflects the new
          // session.
          const destination = postOAuthSuccessPath(window.location.pathname);
          window.location.replace(destination === window.location.pathname ? clean : destination);
        } else if (onError) {
          // Storage rejected a VALID token (full/blocked): not signed in —
          // say so explicitly instead of silently appearing logged out.
          onError(OAUTH_STORAGE_ERROR);
        }
        return;
      }
      // kind === "invalid": fragment already stripped; surface a generic
      // failure. The raw value is never shown or logged.
      if (onError) {
        onError(oauthErrorMessage("authentication_failed"));
      }
    }
    const query = new URLSearchParams(window.location.search);
    const authError = query.get("auth_error");
    if (authError) {
      if (onError) {
        onError(oauthErrorMessage(authError));
      }
      // Strip the error code from the address bar so it does not persist in
      // history or get re-shown on the next mount.
      query.delete("auth_error");
      const remaining = query.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (remaining ? `?${remaining}` : "")
      );
    }
  }, [onError]);

  return null;
}

