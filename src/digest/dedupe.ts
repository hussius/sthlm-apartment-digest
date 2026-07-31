import { inArray } from "drizzle-orm";
import type { getDb } from "../db/client.js";
import { sentListings } from "../db/schema.js";
import type { Listing } from "../bostad/schema.js";
import type { Bucket } from "../filter/criteria.js";

export interface DigestItem {
  listing: Listing;
  bucket: Bucket;
}

type Db = ReturnType<typeof getDb>;

/** Return only the items not already recorded in sent_listings. */
export async function filterNew(
  db: Db,
  items: DigestItem[],
): Promise<DigestItem[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.listing.id);
  const existing = await db
    .select({ id: sentListings.lagenhetId })
    .from(sentListings)
    .where(inArray(sentListings.lagenhetId, ids));
  const seen = new Set(existing.map((r) => r.id));
  return items.filter((i) => !seen.has(i.listing.id));
}

/** Record items as sent. Idempotent (conflict on lagenhet_id is ignored). */
export async function markSent(db: Db, items: DigestItem[]): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map(({ listing, bucket }) => ({
    lagenhetId: listing.id,
    annonsId: listing.annonsId,
    bucket,
    address: listing.address,
    district: listing.district,
    deadline: listing.deadline,
    raw: listing as unknown as Record<string, unknown>,
  }));
  await db.insert(sentListings).values(rows).onConflictDoNothing();
}
