"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Compass,
  ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { apiFetch, assetURL, getToken } from "@/lib/api";

type ItineraryItem = {
  day: number;
  title: string;
  description: string;
};

type ToastState = {
  type: "success" | "error" | "info";
  text: string;
};

const initialItineraries: ItineraryItem[] = [
  {
    day: 1,
    title: "",
    description: "",
  },
];

export function EmptyTripScreen() {
  const [category, setCategory] = useState<"local" | "international">("local");
  const [scheduleType, setScheduleType] = useState<"date_range" | "flexible">("date_range");
  const [visibilityEnabled, setVisibilityEnabled] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<Array<{ url: string; type: string }>>([]);
  const [amenitiesIncluded, setAmenitiesIncluded] = useState(["", ""]);
  const [amenitiesExcluded, setAmenitiesExcluded] = useState([""]);
  const [itineraries, setItineraries] = useState<ItineraryItem[]>(initialItineraries);
  const [highlights, setHighlights] = useState(["Cultural Tour", "Local Food"]);
  const [highlightInput, setHighlightInput] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [durationNights, setDurationNights] = useState("");
  const [adultSlotsEnabled, setAdultSlotsEnabled] = useState(false);
  const [childSlotsEnabled, setChildSlotsEnabled] = useState(false);
  const [adultSlots, setAdultSlots] = useState("");
  const [childSlots, setChildSlots] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const submitStatus = useRef<"draft" | "published">("draft");

  useEffect(() => {
    if (!getToken()) {
      setToast({
        type: "info",
        text: "Silakan login terlebih dahulu untuk upload media dan menyimpan paket.",
      });
    }
  }, []);

  async function handleUpload(file?: File) {
    if (!file) {
      return;
    }
    if (uploadedMedia.length >= 5) {
      setToast({ type: "error", text: "Maksimal 5 gambar untuk satu trip." });
      return;
    }
    setToast({ type: "info", text: "Mengupload gambar..." });
    try {
      const body = new FormData();
      body.append("file", file);
      const uploaded = await apiFetch<{ url: string }>(
        "/api/v1/admin/uploads",
        {
          method: "POST",
          body,
        },
        true
      );
      setUploadedMedia((items) =>
        [...items, { url: uploaded.url, type: "image" }].slice(0, 5)
      );
      setToast({ type: "success", text: "Gambar berhasil diupload." });
    } catch (error) {
      setToast({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal upload gambar",
      });
    }
  }

  function removeMedia(url: string) {
    setUploadedMedia((items) => items.filter((item) => item.url !== url));
  }

  function updateAmenity(
    type: "included" | "excluded",
    index: number,
    value: string
  ) {
    const setter = type === "included" ? setAmenitiesIncluded : setAmenitiesExcluded;
    setter((items) => items.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function addAmenity(type: "included" | "excluded") {
    const setter = type === "included" ? setAmenitiesIncluded : setAmenitiesExcluded;
    setter((items) => [...items, ""]);
  }

  function removeAmenity(type: "included" | "excluded", index: number) {
    const setter = type === "included" ? setAmenitiesIncluded : setAmenitiesExcluded;
    setter((items) => {
      if (items.length === 1) {
        return [""];
      }
      return items.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function updateItinerary(index: number, field: "title" | "description", value: string) {
    setItineraries((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addItinerary() {
    setItineraries((items) => [
      ...items,
      {
        day: items.length + 1,
        title: "",
        description: "",
      },
    ]);
  }

  function removeItinerary(index: number) {
    setItineraries((items) => {
      if (items.length === 1) {
        return initialItineraries;
      }
      return items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, day: itemIndex + 1 }));
    });
  }

  function addHighlight(value: string) {
    const cleanValue = value.trim();
    if (!cleanValue || highlights.includes(cleanValue)) {
      setHighlightInput("");
      return;
    }
    setHighlights((items) => [...items, cleanValue]);
    setHighlightInput("");
  }

  function resetDynamicFields() {
    setCategory("local");
    setScheduleType("date_range");
    setVisibilityEnabled(false);
    setUploadedMedia([]);
    setAmenitiesIncluded(["", ""]);
    setAmenitiesExcluded([""]);
    setItineraries(initialItineraries);
    setHighlights(["Cultural Tour", "Local Food"]);
    setHighlightInput("");
    setDurationDays("");
    setDurationNights("");
    setAdultSlotsEnabled(false);
    setChildSlotsEnabled(false);
    setAdultSlots("");
    setChildSlots("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const location = String(form.get("location") || "").trim();
    const days = Number(durationDays || 0);
    const nights = Number(durationNights || 0);
    const duration = days > 0 || nights > 0 ? `${days} Days / ${nights} Nights` : "";
    const summary = String(form.get("summary") || "").trim();
    const basePrice = Number(form.get("base_price") || 0);
    const packageStartDate = String(form.get("package_start") || "").trim();
    const packageEndDate = String(form.get("package_end") || "").trim();
    const publishStartDate = visibilityEnabled
      ? String(form.get("publish_start") || "").trim()
      : "";
    const publishEndDate = visibilityEnabled
      ? String(form.get("publish_end") || "").trim()
      : "";
    const adultSlotCount = adultSlotsEnabled ? Number(adultSlots || 0) : 0;
    const childSlotCount = childSlotsEnabled ? Number(childSlots || 0) : 0;
    const totalSlots = adultSlotCount + childSlotCount;
    const incompleteItinerary = itineraries.some(
      (item) =>
        (item.title.trim() && !item.description.trim()) ||
        (!item.title.trim() && item.description.trim())
    );

    if (!getToken()) {
      setToast({
        type: "error",
        text: "Silakan login terlebih dahulu sebelum menyimpan trip.",
      });
      return;
    }
    if (!title || !location || !duration || !summary || !basePrice) {
      setToast({
        type: "error",
        text: "Lengkapi field wajib: Trip Name, Location, Duration, Summary, dan Base Price.",
      });
      return;
    }
    if (
      (adultSlotsEnabled && adultSlotCount <= 0) ||
      (childSlotsEnabled && childSlotCount <= 0)
    ) {
      setToast({
        type: "error",
        text: "Jumlah slots wajib lebih dari 0 untuk tipe slots yang diaktifkan.",
      });
      return;
    }
    if (scheduleType === "date_range" && (!packageStartDate || !packageEndDate)) {
      setToast({
        type: "error",
        text: "Package Dates wajib diisi untuk schedule Date Range.",
      });
      return;
    }
    if (visibilityEnabled && (!publishStartDate || !publishEndDate)) {
      setToast({
        type: "error",
        text: "Visibility dates wajib diisi jika Add Visibility diaktifkan.",
      });
      return;
    }
    if (highlights.length === 0) {
      setToast({
        type: "error",
        text: "Tambahkan minimal satu highlight untuk trip ini.",
      });
      return;
    }
    if (incompleteItinerary) {
      setToast({
        type: "error",
        text: "Lengkapi title dan description pada itinerary, atau kosongkan keduanya.",
      });
      return;
    }

    setSaving(true);
    setToast({ type: "info", text: "Menyimpan paket..." });
    const body = {
      title,
      location,
      destination: location,
      duration,
      slots: totalSlots,
      category,
      status: submitStatus.current,
      media: uploadedMedia,
      image_url: uploadedMedia[0]?.url || "",
      summary,
      overview: summary,
      amenities_included: amenitiesIncluded.map((item) => item.trim()).filter(Boolean),
      amenities_excluded: amenitiesExcluded.map((item) => item.trim()).filter(Boolean),
      highlights,
      base_price: basePrice,
      child_price: Number(form.get("child_price") || 0),
      discount_price: Number(form.get("discount_price") || 0),
      child_discount_price: Number(form.get("child_discount_price") || 0),
      discount_enabled: form.get("discount_enabled") === "on",
      child_discount_enabled: form.get("child_discount_enabled") === "on",
      schedule_type: scheduleType,
      package_start_date: scheduleType === "date_range" ? packageStartDate : "",
      package_end_date: scheduleType === "date_range" ? packageEndDate : "",
      publish_start_date: publishStartDate,
      publish_end_date: publishEndDate,
      references: [String(form.get("reference") || "")].filter(Boolean),
      itineraries: itineraries
        .map((item, index) => ({
          day: index + 1,
          title: item.title.trim(),
          description: item.description.trim(),
        }))
        .filter((item) => item.title || item.description),
    };

    try {
      await apiFetch("/api/v1/admin/packages", {
        method: "POST",
        body: JSON.stringify(body),
      }, true);
      const statusLabel = submitStatus.current === "published" ? "published" : "draft";
      setToast({
        type: "success",
        text: `Trip berhasil ditambahkan sebagai ${statusLabel}.`,
      });
      formElement.reset();
      resetDynamicFields();
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (error) {
      setToast({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal menyimpan paket",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbfaff] text-[#171923]">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      <aside className="fixed inset-y-0 left-0 hidden w-[188px] flex-col bg-[#faf9ff] px-5 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9272e] text-sm font-black text-white">
            T
          </div>
          <div>
            <div className="text-lg font-extrabold leading-none text-[#c1121f]">
              TravelOS
            </div>
            <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#7b7f8c]">
              Create AI Trips
            </div>
          </div>
        </Link>

        <Link
          href="/trips"
          className="mt-7 flex h-10 items-center justify-center gap-2 rounded-lg bg-[#e9272e] text-xs font-bold text-white shadow-[0_16px_28px_-20px_rgba(233,39,46,0.9)]"
        >
          <Plus size={14} />
          New Trip
        </Link>
        <Link
          href="/login"
          className="mt-3 flex h-10 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#e9272e] ring-1 ring-[#f0d8db]"
        >
          Login
        </Link>

        <nav className="mt-8 space-y-2">
          <SidebarLink href="/" icon={<LayoutDashboard size={14} />} label="Dashboard" />
          <SidebarLink href="/trips" icon={<Compass size={14} />} label="Trips" active />
        </nav>

        <div className="mt-auto border-t border-[#eceaf2] pt-5">
          <SidebarLink href="/" icon={<CircleHelp size={14} />} label="Help" muted />
          <SidebarLink href="/" icon={<LockKeyhole size={14} />} label="Privacy" muted />
        </div>
      </aside>

      <main className="pb-28 lg:pl-[188px]">
        <div className="mx-auto max-w-[760px] px-6 py-10">
          <header>
            <h1 className="text-3xl font-extrabold tracking-[-0.04em]">
              Create New Trip
            </h1>
            <p className="mt-2 text-sm text-[#707684]">
              Design and configure a new travel package for the operating system.
            </p>
          </header>

          <form id="trip-form" className="mt-9 space-y-8" onSubmit={handleSubmit}>
            <FormSection title="Basic Info">
              <Field name="title" label="Trip Name" placeholder="e.g. Kyoto Autumn Immersion" />
              <Field name="location" label="Location" placeholder="City, Region, or Country" />
              <DurationPicker
                days={durationDays}
                nights={durationNights}
                onDaysChange={setDurationDays}
                onNightsChange={setDurationNights}
              />
              <div className="rounded-xl border border-[#eadfe5] bg-white p-4">
                <Label>Package Slots (Optional)</Label>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <SlotToggle
                    label="Enable slots adults"
                    enabled={adultSlotsEnabled}
                    value={adultSlots}
                    placeholder="Adult slots"
                    onEnabledChange={(checked) => {
                      setAdultSlotsEnabled(checked);
                      if (!checked) {
                        setAdultSlots("");
                      }
                    }}
                    onValueChange={setAdultSlots}
                  />
                  <SlotToggle
                    label="Enable slots child"
                    enabled={childSlotsEnabled}
                    value={childSlots}
                    placeholder="Child slots"
                    onEnabledChange={(checked) => {
                      setChildSlotsEnabled(checked);
                      if (!checked) {
                        setChildSlots("");
                      }
                    }}
                    onValueChange={setChildSlots}
                  />
                </div>
                <p className="mt-3 text-[11px] font-medium text-[#8b909a]">
                  Jika disabled, slot tidak akan dihitung. Total slots disimpan sebagai kapasitas paket.
                </p>
              </div>

              <div>
                <Label>Trip Category</Label>
                <div className="mt-2 flex w-fit rounded-lg border border-[#e6dfe5] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setCategory("local")}
                    className={`h-9 rounded-md px-5 text-xs font-bold ${category === "local" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
                  >
                    Domestic
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("international")}
                    className={`h-9 rounded-md px-5 text-xs font-bold ${category === "international" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
                  >
                    International
                  </button>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Media"
              action={<span className="text-[10px] font-bold text-[#8b7f89]">{uploadedMedia.length} / 5 Uploaded</span>}
            >
              <div className="grid grid-cols-5 gap-3">
                {uploadedMedia.length < 5 && <UploadBox primary onUpload={handleUpload} />}
                {uploadedMedia.map((item) => (
                  <UploadPreview
                    key={item.url}
                    url={item.url}
                    onRemove={() => removeMedia(item.url)}
                  />
                ))}
                {Array.from({ length: Math.max(0, 4 - uploadedMedia.length) }).map((_, index) => (
                  <UploadPreview key={`empty-${index}`} onUpload={handleUpload} />
                ))}
              </div>
            </FormSection>

            <FormSection title="Trip Summary">
              <div>
                <Label>Trip Summary</Label>
                <textarea
                  name="summary"
                  className="mt-2 h-28 w-full resize-none rounded-md border border-[#e6dfe5] bg-white px-3 py-3 text-sm outline-none placeholder:text-[#a0a4ad]"
                  placeholder="Describe the essence of this journey..."
                />
              </div>
            </FormSection>

            <FormSection title="Amenities & Facilities">
              <div className="grid gap-5 md:grid-cols-2">
                <AmenityColumn
                  title="What's included"
                  items={amenitiesIncluded}
                  placeholder="e.g. 4-star accommodation"
                  onAdd={() => addAmenity("included")}
                  onRemove={(index) => removeAmenity("included", index)}
                  onChange={(index, value) => updateAmenity("included", index, value)}
                />
                <AmenityColumn
                  title="What's not included"
                  items={amenitiesExcluded}
                  placeholder="e.g. International flights"
                  onAdd={() => addAmenity("excluded")}
                  onRemove={(index) => removeAmenity("excluded", index)}
                  onChange={(index, value) => updateAmenity("excluded", index, value)}
                />
              </div>
            </FormSection>

            <FormSection title="Itinerary (Rencana Perjalanan)">
              <div className="space-y-4">
                {itineraries.map((item, index) => (
                  <div key={item.day} className="rounded-lg border border-[#eadfe5] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-[#ffe8ea] px-3 py-1 text-xs font-bold text-[#e9272e]">
                        Day {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItinerary(index)}
                        className="text-[#8b7f89]"
                        aria-label={`Remove day ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <input
                        value={item.title}
                        onChange={(event) => updateItinerary(index, "title", event.target.value)}
                        className="h-10 rounded-md border border-[#e6dfe5] px-3 text-sm outline-none"
                        placeholder="Day Title (e.g. Arrival in Tokyo)"
                      />
                      <textarea
                        value={item.description}
                        onChange={(event) => updateItinerary(index, "description", event.target.value)}
                        className="h-20 resize-none rounded-md border border-[#e6dfe5] px-3 py-2 text-sm outline-none"
                        placeholder="Description of the day's events..."
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addItinerary}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#dacfd6] bg-white text-xs font-bold text-[#6f7480]"
              >
                <Plus size={14} />
                Add Another Day
              </button>
            </FormSection>

            <FormSection title="Highlights (Sorotan)">
              <div className="flex flex-wrap gap-2 rounded-lg border border-[#e6dfe5] bg-white p-2">
                {highlights.map((highlight) => (
                  <button
                    key={highlight}
                    type="button"
                    onClick={() => setHighlights((items) => items.filter((item) => item !== highlight))}
                    className="rounded-md bg-[#f6edf0] px-3 py-2 text-xs font-semibold text-[#6f4751]"
                    title="Klik untuk menghapus highlight"
                  >
                    {highlight} ×
                  </button>
                ))}
                <input
                  value={highlightInput}
                  onChange={(event) => setHighlightInput(event.target.value)}
                  onBlur={() => addHighlight(highlightInput)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addHighlight(highlightInput);
                    }
                  }}
                  className="min-w-[180px] flex-1 px-2 py-2 text-sm outline-none"
                  placeholder="Type highlight and press Enter..."
                />
              </div>
            </FormSection>

            <FormSection title="Pricing & Discount">
              <div className="grid gap-5 md:grid-cols-[1fr_340px]">
                <div className="space-y-5">
                  <Field name="base_price" label="Base Price" placeholder="0.00" />
                  <Checkbox name="discount_enabled" label="Enable Discount" />
                  <Field name="child_price" label="Child Pricing" placeholder="0.00" />
                  <Checkbox name="child_discount_enabled" label="Enable Discount" />
                </div>
                <div className="rounded-xl bg-[#f4f7ff] p-5">
                  <Field name="discount_price" label="Discount Price" placeholder="0.00" />
                  <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
                    15%
                  </div>
                  <Field name="child_discount_price" label="Child Discount Price" placeholder="0.00" />
                  <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
                    10%
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection title="Scheduling">
              <div>
                <Label>Schedule Type</Label>
                <div className="mt-2 flex w-fit rounded-lg border border-[#e6dfe5] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setScheduleType("date_range")}
                    className={`h-9 rounded-md px-4 text-xs font-semibold ${scheduleType === "date_range" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
                  >
                    Date Range
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType("flexible")}
                    className={`h-9 rounded-md px-4 text-xs font-bold ${scheduleType === "flexible" ? "bg-[#e9272e] text-white" : "text-[#575d68]"}`}
                  >
                    Custom / Flexible
                  </button>
                </div>
              </div>
              <div className="space-y-5">
                {scheduleType === "date_range" && (
                  <DateRange title="Package Dates" startName="package_start" endName="package_end" />
                )}

                <div className="rounded-xl border border-[#eadfe5] bg-white p-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
                    <input
                      type="checkbox"
                      checked={visibilityEnabled}
                      onChange={(event) => setVisibilityEnabled(event.target.checked)}
                      className="accent-[#e9272e]"
                    />
                    Add Visibility Schedule
                  </label>
                  <p className="mt-2 text-[11px] font-medium text-[#8b909a]">
                    Jika tidak dicentang, trip bisa muncul terus tanpa batas tanggal publish.
                  </p>
                  {visibilityEnabled && (
                    <div className="mt-4">
                      <DateRange
                        title="Visibility Schedule (When to publish)"
                        startName="publish_start"
                        endName="publish_end"
                      />
                    </div>
                  )}
                </div>
              </div>
            </FormSection>

            <FormSection title="Other Package Reference">
              <p className="text-xs text-[#7d838d]">
                Add reference packages so this content finds alternatives if this
                package is a perfect match.
              </p>
              <input
                name="reference"
                className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
                placeholder="Search package title..."
              />
            </FormSection>
          </form>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#eceaf2] bg-white/85 px-6 py-4 shadow-[0_-20px_60px_-48px_rgba(17,24,39,0.8)] backdrop-blur lg:left-[188px]">
        <div className="mx-auto flex max-w-[760px] justify-end gap-3">
          <button
            form="trip-form"
            type="submit"
            onClick={() => {
              submitStatus.current = "draft";
            }}
            disabled={saving}
            className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-xs font-bold text-[#6f7480] ring-1 ring-[#e6dfe5] disabled:opacity-60"
          >
            <Save size={14} />
            {saving && submitStatus.current === "draft" ? "Saving..." : "Save as Draft"}
          </button>
          <button
            form="trip-form"
            type="submit"
            onClick={() => {
              submitStatus.current = "published";
            }}
            disabled={saving}
            className="flex h-11 items-center gap-2 rounded-lg bg-[#e9272e] px-5 text-xs font-bold text-white disabled:opacity-60"
          >
            <Send size={14} />
            {saving && submitStatus.current === "published" ? "Publishing..." : "Publish Trip"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
  muted,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex h-10 items-center gap-3 rounded-lg px-3 text-xs font-semibold",
        active ? "bg-[#f0d8db] text-[#c1121f]" : muted ? "text-[#69707c]" : "text-[#535762]",
      ].join(" ")}
    >
      {icon}
      {label}
    </Link>
  );
}

function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-[-0.02em]">
          <span className="mr-1 text-[#e9272e]">*</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-[#6b6067]">{children}</div>;
}

function Field({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        name={name}
        className="mt-2 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none placeholder:text-[#9da2ad]"
        placeholder={placeholder}
      />
    </label>
  );
}

function DurationPicker({
  days,
  nights,
  onDaysChange,
  onNightsChange,
}: {
  days: string;
  nights: string;
  onDaysChange: (value: string) => void;
  onNightsChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>Duration</Label>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <NumberStepper
          label="Days"
          value={days}
          onChange={onDaysChange}
          min={0}
          placeholder="0"
        />
        <NumberStepper
          label="Nights"
          value={nights}
          onChange={onNightsChange}
          min={0}
          placeholder="0"
        />
      </div>
    </div>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  placeholder: string;
}) {
  const numericValue = Number(value || 0);
  const setNextValue = (nextValue: number) => {
    onChange(String(Math.max(min, nextValue)));
  };

  return (
    <div className="rounded-lg border border-[#e6dfe5] bg-white px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b7f89]">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent text-lg font-extrabold text-[#171923] outline-none"
          placeholder={placeholder}
        />
        <div className="flex flex-col overflow-hidden rounded-md border border-[#eadfe5]">
          <button
            type="button"
            onClick={() => setNextValue(numericValue + 1)}
            className="flex h-5 w-7 items-center justify-center bg-[#fbfaff] text-[#6f7480] hover:bg-[#f6edf0]"
            aria-label={`Increase ${label}`}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => setNextValue(numericValue - 1)}
            className="flex h-5 w-7 items-center justify-center border-t border-[#eadfe5] bg-[#fbfaff] text-[#6f7480] hover:bg-[#f6edf0]"
            aria-label={`Decrease ${label}`}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotToggle({
  label,
  enabled,
  value,
  placeholder,
  onEnabledChange,
  onValueChange,
}: {
  label: string;
  enabled: boolean;
  value: string;
  placeholder: string;
  onEnabledChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg bg-[#fbfaff] p-3 ring-1 ring-[#f0e7ed]">
      <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="accent-[#e9272e]"
        />
        {label}
      </label>
      {enabled && (
        <input
          type="number"
          min="1"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none placeholder:text-[#9da2ad]"
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function UploadBox({
  primary,
  onUpload,
}: {
  primary?: boolean;
  onUpload?: (file?: File) => void;
}) {
  return (
    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
      <ImageIcon size={18} className={primary ? "text-[#e9272e]" : undefined} />
      {primary && <span className="mt-2 text-[10px] font-bold text-[#8b7f89]">Upload</span>}
      {primary && (
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onUpload?.(event.target.files?.[0])}
        />
      )}
    </label>
  );
}

function UploadPreview({
  url,
  onUpload,
  onRemove,
}: {
  url?: string;
  onUpload?: (file?: File) => void;
  onRemove?: () => void;
}) {
  if (url) {
    return (
      <div className="relative flex aspect-square overflow-hidden rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${assetURL(url)})` }}
          />
          <div className="absolute inset-0 bg-black/10" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#e9272e] shadow-sm"
            aria-label="Remove uploaded media"
          >
            <Trash2 size={13} />
          </button>
        </>
      </div>
    );
  }

  return (
    <label className="relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]">
      <ImageIcon size={18} />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onUpload?.(event.target.files?.[0])}
      />
    </label>
  );
}

function AmenityColumn({
  title,
  items,
  placeholder,
  onAdd,
  onRemove,
  onChange,
}: {
  title: string;
  items: string[];
  placeholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <input
              value={item}
              onChange={(event) => onChange(index, event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="h-9 w-9 rounded-md bg-[#f4f2f7] text-[#6f7480]"
              aria-label={`Remove ${title} item ${index + 1}`}
            >
              <Trash2 size={13} className="mx-auto" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 flex items-center gap-2 text-xs font-bold text-[#e9272e]"
      >
        <Plus size={13} />
        Add Item
      </button>
    </div>
  );
}

function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const tone =
    toast.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : toast.type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div className="fixed right-6 top-6 z-50 max-w-sm">
      <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${tone}`}>
        <div className="flex items-start gap-3">
          <span className="leading-6">{toast.text}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-current opacity-70 hover:opacity-100"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
      <input name={name} defaultChecked={checked} type="checkbox" className="accent-[#e9272e]" />
      {label}
    </label>
  );
}

function DateRange({
  title,
  startName,
  endName,
}: {
  title: string;
  startName: string;
  endName: string;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          name={startName}
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
        <span className="text-xs text-[#8b909a]">to</span>
        <input
          name={endName}
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
      </div>
    </div>
  );
}
