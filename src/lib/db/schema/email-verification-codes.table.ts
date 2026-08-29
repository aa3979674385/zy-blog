import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Email verification codes for registration.
 * Stores 6-digit codes sent to users before they can complete registration.
 * Each code expires after 5 minutes and can only be used once.
 */
export const emailVerificationCodes = sqliteTable(
  "email_verification_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    used: integer("used", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("email_verification_codes_email_idx").on(table.email),
    index("email_verification_codes_expires_at_idx").on(table.expiresAt),
  ],
);
