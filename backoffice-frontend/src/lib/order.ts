import { apiFetch, BookingOrder, BookingStatus } from "@/lib/api";

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
