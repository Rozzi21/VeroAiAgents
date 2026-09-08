// Package selection UI state for Travel Package recommendation cards
// (B-GENUI-3 / B-GENUI-4, 9 Sep 2026).
//
// The backend is the ONLY authority over the selection: these pure
// transitions decide how the card UI reacts to a STRUCTURED backend outcome —
// the select_package envelope (success / APIError) or the selected_trip_id
// echoed by `done` and history. No assistant-text parsing, no keyword
// matching: the "show me another package" intent is classified by the
// AI/tool flow (search_trips alternative=true), never by the client.

export type PackageSelectionState = {
  // Backend-persisted chat_sessions.selected_trip_id; null = nothing selected.
  selectedTripId: string | null;
  // Trip id with an in-flight select_package request (its button disables).
  pendingTripId: string | null;
  // Last selection failure message; rendered as the existing error state.
  error: string | null;
};

export const initialPackageSelection: PackageSelectionState = {
  selectedTripId: null,
  pendingTripId: null,
  error: null,
};

// A Select Package click starts a backend round-trip. The current selection
// stays untouched until the backend confirms.
export function selectionStarted(
  state: PackageSelectionState,
  tripId: string
): PackageSelectionState {
  return { ...state, pendingTripId: tripId, error: null };
}

// The backend persisted selected_trip_id — NOW the UI may mark the card.
export function selectionSucceeded(
  tripId: string
): PackageSelectionState {
  return { selectedTripId: tripId, pendingTripId: null, error: null };
}

// The backend refused — selected_trip_id did NOT change, so neither does the
// UI selection; only the error state is shown. Never assume success.
export function selectionFailed(
  state: PackageSelectionState,
  message: string
): PackageSelectionState {
  return { ...state, pendingTripId: null, error: message };
}

// selectionSynced applies the backend-authoritative selected_trip_id echoed
// by a `done` event or the history payload (reload restore). It overwrites
// the local value — including clearing it — because the backend is the source
// of truth.
export function selectionSynced(
  state: PackageSelectionState,
  selectedTripId: string | null
): PackageSelectionState {
  return { ...state, selectedTripId };
}

export function isPackageSelected(
  state: PackageSelectionState,
  tripId: string
): boolean {
  return state.selectedTripId !== null && state.selectedTripId === tripId;
}
