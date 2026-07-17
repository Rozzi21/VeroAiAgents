import { apiFetch, BookingOrder, BookingStatus, getToken } from "@/lib/api";

export type OrderEvent = {
  id: string;
  type: string;
  payload?: unknown;
  created_at: string;
};

export async function fetchOrders(limit = 200) {
  return apiFetch<BookingOrder[]>(`/api/v1/bookings?limit=${limit}`, {}, true);
}

export async function fetchOrderDetail(orderId: string) {
  return apiFetch<BookingOrder>(`/api/v1/bookings/${orderId}`, {}, true);
}

export async function updateOrderStatus(
  orderId: string,
  status: BookingStatus
) {
  return apiFetch<BookingOrder>(
    `/api/v1/bookings/${orderId}`,
    {
      method: "PUT",
      body: JSON.stringify({ booking_status: status }),
    },
    true
  );
}

export function subscribeOrderEvents(onOrderEvent: () => void) {
  void onOrderEvent;

  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => undefined;
  }

  const token = getToken();
  if (!token) {
    return () => undefined;
  }

  // Native EventSource cannot send Authorization headers. Backend accepts only
  // Bearer auth for SSE today, so realtime refresh cannot be opened safely here
  // without changing auth middleware to support a cookie/session stream.
  return () => undefined;
}