import { mkdir, writeFile } from "node:fs/promises";
import { config, assertRunnable, assertPreviewable } from "./config.js";
import { fetchAllListings, fetchDetailText, sleep } from "./bostad/client.js";
import type { Listing } from "./bostad/schema.js";
import {
  isCentralCandidate,
  isCentralMatch,
  isYouthCandidate,
  youthBucketFor,
  isTempBonusMatch,
  type Bucket,
} from "./filter/criteria.js";
import { classifyViewing, parseAgeBand } from "./bostad/viewing.js";
import { renderDigest } from "./digest/render.js";
import { sendDigest } from "./digest/email.js";
import { getDb, closeDb } from "./db/client.js";
import { filterNew, markSent, type DigestItem } from "./digest/dedupe.js";
import { inArray } from "drizzle-orm";
import { sentListings } from "./db/schema.js";

/** Priority when a listing qualifies for more than one bucket. */
const BUCKET_PRIORITY: Bucket[] = ["central", "youth", "youth-range", "temp"];

function dateLabel(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: config.tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/** Fetch detail text once per id, sequentially and politely. */
async function fetchDetails(listings: Listing[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const l of listings) {
    try {
      out.set(l.id, await fetchDetailText(l));
    } catch (err) {
      console.warn(`  detail fetch failed for ${l.id}: ${(err as Error).message}`);
      out.set(l.id, ""); // empty -> classifyViewing 'unknown', ageBand {null,null}
    }
    await sleep(config.bostad.detailDelayMs);
  }
  return out;
}

/** Assign each id to a single bucket by priority; keep first occurrence. */
function dedupeBuckets(items: DigestItem[]): DigestItem[] {
  const chosen = new Map<number, DigestItem>();
  const rank = (b: Bucket) => BUCKET_PRIORITY.indexOf(b);
  for (const item of items) {
    const prev = chosen.get(item.listing.id);
    if (!prev || rank(item.bucket) < rank(prev.bucket)) {
      chosen.set(item.listing.id, item);
    }
  }
  return [...chosen.values()];
}

async function main(): Promise<void> {
  if (config.preview) assertPreviewable();
  else if (!config.dryRun) assertRunnable();
  const mode = config.dryRun ? " [DRY RUN]" : config.preview ? " [PREVIEW]" : "";
  console.log(`apt-scraper run — ${dateLabel()}${mode}`);

  const all = await fetchAllListings();
  console.log(`Fetched ${all.length} listings.`);

  const centralCands = all.filter(isCentralCandidate);
  const youthCands = all.filter(isYouthCandidate);
  const tempMatches = all.filter(isTempBonusMatch);
  console.log(
    `Candidates — central: ${centralCands.length}, youth: ${youthCands.length}, temp: ${tempMatches.length}`,
  );

  // In a real run, skip detail fetches for listings we've already sent.
  // Dry-run and preview don't touch the database at all.
  let alreadySent = new Set<number>();
  const db = config.dryRun || config.preview ? null : getDb();
  if (db) {
    const ids = [
      ...new Set([
        ...centralCands.map((l) => l.id),
        ...youthCands.map((l) => l.id),
        ...tempMatches.map((l) => l.id),
      ]),
    ];
    if (ids.length > 0) {
      const rows = await db
        .select({ id: sentListings.lagenhetId })
        .from(sentListings)
        .where(inArray(sentListings.lagenhetId, ids));
      alreadySent = new Set(rows.map((r) => r.id));
    }
  }

  const needsDetail = [...centralCands, ...youthCands].filter(
    (l, i, arr) =>
      arr.findIndex((x) => x.id === l.id) === i && !alreadySent.has(l.id),
  );
  console.log(`Fetching ${needsDetail.length} detail pages…`);
  const details = await fetchDetails(needsDetail);

  const items: DigestItem[] = [];
  for (const l of centralCands) {
    const text = details.get(l.id) ?? "";
    if (isCentralMatch(l, classifyViewing(text))) {
      items.push({ listing: l, bucket: "central" });
    }
  }
  for (const l of youthCands) {
    const text = details.get(l.id) ?? "";
    const ageBand = parseAgeBand(text);
    const bucket = youthBucketFor(l, ageBand);
    if (bucket) items.push({ listing: l, bucket, ageBand });
  }
  for (const l of tempMatches) items.push({ listing: l, bucket: "temp" });

  const matches = dedupeBuckets(items);
  const nBucket = (b: Bucket) => matches.filter((m) => m.bucket === b).length;
  console.log(
    `Matches — central: ${nBucket("central")}, youth(19): ${nBucket("youth")}, ` +
      `youth-range: ${nBucket("youth-range")}, temp: ${nBucket("temp")}`,
  );

  if (config.dryRun) {
    const digest = renderDigest(matches, dateLabel());
    await mkdir("scratch", { recursive: true });
    await writeFile("scratch/digest.html", digest.html);
    console.log(`\n${digest.text}\n`);
    console.log(`Subject: ${digest.subject}`);
    console.log("Wrote scratch/digest.html (DRY RUN — no email, no DB write).");
    return;
  }

  if (config.preview) {
    const digest = renderDigest(matches, dateLabel());
    await sendDigest(digest);
    console.log(
      `Sent PREVIEW "${digest.subject}" (all ${matches.length} current matches, no DB write).`,
    );
    return;
  }

  // Real run: email only new listings, but always send (even if empty).
  const newItems = await filterNew(db!, matches);
  console.log(`New (not previously sent): ${newItems.length}`);
  const digest = renderDigest(newItems, dateLabel());
  await sendDigest(digest);
  await markSent(db!, newItems);
  console.log(`Sent digest "${digest.subject}" and recorded ${newItems.length} listings.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
