import { cronJobs } from "convex/server";

// No scheduled jobs. The previous "refresh 311 data" cron ran internal.ingest.sync
// every 4 hours, re-reading the same ~2000 publicIssues rows each time while the
// upstream Vancouver dataset only publishes about once a day. Registering a cron
// here makes it run on every deployment this repo is pushed to, forever, whether
// or not anyone is using the app. Run internal.ingest.sync manually instead.
//
// Before re-enabling: make the sync incremental on last_modified_timestamp rather
// than paging the newest 2000 records by open date.
const crons = cronJobs();

export default crons;
