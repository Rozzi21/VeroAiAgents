// Guest identity and its HttpOnly cookies are created by the backend on the
// first guest chat/order request. Entering guest mode therefore only needs to
// revoke any current account session before opening the public chat. Revoking
// first matters: otherwise ensureCustomerSession() could restore the account
// from its refresh cookie and the visitor would not be acting as a guest.
export const GUEST_HOME_PATH = "/";

export async function enterGuestMode(
  logout: () => Promise<void>
): Promise<typeof GUEST_HOME_PATH> {
  await logout();
  return GUEST_HOME_PATH;
}
