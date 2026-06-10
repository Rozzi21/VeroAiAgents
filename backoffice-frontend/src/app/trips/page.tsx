import { Suspense } from "react";
import { EmptyTripScreen } from "@/components/empty-trip-screen";

function TripFormLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaff] text-sm font-bold text-[#6f7480]">
      Memuat form...
    </main>
  );
}

export default function TripsPage() {
  return (
    <Suspense fallback={<TripFormLoading />}>
      <EmptyTripScreen />
    </Suspense>
  );
}
