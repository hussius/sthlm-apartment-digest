import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { RawListingSchema, normalize, type Listing } from "../src/bostad/schema.ts";
import { pointInPolygon, isCentral } from "../src/filter/central-polygon.ts";
import {
  classifyViewing,
  parseAgeBand,
  ageAdmitted,
  formatAgeBand,
} from "../src/bostad/viewing.ts";
import {
  isCentralCandidate,
  isCentralMatch,
  isYouthCandidate,
  isYouthMatch,
  isTempBonusMatch,
} from "../src/filter/criteria.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (p: string) => join(here, "fixtures", p);
const readFx = (p: string) => readFileSync(fx(p), "utf8");

const sample: Listing[] = JSON.parse(readFx("listings-sample.json")).map(
  (r: unknown) => normalize(RawListingSchema.parse(r)),
);
const byId = (id: number): Listing => {
  const l = sample.find((x) => x.id === id);
  if (!l) throw new Error(`fixture ${id} not found`);
  return l;
};

// --- Polygon: innanför tullarna ---------------------------------------------
test("pointInPolygon: central points are inside", () => {
  assert.ok(isCentral(59.31756, 18.0474), "Brännkyrkagatan (Södermalm)");
  assert.ok(isCentral(59.335, 18.06), "Norrmalm/City");
  assert.ok(isCentral(59.34, 18.085), "Östermalm");
  assert.ok(isCentral(59.335, 18.03), "Kungsholmen");
  assert.ok(isCentral(59.325, 18.07), "Gamla Stan");
});

test("pointInPolygon: across-water / suburban points are outside", () => {
  assert.ok(!isCentral(59.3068, 18.0258), "Liljeholmen (across Årstaviken)");
  assert.ok(!isCentral(59.3159, 18.0118), "Gröndal");
  assert.ok(!isCentral(59.404, 17.944), "Kista");
  assert.ok(!isCentral(59.3467, 17.876), "Blackeberg");
  assert.ok(!isCentral(59.303, 18.09), "Hammarby Sjöstad (south)");
});

test("pointInPolygon: null coords are not central", () => {
  assert.equal(isCentral(null, 18.0), false);
  assert.equal(isCentral(59.33, null), false);
  // raw ray-cast still works directly
  assert.equal(pointInPolygon(59.31756, 18.0474), true);
});

// --- Viewing classifier ------------------------------------------------------
test("classifyViewing distinguishes viewable vs not-shown", () => {
  assert.equal(classifyViewing(readFx("detail-202613865.txt")), "viewable");
  assert.equal(classifyViewing(readFx("detail-202612961.txt")), "viewable");
  assert.equal(classifyViewing(readFx("detail-202612406.txt")), "not-shown");
});

test("classifyViewing returns unknown for unrelated text", () => {
  assert.equal(classifyViewing("Ingen relevant text här."), "unknown");
});

// --- Age band ----------------------------------------------------------------
test("parseAgeBand reads Lägsta/Högsta tillåtna ålder", () => {
  const band = parseAgeBand(readFx("detail-202612406.txt"));
  assert.deepEqual(band, { min: 18, max: 27 });
});

test("ageAdmitted respects bounds; open ends are OK", () => {
  assert.ok(ageAdmitted({ min: 18, max: 27 }, 19));
  assert.ok(ageAdmitted({ min: 18, max: 30 }, 19));
  assert.ok(!ageAdmitted({ min: 20, max: 25 }, 19), "min 20 excludes 19");
  assert.ok(!ageAdmitted({ min: 18, max: 18 }, 19), "max 18 excludes 19");
  assert.ok(ageAdmitted({ min: null, max: null }, 19), "open band admits");
});

test("formatAgeBand renders ranges, single ages, and open ends", () => {
  assert.equal(formatAgeBand({ min: 18, max: 25 }), "18–25 år");
  assert.equal(formatAgeBand({ min: 19, max: 19 }), "endast 19 år");
  assert.equal(formatAgeBand({ min: 20, max: null }), "från 20 år");
  assert.equal(formatAgeBand({ min: null, max: 26 }), "upp till 26 år");
  assert.equal(formatAgeBand({ min: null, max: null }), "ingen åldersgräns");
});

// --- normalize ---------------------------------------------------------------
test("normalize falls back to range fields for bundled ads", () => {
  const senior = byId(202612961); // Hyra/Yta null, ranges present
  assert.equal(senior.rent, 9347, "rent from LägstaHyran");
  assert.equal(senior.sqm, 57, "sqm from HögstaYtan");
  assert.equal(senior.flags.senior, true);
});

// --- Criteria: central -------------------------------------------------------
test("central: viewable Södermalm 89m² matches only when viewable", () => {
  const soder = byId(202613865);
  assert.ok(isCentralCandidate(soder), "passes list-only criteria");
  assert.ok(isCentralMatch(soder, "viewable"));
  assert.ok(!isCentralMatch(soder, "not-shown"), "excluded without viewing");
  assert.ok(!isCentralMatch(soder, "unknown"));
});

test("central: Liljeholmen 3rok fails on polygon", () => {
  const lilje = byId(202614082);
  assert.ok(!isCentralCandidate(lilje), "outside tullarna");
});

test("central: senior + suburban are not candidates", () => {
  assert.ok(!isCentralCandidate(byId(202612961)), "senior flag + far west");
  assert.ok(!isCentralCandidate(byId(202606448)), "suburban vanlig");
});

// --- Criteria: youth ---------------------------------------------------------
test("youth candidates match when age band admits 19", () => {
  const y1 = byId(202612406); // 18–27
  const y2 = byId(202611232); // 18–30
  assert.ok(isYouthCandidate(y1) && isYouthCandidate(y2));
  assert.ok(isYouthMatch(y1, { min: 18, max: 27 }));
  assert.ok(isYouthMatch(y2, { min: 18, max: 30 }));
  assert.ok(!isYouthMatch(y1, { min: 20, max: 27 }), "min 20 excludes 19");
});

test("non-youth listing is not a youth candidate", () => {
  assert.ok(!isYouthCandidate(byId(202613865)));
});

// --- Criteria: temp bonus ----------------------------------------------------
test("temp bonus requires central AND cheap", () => {
  const soderKorttid = byId(202614044); // Söder but 10608 kr > 10000
  assert.ok(!isTempBonusMatch(soderKorttid), "rent above temp cap");
  const grondalKorttid = byId(202614023); // 4639 kr but Gröndal (outside)
  assert.ok(!isTempBonusMatch(grondalKorttid), "cheap but not central");
});
