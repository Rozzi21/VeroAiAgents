export type PackageSelectionState = {
  selectedTripId: string | null;
  pendingTripId: string | null;
  error: string | null;
};

export const initialPackageSelection: PackageSelectionState = {
  selectedTripId: null,
  pendingTripId: null,
  error: null,
};

export function selectionStarted(
  state: PackageSelectionState,
  tripId: string
): PackageSelectionState {
  return { ...state, pendingTripId: tripId, error: null };
}

export function selectionSucceeded(
  tripId: string
): PackageSelectionState {
  return { selectedTripId: tripId, pendingTripId: null, error: null };
}

export function selectionFailed(
  state: PackageSelectionState,
  message: string
): PackageSelectionState {
  return { ...state, pendingTripId: null, error: message };
}

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
  return state.selectedTripId === tripId;
}
