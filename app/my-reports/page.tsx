"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { FileText, ExternalLink, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSubmittedReports,
  type SubmittedReport,
} from "@/lib/submitted-reports";

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EMPTY_REPORTS_SNAPSHOT = "[]";
const subscribeToReports = () => () => {};

function getReportsSnapshot(): string {
  return JSON.stringify(getSubmittedReports());
}

function getServerReportsSnapshot(): string {
  return EMPTY_REPORTS_SNAPSHOT;
}

function ReportItem({ report }: { report: SubmittedReport }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold">Submitted</span>
        </div>
        <a
          href={`https://van311.ca/track/${report.ref}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Track
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Reference</span>
          <span className="font-mono font-medium">{report.ref}</span>
        </div>
        {report.caseid && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Case ID</span>
            <span className="font-mono text-muted-foreground">{report.caseid}</span>
          </div>
        )}
        {report.address && (
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 text-muted-foreground">Location</span>
            <span className="truncate text-right">{report.address}</span>
          </div>
        )}
        {report.category && (
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 text-muted-foreground">Category</span>
            <span className="truncate text-right">{report.category}</span>
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {formatDate(report.submittedAt)}
      </span>
    </div>
  );
}

export default function MyReportsPage() {
  const reportsSnapshot = useSyncExternalStore(
    subscribeToReports,
    getReportsSnapshot,
    getServerReportsSnapshot
  );
  const reports = useMemo(
    () => JSON.parse(reportsSnapshot) as SubmittedReport[],
    [reportsSnapshot]
  );

  if (reports.length === 0) {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">No reports yet</h2>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          Reports you submit through the chat will appear here.
        </p>
        <Button size="sm" nativeButton={false} render={<Link href="/" />}>
          Report a new issue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">
          My Reports ({reports.length})
        </h1>
      </div>
      <div className="flex flex-col gap-2">
        {reports.map((report) => (
          <ReportItem key={report.id} report={report} />
        ))}
      </div>
    </div>
  );
}
