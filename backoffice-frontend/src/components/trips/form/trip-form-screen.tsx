"use client";

import { ToastNotification } from "@/components/toast-notification";
import { useTripForm } from "./use-trip-form";
import { TripFormSidebar } from "./trip-form-sidebar";
import { TripFormFooter } from "./trip-form-footer";
import { BasicInfoSection } from "./sections/basic-info-section";
import { MediaSection } from "./sections/media-section";
import { SummarySection } from "./sections/summary-section";
import { AmenitiesSection } from "./sections/amenities-section";
import { ItinerarySection } from "./sections/itinerary-section";
import { HighlightsSection } from "./sections/highlights-section";
import { PricingSection } from "./sections/pricing-section";
import { SchedulingSection } from "./sections/scheduling-section";
import { ReferenceSection } from "./sections/reference-section";

export function TripFormScreen() {
  const form = useTripForm();

  return (
    <div className="min-h-screen bg-[#fbfaff] text-[#171923]">
      {form.toast && (
        <ToastNotification toast={form.toast} onClose={() => form.setToast(null)} />
      )}
      <TripFormSidebar />

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

          <form
            id="trip-form"
            className="mt-9 space-y-8"
            onSubmit={form.handleSubmit}
          >
            <BasicInfoSection basicInfo={form.basicInfo} />
            <MediaSection media={form.media} />
            <SummarySection />
            <AmenitiesSection amenities={form.amenities} />
            <ItinerarySection itinerary={form.itinerary} />
            <HighlightsSection highlights={form.highlights} />
            <PricingSection />
            <SchedulingSection scheduling={form.scheduling} />
            <ReferenceSection />
          </form>
        </div>
      </main>

      <TripFormFooter
        saving={form.saving}
        submitStatus={form.submitStatus}
        onDraftClick={form.setDraftSubmit}
        onPublishClick={form.setPublishedSubmit}
      />
    </div>
  );
}
