"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Report } from "@/lib/mock-data";

export interface LocationInfo {
  lat: number;
  lng: number;
  address?: string;
}

export interface Filters {
  area: string;
  department: string;
  status: string;
}

const DEFAULT_FILTERS: Filters = { area: "all", department: "all", status: "all" };

interface MapContextValue {
  focusReport: (report: Report) => void;
  pendingFocus: Report | null;
  clearFocus: () => void;

  userLocation: LocationInfo | null;

  reportLocation: LocationInfo | null;
  reportRoutePending: boolean;
  startReportAt: (loc: LocationInfo) => void;
  consumeReportRoute: () => void;
  clearReportLocation: () => void;

  filters: Filters;
  setFilters: (f: Filters) => void;
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [pendingFocus, setPendingFocus] = useState<Report | null>(null);
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [reportLocation, setReportLocation] = useState<LocationInfo | null>(null);
  const [reportRoutePending, setReportRoutePending] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const focusReport = useCallback((report: Report) => {
    setPendingFocus(report);
  }, []);

  const clearFocus = useCallback(() => {
    setPendingFocus(null);
  }, []);

  const startReportAt = useCallback((loc: LocationInfo) => {
    setReportLocation(loc);
    setReportRoutePending(true);
  }, []);

  const consumeReportRoute = useCallback(() => {
    setReportRoutePending(false);
  }, []);

  const clearReportLocation = useCallback(() => {
    setReportLocation(null);
    setReportRoutePending(false);
  }, []);

  // Request geolocation on mount
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        // Permission denied or error — leave null
      }
    );
  }, []);

  return (
    <MapContext.Provider
      value={{
        focusReport,
        pendingFocus,
        clearFocus,
        userLocation,
        reportLocation,
        reportRoutePending,
        startReportAt,
        consumeReportRoute,
        clearReportLocation,
        filters,
        setFilters,
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMapFocus() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapFocus must be used within MapProvider");
  return ctx;
}
