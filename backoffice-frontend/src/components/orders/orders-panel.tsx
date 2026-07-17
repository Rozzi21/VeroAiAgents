"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { BookingOrder, BookingStatus } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchOrders, updateOrderStatus } from "@/lib/order";
import { ToastNotification, ToastState } from "@/components/toast-notification";

type StatusFilter = "all" | BookingStatus;

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Orders" },
  { value: "pending", label: "New" },
  { value: "processing", label: "Processing" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const statusLabels: Record<BookingStatus, string> = {
  pending: "NEW",
  processing: "PROCESSING",
  confirmed: "CONFIRMED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const statusTone: Record<BookingStatus, string> = {
  pending: "bg-[#ef0000] text-white",
  processing: "bg-[#e8edff] text-[#25356b]",
  confirmed: "bg-[#dcfce7] text-[#166534]",
  completed: "bg-[#f0e7ff] text-[#5b21b6]",
  cancelled: "bg-[#fee2e2] text-[#991b1b]",
};

const transitionLabels: Partial<Record<BookingStatus, string>> = {
  pending: "Process Order",
  processing: "Update Status",
  confirmed: "Complete Order",
};

function normalizeStatus(status: string): BookingStatus {
  switch (status) {
    case "processing":
    case "confirmed":
    case "completed":
    case "cancelled":
      return status;
    default:
      return "pending";
  }
}

function nextStatus(status: BookingStatus): BookingStatus | null {
  if (status === "pending") return "processing";
  if (status === "processing") return "confirmed";
  if (status === "confirmed") return "completed";
  return null;
}

function customerName(order: BookingOrder) {
  return order.contact_name || order.user?.name || "Guest Traveler";
}

function customerEmail(order: BookingOrder) {
  return order.contact_email || order.user?.email || "";
}

function packageName(order: BookingOrder) {
  return order.trip?.title || order.trip_id;
}

function destination(order: BookingOrder) {
  return order.trip?.destination || order.trip?.location || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelative(value?: string) {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function travelDate(order: BookingOrder) {
  if (order.travel_date) return formatDate(order.travel_date);
  const start = order.trip?.package_start_date;
  const end = order.trip?.package_end_date;
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  if (start) return formatDate(start);
  return "Flexible schedule";
}

function travelers(order: BookingOrder) {
  const adults = order.adult_pax || 0;
  const children = order.child_pax || 0;
  const adultLabel = `${adults} ${adults === 1 ? "Adult" : "Adults"}`;
  const childLabel = `${children} ${children === 1 ? "Child" : "Children"}`;
  return children > 0 ? `${adultLabel}, ${childLabel}` : adultLabel;
}

function whatsappUrl(phone: string) {
  const normalized = phone.replace(/[^0-9]/g, "").replace(/^0/, "62");
  return normalized ? `https://wa.me/${normalized}` : "";
}

function StatsCard({
  title,
  value,
  note,
  prominent,
}: {
  title: string;
  value: number;
  note: string;
  prominent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[102px] rounded-lg border p-4 shadow-[0_22px_50px_-38px_rgba(17,24,39,0.55)]",
        prominent
          ? "border-[#df0000] bg-[#df0000] text-white shadow-[0_28px_70px_-36px_rgba(223,0,0,0.8)]"
          : "border-[#f1dfe0] bg-white text-[#151827]"
      )}
    >
      <p className="text-[10px] font-bold tracking-wide">{title}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-3xl font-black tracking-[-0.05em]">
          {value.toLocaleString("id-ID")}
        </p>
        {prominent && <span className="rounded border border-white/30 px-1.5 py-1 text-xs font-black">NEW</span>}
      </div>
      <p
        className={cn(
          "mt-3 inline-flex items-center gap-1 text-[10px] font-black",
          prominent ? "rounded-full bg-white/15 px-2 py-1" : "text-[#00609a]"
        )}
      >
        {note}
      </p>
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onView,
  onAdvance,
}: {
  order: BookingOrder;
  busy: boolean;
  onView: (order: BookingOrder) => void;
  onAdvance: (order: BookingOrder) => void;
}) {
  const status = normalizeStatus(order.booking_status);
  const next = nextStatus(status);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-[0_28px_70px_-48px_rgba(17,24,39,0.55)]",
        status === "pending" ? "border-l-2 border-l-[#df0000]" : "border-[#f4e6e8]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[10px] font-bold uppercase text-[#6b4e58]">#{order.id.slice(0, 8)}</div>
        <span className={cn("rounded px-2 py-0.5 text-[9px] font-black", statusTone[status])}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-4">
        <h2 className="text-lg font-black leading-tight tracking-[-0.03em] text-[#181b26]">
          {packageName(order)}
        </h2>
        <div className="text-right">
          <p className="text-[10px] font-bold text-[#6b4e58]">Total Price</p>
          <p className="font-black text-[#df0000]">{formatIDR(order.total_price)}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 text-xs text-[#222633] sm:grid-cols-2">
        <Info icon={<UserRound size={15} />} label="Customer" value={customerName(order)} subValue={order.contact_phone ? "WhatsApp available" : undefined} />
        <Info icon={<CalendarDays size={15} />} label="Travel Date" value={travelDate(order)} />
        <Info icon={<MapPin size={15} />} label="Destination" value={destination(order)} />
        <Info icon={<UsersRound size={15} />} label="Travelers" value={travelers(order)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#f2e7e9] pt-4">
        <p className="text-[10px] font-bold text-[#6b4e58]">Created: {formatRelative(order.created_at || order.booking_date)}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onView(order)} className="h-9 rounded-lg px-4 text-xs font-bold text-[#5a2730] hover:bg-[#fff1f2]">
            View Details
          </button>
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance(order)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#df0000] px-4 text-xs font-black text-white shadow-[0_14px_28px_-18px_rgba(223,0,0,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Processing..." : transitionLabels[status]}
              {!busy && <ArrowRight size={14} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Info({ icon, label, value, subValue }: { icon: React.ReactNode; label: string; value: string; subValue?: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2ecff] text-[#7e3f60]">{icon}</span>
      <div>
        <p className="text-[10px] font-bold text-[#7c4650]">{label}</p>
        <p className="mt-0.5 font-semibold text-[#1c202b]">{value}</p>
        {subValue && <p className="mt-0.5 text-[10px] font-bold text-emerald-600">{subValue}</p>}
      </div>
    </div>
  );
}

function DetailDrawer({ order, onClose, onAdvance, busy }: { order: BookingOrder | null; onClose: () => void; onAdvance: (order: BookingOrder) => void; busy: boolean }) {
  if (!order) return null;
  const status = normalizeStatus(order.booking_status);
  const next = nextStatus(status);
  const wa = order.contact_phone ? whatsappUrl(order.contact_phone) : "";
  const email = customerEmail(order);

  return (
    <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-[0_30px_100px_-35px_rgba(17,24,39,0.65)]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#f0e4e6] bg-white/95 p-6 backdrop-blur">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#df0000]">Order Detail</p>
            <h2 className="mt-2 text-2xl font-black text-[#151827]">#{order.id.slice(0, 8)}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#6b7280] hover:bg-[#faf0f1]" aria-label="Close order detail">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-7 p-6">
          <Section title="ORDER INFORMATION">
            <Detail label="Order ID" value={order.id} />
            <Detail label="Created date" value={formatDateTime(order.created_at || order.booking_date)} />
            <Detail label="Current status" value={statusLabels[status]} />
          </Section>

          <Section title="CUSTOMER INFORMATION">
            <Detail label="Customer name" value={customerName(order)} />
            <Detail label="WhatsApp / phone" value={order.contact_phone || "Not provided"} />
            <Detail label="Email" value={email || "Not provided"} />
            <div className="flex flex-wrap gap-2 pt-2">
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black text-white">
                  <Phone size={14} /> Contact Customer
                </a>
              ) : email ? (
                <a href={`mailto:${email}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#151827] px-4 text-xs font-black text-white">
                  <Mail size={14} /> Contact Customer
                </a>
              ) : null}
            </div>
          </Section>

          <Section title="TRIP INFORMATION">
            <Detail label="Package name" value={packageName(order)} />
            <Detail label="Destination" value={destination(order)} />
            <Detail label="Duration" value={order.trip?.duration || "Not provided"} />
            <Detail label="Travel date" value={travelDate(order)} />
          </Section>

          <Section title="TRAVELERS">
            <Detail label="Adults" value={String(order.adult_pax || 0)} />
            <Detail label="Children" value={String(order.child_pax || 0)} />
            <Detail label="Total travelers" value={String((order.adult_pax || 0) + (order.child_pax || 0))} />
          </Section>

          <Section title="PRICE SUMMARY">
            <Detail label="Package/base price" value={formatIDR(order.trip?.base_price || order.trip?.estimated_price || 0)} />
            <Detail label="Adult price" value={formatIDR(order.trip?.discount_price || order.trip?.base_price || order.trip?.estimated_price || 0)} />
            <Detail label="Child price" value={order.trip?.child_price ? formatIDR(order.trip.child_price) : "Not provided"} />
            <Detail label="Estimated/total price" value={formatIDR(order.total_price)} />
          </Section>

          <Section title="PACKAGE INFORMATION">
            {order.trip?.highlights?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-[#4b5563]">
                {order.trip.highlights.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <Detail label="Highlights" value="Not provided" />
            )}
          </Section>

          <Section title="ADMIN INFORMATION">
            <Detail label="Internal order status" value={order.booking_status} />
            <Detail label="Admin notes" value="Not supported by backend" />
          </Section>

          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance(order)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#df0000] text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Processing..." : transitionLabels[status]}
              {!busy && <ArrowRight size={16} />}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#f1e5e7] p-5">
      <h3 className="text-xs font-black tracking-[0.18em] text-[#df0000]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="font-bold text-[#7b6f76]">{label}</span>
      <span className="max-w-[60%] text-right font-semibold text-[#171923]">{value}</span>
    </div>
  );
}

function Skeleton() {
  return <div className="h-60 animate-pulse rounded-2xl bg-white/80 shadow-[0_28px_70px_-48px_rgba(17,24,39,0.55)]" />;
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<BookingOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchOrders();
      setOrders(data);
      setSelected((current) => current ? data.find((item) => item.id === current.id) ?? current : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat order dari backoffice.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadOrders();
  }, [loadOrders]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const byStatus = (status: BookingStatus) => orders.filter((order) => normalizeStatus(order.booking_status) === status).length;
    const todayNew = orders.filter((order) => normalizeStatus(order.booking_status) === "pending" && new Date(order.created_at || order.booking_date).toDateString() === today).length;
    return { pending: byStatus("pending"), processing: byStatus("processing"), confirmed: byStatus("confirmed"), completed: byStatus("completed"), todayNew };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const status = normalizeStatus(order.booking_status);
      const matchesFilter = filter === "all" || status === filter;
      const haystack = `${order.id} ${customerName(order)} ${packageName(order)}`.toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [filter, orders, query]);

  const handleAdvance = async (order: BookingOrder) => {
    const status = normalizeStatus(order.booking_status);
    const target = nextStatus(status);
    if (!target) return;
    setBusyId(order.id);
    try {
      const updated = await updateOrderStatus(order.id, target);
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
      setSelected((current) => current?.id === order.id ? updated : current);
      setToast({ type: "success", text: `Order berhasil diubah menjadi ${statusLabels[target]}.` });
      void loadOrders();
    } catch (err) {
      setToast({ type: "error", text: err instanceof Error ? err.message : "Gagal mengubah status order." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf8ff] px-0 py-8 text-[#161a23] sm:px-2 lg:px-0">
      <div className="mx-auto max-w-[1180px]">
        <header>
          <h1 className="text-3xl font-black tracking-[-0.04em] md:text-4xl">Orders</h1>
          <p className="mt-2 text-sm font-medium text-[#7b4d55]">Kelola dan proses pesanan perjalanan pelanggan.</p>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="New Orders" value={stats.pending} note={`↗ ${stats.todayNew} today`} prominent />
          <StatsCard title="Processing" value={stats.processing} note="◉ In Progress" />
          <StatsCard title="Confirmed" value={stats.confirmed} note="◎ Ready" />
          <StatsCard title="Completed" value={stats.completed} note="◎ All Time" />
        </div>

        <div className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="flex h-11 w-full max-w-md items-center gap-3 rounded-full bg-white px-4 text-[#7b6f76] shadow-sm">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, order ID or package..." className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#b3a7ad]" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={cn("h-9 shrink-0 rounded-full border px-4 text-xs font-black transition", filter === item.value ? "border-[#151827] bg-[#151827] text-white" : "border-[#f0b5b5] bg-white text-[#8f2f35] hover:bg-[#fff1f2]")}>{item.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm font-bold text-red-700">{error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#e9d9dd] bg-white p-10 text-center">
            <PackageCheck className="mx-auto text-[#df0000]" size={34} />
            <h2 className="mt-4 text-2xl font-black">Tidak ada order</h2>
            <p className="mt-2 text-sm font-medium text-[#777c88]">Order akan muncul otomatis setelah AI/customer membuat pesanan.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {filteredOrders.map((order) => <OrderCard key={order.id} order={order} busy={busyId === order.id} onView={setSelected} onAdvance={handleAdvance} />)}
          </div>
        )}
      </div>

      <DetailDrawer order={selected} onClose={() => setSelected(null)} onAdvance={handleAdvance} busy={Boolean(selected && busyId === selected.id)} />
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}