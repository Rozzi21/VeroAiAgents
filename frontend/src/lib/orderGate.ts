import type { ChatOrderGate } from "./api.ts";

export const GUEST_ORDER_LIMIT_REACHED = "GUEST_ORDER_LIMIT_REACHED";
export const ORDER_CREATED = "ORDER_CREATED";
export const ORDER_ALREADY_EXISTS = "ORDER_ALREADY_EXISTS";

export type OrderGateView = {
  authRequired: boolean;
  trackOrderId: string | null;
  headline: string;
};

export function orderGateView(gate?: ChatOrderGate | null): OrderGateView | null {
  if (!gate || !gate.code) {
    return null;
  }
  const trackOrderId = gate.order_id ?? null;
  switch (gate.code) {
    case GUEST_ORDER_LIMIT_REACHED:
      return {
        authRequired: true,
        trackOrderId,
        headline: "Your guest order has already been used. Sign in to create another order.",
      };
    case ORDER_CREATED:
      return {
        authRequired: false,
        trackOrderId,
        headline: "Your order has been created. Keep tracking it here, or sign in to create another order.",
      };
    case ORDER_ALREADY_EXISTS:
      return {
        authRequired: false,
        trackOrderId,
        headline: "This chat already has an order. Continue tracking it below.",
      };
    default:
      return null;
  }
}
