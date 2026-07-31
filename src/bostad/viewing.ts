/**
 * Parsers for the per-listing detail page.
 *
 * bostad.stockholm.se detail pages are server-rendered HTML. Rather than depend
 * on specific markup, these work on the page's visible text (see client.ts,
 * which extracts it with cheerio). The wordings below were confirmed against a
 * 30-ad live sample: every ad falls cleanly into "will not be shown" vs.
 * "you'll be invited to a viewing if shortlisted".
 */

export type ViewingStatus = "viewable" | "not-shown" | "unknown";

const NOT_SHOWN = /bostaden\s+kommer\s+inte\s+att\s+visas/i;
// "Om du är en av dem som blir aktuell ... kommer du att bli inbjuden till visning"
const VIEWABLE = /blir\s+aktuell[\s\S]{0,120}?inbjuden\s+till\s+visning/i;

/**
 * Classify whether an apartment can be viewed.
 * - "not-shown": the ad explicitly states it will not be shown.
 * - "viewable": shortlisted applicants are invited to a viewing.
 * - "unknown": neither phrasing found (treat conservatively at the call site).
 */
export function classifyViewing(detailText: string): ViewingStatus {
  if (NOT_SHOWN.test(detailText)) return "not-shown";
  if (VIEWABLE.test(detailText)) return "viewable";
  return "unknown";
}

export interface AgeBand {
  min: number | null;
  max: number | null;
}

const MIN_AGE = /Lägsta\s+tillåtna\s+ålder:\s*(\d{1,3})/i;
const MAX_AGE = /Högsta\s+tillåtna\s+ålder:\s*(\d{1,3})/i;

/** Parse the "Lägsta/Högsta tillåtna ålder" villkor from a detail page. */
export function parseAgeBand(detailText: string): AgeBand {
  const min = detailText.match(MIN_AGE);
  const max = detailText.match(MAX_AGE);
  return {
    min: min ? Number(min[1]) : null,
    max: max ? Number(max[1]) : null,
  };
}

/** Is `age` admitted by the parsed age band? Open-ended sides count as OK. */
export function ageAdmitted(band: AgeBand, age: number): boolean {
  if (band.min != null && age < band.min) return false;
  if (band.max != null && age > band.max) return false;
  return true;
}
