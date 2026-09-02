"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { IssueMap } from "@/components/issue-map";
import { MapProvider, useMapFocus } from "@/lib/map-context";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/reports", label: "All Reports" },
  { href: "/my-reports", label: "My Reports" },
];

/** Navigate to home when a report location is set from the map pin */
function ReportLocationRouter() {
  const { reportRoutePending, consumeReportRoute } = useMapFocus();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!reportRoutePending) return;

    if (pathname !== "/") {
      router.push("/");
      return;
    }

    consumeReportRoute();
  }, [reportRoutePending, pathname, router, consumeReportRoute]);

  return null;
}

function TabBar() {
  const pathname = usePathname();
  return (
    <div className="flex shrink-0 items-center border-b px-4">
      <div className="flex flex-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative px-3 py-2.5 text-sm transition-colors hover:text-foreground",
              (pathname === tab.href || (tab.href === "/reports" && pathname === "/"))
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {tab.label}
            {(pathname === tab.href || (tab.href === "/reports" && pathname === "/")) && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MapProvider>
    <ReportLocationRouter />

    {/* Desktop: map background + floating right panel */}
    <div className="relative hidden h-full flex-1 md:flex">
      <div className="absolute inset-0 z-0">
        <IssueMap />
      </div>
      <div className="relative z-10 ml-auto flex md:my-6 md:mr-6 md:h-[calc(100%-3rem)] md:w-[420px] md:shrink-0 md:flex-col md:overflow-hidden md:rounded-2xl md:bg-background md:shadow-md lg:w-[480px]">
        <Nav />
        <TabBar />
        <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>

    {/* Mobile: stacked layout — map on top, content below, all scrollable */}
    <div className="flex flex-col md:hidden">
      <Nav />
      <div className="relative h-[35vh] shrink-0">
        <IssueMap />
      </div>
      <div className="flex flex-1 flex-col bg-background">
        <TabBar />
        <div className="flex-1">{children}</div>
      </div>
    </div>

    </MapProvider>
  );
}
