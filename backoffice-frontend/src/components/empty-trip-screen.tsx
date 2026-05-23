import Link from "next/link";
import {
  CalendarDays,
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

export function EmptyTripScreen() {
  return (
    <div className="min-h-screen bg-[#fbfaff] text-[#171923]">
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

          <form className="mt-9 space-y-8">
            <FormSection title="Basic Info">
              <Field label="Trip Name" placeholder="e.g. Kyoto Autumn Immersion" />
              <Field label="Location" placeholder="City, Region, or Country" />
              <Field label="Duration" placeholder="e.g. 5 Days / 4 Nights" />

              <div>
                <Label>Trip Category</Label>
                <div className="mt-2 flex w-fit rounded-lg border border-[#e6dfe5] bg-white p-1">
                  <button
                    type="button"
                    className="h-9 rounded-md bg-[#e9272e] px-5 text-xs font-bold text-white"
                  >
                    Domestic
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-md px-5 text-xs font-semibold text-[#575d68]"
                  >
                    International
                  </button>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Media"
              action={<span className="text-[10px] font-bold text-[#8b7f89]">0 / 5 Uploaded</span>}
            >
              <div className="grid grid-cols-5 gap-3">
                <UploadBox primary />
                <UploadBox />
                <UploadBox />
                <UploadBox />
                <UploadBox />
              </div>
            </FormSection>

            <FormSection title="Trip Summary">
              <div>
                <Label>Trip Summary</Label>
                <textarea
                  className="mt-2 h-28 w-full resize-none rounded-md border border-[#e6dfe5] bg-white px-3 py-3 text-sm outline-none placeholder:text-[#a0a4ad]"
                  placeholder="Describe the essence of this journey..."
                />
              </div>
            </FormSection>

            <FormSection title="Amenities & Facilities">
              <div className="grid gap-5 md:grid-cols-2">
                <AmenityColumn title="What's included" examples={["e.g. 4-star accommodation", "e.g. Daily breakfast"]} />
                <AmenityColumn title="What's not included" examples={["e.g. International flights"]} />
              </div>
            </FormSection>

            <FormSection title="Itinerary (Rencana Perjalanan)">
              <div className="rounded-lg border border-[#eadfe5] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-[#ffe8ea] px-3 py-1 text-xs font-bold text-[#e9272e]">
                    Day 1
                  </span>
                  <button type="button" className="text-[#8b7f89]">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    className="h-10 rounded-md border border-[#e6dfe5] px-3 text-sm outline-none"
                    placeholder="Day Title (e.g. Arrival in Tokyo)"
                  />
                  <textarea
                    className="h-20 resize-none rounded-md border border-[#e6dfe5] px-3 py-2 text-sm outline-none"
                    placeholder="Description of the day's events..."
                  />
                </div>
              </div>
              <button
                type="button"
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#dacfd6] bg-white text-xs font-bold text-[#6f7480]"
              >
                <Plus size={14} />
                Add Another Day
              </button>
            </FormSection>

            <FormSection title="Highlights (Sorotan)">
              <div className="flex rounded-lg border border-[#e6dfe5] bg-white p-2">
                <span className="rounded-md bg-[#f6edf0] px-3 py-2 text-xs font-semibold text-[#6f4751]">
                  Cultural Tour
                </span>
                <span className="ml-2 rounded-md bg-[#f6edf0] px-3 py-2 text-xs font-semibold text-[#6f4751]">
                  Local Food
                </span>
                <input
                  className="ml-2 min-w-0 flex-1 text-sm outline-none"
                  placeholder="Type highlight and press Enter..."
                />
              </div>
            </FormSection>

            <FormSection title="Pricing & Discount">
              <div className="grid gap-5 md:grid-cols-[1fr_340px]">
                <div className="space-y-5">
                  <Field label="Base Price" placeholder="0.00" />
                  <Checkbox label="Enable Discount" checked />
                  <Field label="Child Pricing" placeholder="0.00" />
                  <Checkbox label="Enable Discount" checked />
                </div>
                <div className="rounded-xl bg-[#f4f7ff] p-5">
                  <Field label="Discount Price" placeholder="0.00" />
                  <div className="mt-3 text-right text-lg font-extrabold text-[#0187a9]">
                    15%
                  </div>
                  <Field label="Child Discount Price" placeholder="0.00" />
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
                  <button type="button" className="h-9 rounded-md px-4 text-xs font-semibold text-[#575d68]">
                    Date Range
                  </button>
                  <button type="button" className="h-9 rounded-md bg-[#f3eef5] px-4 text-xs font-bold text-[#575d68]">
                    Custom / Flexible
                  </button>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <DateRange title="Package Dates" />
                <DateRange title="Visibility Schedule (When to publish)" />
              </div>
            </FormSection>

            <FormSection title="Other Package Reference">
              <p className="text-xs text-[#7d838d]">
                Add reference packages so this content finds alternatives if this
                package is a perfect match.
              </p>
              <input
                className="mt-3 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
                placeholder="Search package title..."
              />
            </FormSection>
          </form>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#eceaf2] bg-white/85 px-6 py-4 shadow-[0_-20px_60px_-48px_rgba(17,24,39,0.8)] backdrop-blur lg:left-[188px]">
        <div className="mx-auto flex max-w-[760px] justify-end gap-3">
          <button className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-xs font-bold text-[#6f7480] ring-1 ring-[#e6dfe5]">
            <Save size={14} />
            Save as Draft
          </button>
          <button className="flex h-11 items-center gap-2 rounded-lg bg-[#e9272e] px-5 text-xs font-bold text-white">
            <Send size={14} />
            Publish Trip
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

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        className="mt-2 h-10 w-full rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none placeholder:text-[#9da2ad]"
        placeholder={placeholder}
      />
    </label>
  );
}

function UploadBox({ primary }: { primary?: boolean }) {
  return (
    <button
      type="button"
      className="flex aspect-square flex-col items-center justify-center rounded-lg border border-[#edf0fa] bg-[#f5f7ff] text-[#b4bac7]"
    >
      <ImageIcon size={18} className={primary ? "text-[#e9272e]" : undefined} />
      {primary && <span className="mt-2 text-[10px] font-bold text-[#8b7f89]">Upload</span>}
    </button>
  );
}

function AmenityColumn({
  title,
  examples,
}: {
  title: string;
  examples: string[];
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 space-y-2">
        {examples.map((example) => (
          <div key={example} className="flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
              placeholder={example}
            />
            <button type="button" className="h-9 w-9 rounded-md bg-[#f4f2f7] text-[#6f7480]">
              <Trash2 size={13} className="mx-auto" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-3 flex items-center gap-2 text-xs font-bold text-[#e9272e]">
        <Plus size={13} />
        Add Item
      </button>
    </div>
  );
}

function Checkbox({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-[#6f4751]">
      <input defaultChecked={checked} type="checkbox" className="accent-[#e9272e]" />
      {label}
    </label>
  );
}

function DateRange({ title }: { title: string }) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
        <span className="text-xs text-[#8b909a]">to</span>
        <input
          type="date"
          className="h-10 min-w-0 rounded-md border border-[#e6dfe5] bg-white px-3 text-xs outline-none"
        />
      </div>
    </div>
  );
}
