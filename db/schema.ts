import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const weeklyReportingSnapshots = sqliteTable(
  "weekly_reporting_snapshots",
  {
    weekKey: text("week_key").primaryKey(),
    scheduledFor: text("scheduled_for").notNull(),
    capturedAt: text("captured_at").notNull(),
    sourceGeneratedAt: text("source_generated_at").notNull(),
    status: text("status").notNull(),
    payloadJson: text("payload_json").notNull(),
  },
);
