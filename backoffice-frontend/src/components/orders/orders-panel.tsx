"use client";

import { useEffect, useState } from "react";
import { apiFetch, BookingOrder } from "@/lib/api";
import { formatIDR } from "@/lib/format";

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<BookingOrder[]>(
          "/api/v1/bookings?limit=100",
          {},
          true
        );
        if (!cancelled) {
          setOrders(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Gagal memuat order dari backoffice."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#df3333]">
            Manual Orders
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[#161a23]">
            Customer Orders
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#777c88]">
            DOKU payment flow is temporarily disabled. New customer confirmations
            appear here as pending orders for admin processing.
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-[#eceaf2] bg-white shadow-[0_24px_60px_-42px_rgba(17,24,39,0.45)]">
        {loading ? (
          <div className="p-8 text-center text-sm font-semibold text-[#777c88]">
            Memuat order...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-[#777c88]">
            Belum ada order pending.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#eceaf2] text-sm">
              <thead className="bg-[#fdfbff] text-left text-xs font-black uppercase tracking-[0.16em] text-[#8b7f89]">
                <tr>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Package</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Booking</th>
                  <th className="px-5 py-4">Payment</th>
                  <th className="px-5 py-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1eef5]">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#fffafa]">
                    <td className="px-5 py-4 font-black text-[#161a23]">
                      #{order.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4 text-[#535762]">
                      <div className="font-bold">{order.user?.name ?? "Guest Traveler"}</div>
                      <div className="text-xs text-[#8b909b]">{order.user?.email ?? "guest@vero.local"}</div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#535762]">
                      {order.trip?.title ?? order.trip_id}
                    </td>
                    <td className="px-5 py-4 font-bold text-[#161a23]">
                      {formatIDR(order.total_price)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                        {statusLabel(order.booking_status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {statusLabel(order.payment_status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#535762]">
                      {formatDate(order.booking_date || order.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}