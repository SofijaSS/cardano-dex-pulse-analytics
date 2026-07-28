import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dashboardSnapshots = sqliteTable("dashboard_snapshots", {
  id: text("id").primaryKey(),
  payloadJson: text("payload_json"),
  generatedAt: text("generated_at"),
  updatedAt: integer("updated_at").notNull().default(0),
  refreshLeaseUntil: integer("refresh_lease_until").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at"),
  lastError: text("last_error"),
});
