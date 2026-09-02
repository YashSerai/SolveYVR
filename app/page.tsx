"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportChat } from "@/components/report-chat";
import { useMapFocus } from "@/lib/map-context";
import ReportsPage from "@/app/reports/page";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reportLocation, clearReportLocation } = useMapFocus();
  const reportRequested = searchParams.get("report") === "1";
  const chatOpen = reportRequested || reportLocation !== null;
  const chatKey = reportLocation
    ? `${reportLocation.lat}:${reportLocation.lng}:${reportLocation.address ?? ""}`
    : "new-report";

  function closeChat() {
    clearReportLocation();
    if (reportRequested) router.replace("/");
  }

  if (chatOpen) {
    return (
      <>
        {/* Mobile: fixed fullscreen overlay above everything */}
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
          <ReportChat
            key={chatKey}
            onClose={closeChat}
            initialLocation={reportLocation}
          />
        </div>
        {/* Desktop: fits within the panel */}
        <div className="absolute inset-0 hidden flex-col md:flex">
          <ReportChat
            key={chatKey}
            onClose={closeChat}
            initialLocation={reportLocation}
          />
        </div>
      </>
    );
  }

  return <ReportsPage />;
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
