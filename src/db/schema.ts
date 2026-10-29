import {
  pgTable,
  bigint,
  text,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * One row per listing we've already emailed, so the same ad never re-notifies
 * even while it lingers in /AllaAnnonser. Keyed by LagenhetId.
 */
export const sentListings = pgTable("sent_listings", {
  lagenhetId: bigint("lagenhet_id", { mode: "number" }).primaryKey(),
  annonsId: bigint("annons_id", { mode: "number" }),
  bucket: text("bucket").notNull(), // 'central' | 'youth' | 'temp'
  address: text("address"),
  district: text("district"),
  deadline: date("deadline"),
  firstSentAt: timestamp("first_sent_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  raw: jsonb("raw"),
});

export type SentListingRow = typeof sentListings.$inferSelect;
export type NewSentListing = typeof sentListings.$inferInsert;
