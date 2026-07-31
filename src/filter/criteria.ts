import { config } from "../config.js";
import type { Listing } from "../bostad/schema.js";
import { isCentral } from "./central-polygon.js";
import { ageAdmitted, type AgeBand, type ViewingStatus } from "../bostad/viewing.js";

export type Bucket = "central" | "youth" | "youth-range" | "temp";

const c = config.criteria;

function meetsSize(listing: Listing): boolean {
  const roomsOk = listing.rooms != null && listing.rooms >= c.central.minRooms;
  const sqmOk = listing.sqm != null && listing.sqm >= c.central.minSqm;
  return roomsOk || sqmOk;
}

/**
 * Stage 1 (list-data only): a listing that *might* be a central match, before
 * we've checked its viewing status. Used to decide which detail pages to fetch.
 */
export function isCentralCandidate(listing: Listing): boolean {
  return (
    isCentral(listing.lat, listing.lng) &&
    meetsSize(listing) &&
    listing.rent != null &&
    listing.rent <= c.central.maxRent &&
    !listing.flags.senior &&
    !listing.flags.student &&
    !listing.flags.korttid
  );
}

/** Stage 2: central candidate confirmed viewable (if viewing is required). */
export function isCentralMatch(
  listing: Listing,
  viewing: ViewingStatus,
): boolean {
  if (!isCentralCandidate(listing)) return false;
  if (!c.central.requireViewing) return true;
  return viewing === "viewable";
}

/** Stage 1: a youth listing, before checking the admitted age band. */
export function isYouthCandidate(listing: Listing): boolean {
  return listing.flags.ungdom || listing.flags.kompisUngdom;
}

/** Stage 2: youth listing whose age band admits the configured age. */
export function isYouthMatch(listing: Listing, band: AgeBand): boolean {
  if (!isYouthCandidate(listing)) return false;
  return ageAdmitted(band, c.youth.age);
}

/**
 * Split youth matches into the primary bucket (listings targeting *exactly* the
 * configured age — e.g. "endast 19 år", which have their own short internal
 * queues) and a demoted "youth-range" bonus bucket (broader bands that admit
 * the age but have prohibitively long queues). Returns null if not a match.
 */
export function youthBucketFor(
  listing: Listing,
  band: AgeBand,
): "youth" | "youth-range" | null {
  if (!isYouthCandidate(listing)) return null;
  if (!ageAdmitted(band, c.youth.age)) return null;
  return band.min === c.youth.age && band.max === c.youth.age
    ? "youth"
    : "youth-range";
}

/**
 * Temporary (Korttid) "bonus": surfaced only when central AND very cheap.
 * No viewing requirement, no detail fetch. Fully decidable from list data.
 */
export function isTempBonusMatch(listing: Listing): boolean {
  return (
    listing.flags.korttid &&
    isCentral(listing.lat, listing.lng) &&
    listing.rent != null &&
    listing.rent <= c.tempBonus.maxRent
  );
}
