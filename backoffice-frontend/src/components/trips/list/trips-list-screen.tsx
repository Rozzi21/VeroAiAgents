"use client";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/confirm-modal";
import { TripCardContextMenu } from "@/components/trip-card-context-menu";
import { ToastNotification } from "@/components/toast-notification";
import { useTripsList } from "./use-trips-list";
import { BackofficeSidebar } from "../shared/backoffice-sidebar";
import { TripsSearchHeader } from "./trips-search-header";
import { TripsToolbar } from "./trips-toolbar";
import { TripCard } from "./trip-card";
import { CreateTripCard } from "./create-trip-card";
import { EmptyPackagesState } from "./empty-packages-state";
import { OnDevelopmentPanel } from "./on-development-panel";
import { InfoModal } from "./info-modal";

export function TripsListScreen() {
  const list = useTripsList();

  return (
    <div className="min-h-screen bg-white text-[#161a23]">
      <BackofficeSidebar
        mode="list"
        activePanel={list.activePanel}
        onPanelChange={list.setActivePanel}
        onModalOpen={list.setModal}
      />

      <main className="lg:pl-[288px]">
        <div className="mx-auto min-h-screen max-w-[1180px] px-6 py-5 md:px-10 lg:px-14">
          <section className={list.activePanel === "dashboard" ? "mt-12" : undefined}>
            {list.activePanel === "dashboard" ? (
              <OnDevelopmentPanel />
            ) : (
              <>
                <TripsSearchHeader query={list.query} onQueryChange={list.setQuery} />

                <TripsToolbar
                  category={list.category}
                  viewMode={list.viewMode}
                  onCategoryChange={list.setCategory}
                  onViewModeChange={list.setViewMode}
                />

                {list.loading ? (
                  <div className="mt-12 rounded-2xl border border-[#eceaf2] bg-[#fdfbff] p-8 text-center text-sm font-semibold text-[#777c88]">
                    Memuat paket trip...
                  </div>
                ) : list.filteredTrips.length > 0 ? (
                  <div
                    className={cn(
                      "mt-12 grid gap-x-9 gap-y-9",
                      list.viewMode === "grid"
                        ? "md:grid-cols-2 xl:grid-cols-3"
                        : "grid-cols-1"
                    )}
                  >
                    {list.filteredTrips.map((trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        viewMode={list.viewMode}
                        busy={list.pendingTripId === trip.id}
                        onContextMenu={list.handleTripContextMenu}
                      />
                    ))}
                    <CreateTripCard />
                  </div>
                ) : (
                  <EmptyPackagesState error={list.error} />
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <InfoModal type={list.modal} onClose={() => list.setModal(null)} />
      <ToastNotification toast={list.toast} onClose={() => list.setToast(null)} />
      {list.confirmModalContent && list.confirmAction && (
        <ConfirmModal
          open
          title={list.confirmModalContent.title}
          description={list.confirmModalContent.description}
          confirmLabel={list.confirmModalContent.confirmLabel}
          cancelLabel="Cancel"
          variant={list.confirmModalContent.variant}
          loading={list.pendingTripId === list.confirmAction.trip.id}
          onConfirm={list.executeConfirmedAction}
          onCancel={list.cancelConfirm}
        />
      )}
      {list.contextMenu && (
        <TripCardContextMenu
          trip={list.contextMenu.trip}
          position={{ x: list.contextMenu.x, y: list.contextMenu.y }}
          onClose={() => list.setContextMenu(null)}
          onEdit={list.handleEditTrip}
          onDelete={list.requestDeleteTrip}
          onStatusChange={list.requestStatusChange}
        />
      )}
    </div>
  );
}
