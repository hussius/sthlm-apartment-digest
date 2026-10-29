import type { DigestItem } from "./dedupe.js";
import type { Listing } from "../bostad/schema.js";
import type { Bucket } from "../filter/criteria.js";
import { formatAgeBand } from "../bostad/viewing.js";
import { config } from "../config.js";

const youthAge = config.criteria.youth.age;
const { exactEnabled: youthExactEnabled, rangeEnabled: youthRangeEnabled } =
  config.criteria.youth;

/** Age-band pill for a youth item, or "" for other buckets. */
function ageBandHtml(item: DigestItem): string {
  if ((item.bucket !== "youth" && item.bucket !== "youth-range") || !item.ageBand)
    return "";
  const label = formatAgeBand(item.ageBand);
  // Highlight when the ad targets exactly the configured age (e.g. "endast 19 år").
  const specific = item.ageBand.min === youthAge && item.ageBand.max === youthAge;
  const bg = specific ? "#fde68a" : "#e0e7ff";
  const fg = specific ? "#92400e" : "#3730a3";
  return `<span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:10px;background:${bg};color:${fg};font-size:12px;font-weight:600;vertical-align:middle;">${esc(label)}</span>`;
}

const baseUrl = config.bostad.baseUrl;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtRent(rent: number | null): string {
  return rent == null ? "–" : `${rent.toLocaleString("sv-SE")} kr/mån`;
}

function fmtSize(l: Listing): string {
  const parts: string[] = [];
  if (l.rooms != null) parts.push(`${l.rooms} rok`);
  if (l.sqm != null) parts.push(`${l.sqm} m²`);
  return parts.join(" · ") || "–";
}

function fmtQueue(l: Listing): string {
  if (!l.queueYears) return "";
  const { q1, q3 } = l.queueYears;
  if (q1 == null && q3 == null) return "";
  if (q1 != null && q3 != null) return `kötid ~${q1}–${q3} år`;
  return `kötid ~${q1 ?? q3} år`;
}

function fmtDeadline(l: Listing): string {
  return l.deadline ? `sök senast ${l.deadline}` : "";
}

function metaLine(l: Listing): string {
  const bits = [fmtQueue(l), fmtDeadline(l)].filter(Boolean);
  if (l.count > 1) bits.unshift(`${l.count} bostäder`);
  return bits.join(" &nbsp;·&nbsp; ");
}

function itemHtml(item: DigestItem): string {
  const l = item.listing;
  const href = `${baseUrl}${l.url}`;
  const title = esc([l.address, l.district].filter(Boolean).join(", "));
  const meta = metaLine(l);
  return `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid #ececec;">
      <a href="${href}" style="font-size:16px;font-weight:600;color:#1a56db;text-decoration:none;">${title}</a>${ageBandHtml(item)}
      <div style="margin-top:4px;font-size:14px;color:#111;">
        ${esc(fmtSize(l))} &nbsp;·&nbsp; <strong>${esc(fmtRent(l.rent))}</strong>
      </div>
      ${meta ? `<div style="margin-top:3px;font-size:13px;color:#666;">${meta}</div>` : ""}
    </td>
  </tr>`;
}

const ALL_SECTIONS: { bucket: Bucket; title: string; empty: string; short: string }[] = [
  { bucket: "central", title: "Centralt · innanför tullarna", empty: "Inga nya centrala bostäder idag.", short: "centralt" },
  { bucket: "youth", title: `Ungdomsbostäder · endast ${youthAge} år`, empty: `Inga nya ${youthAge}-årsbostäder idag.`, short: `${youthAge}-års` },
  { bucket: "temp", title: "Korttid · bonus (centralt & billigt)", empty: "Inga nya korttidsbostäder idag.", short: "korttid" },
  { bucket: "youth-range", title: "Ungdom · bredare åldersspann (bonus — längre kötid)", empty: "Inga nya i bredare åldersspann idag.", short: "ungdom övrigt" },
];

const SECTIONS = ALL_SECTIONS.filter(
  (s) =>
    (s.bucket !== "youth" || youthExactEnabled) &&
    (s.bucket !== "youth-range" || youthRangeEnabled),
);

function sortItems(bucket: Bucket, items: DigestItem[]): DigestItem[] {
  const byRent = (a: DigestItem, b: DigestItem) =>
    (a.listing.rent ?? Infinity) - (b.listing.rent ?? Infinity);
  if (bucket === "youth" || bucket === "youth-range") {
    return [...items].sort((a, b) => {
      const qa = a.listing.queueYears?.q1 ?? Infinity;
      const qb = b.listing.queueYears?.q1 ?? Infinity;
      return qa - qb || byRent(a, b);
    });
  }
  return [...items].sort(byRent);
}

function sectionHtml(title: string, empty: string, items: DigestItem[]): string {
  const body =
    items.length === 0
      ? `<tr><td style="padding:10px 0;font-size:14px;color:#999;">${empty}</td></tr>`
      : items.map(itemHtml).join("");
  return `
  <h2 style="margin:28px 0 4px;font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#333;">
    ${esc(title)} <span style="color:#999;font-weight:400;">(${items.length})</span>
  </h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>`;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export function renderDigest(allItems: DigestItem[], dateLabel: string): RenderedDigest {
  // Drop items belonging to hidden sections so counts match what's shown.
  const items = allItems.filter((i) => SECTIONS.some((s) => s.bucket === i.bucket));
  const byBucket = (b: Bucket) =>
    sortItems(b, items.filter((i) => i.bucket === b));

  const total = items.length;
  const breakdown = SECTIONS.map((s) => ({ short: s.short, n: byBucket(s.bucket).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.short}`)
    .join(", ");
  const subject =
    total === 0
      ? `Bostadsdigest ${dateLabel} — inga nya`
      : `Bostadsdigest ${dateLabel} — ${total} nya (${breakdown})`;

  const sectionsHtml = SECTIONS.map((s) =>
    sectionHtml(s.title, s.empty, byBucket(s.bucket)),
  ).join("");

  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;padding:28px 28px 32px;">
        <tr><td>
          <div style="font-size:13px;color:#888;">Bostadsförmedlingen i Stockholm · ${esc(dateLabel)}</div>
          <h1 style="margin:6px 0 0;font-size:22px;color:#111;">Nya bostäder ${total > 0 ? `(${total})` : ""}</h1>
          ${sectionsHtml}
          <p style="margin:32px 0 0;font-size:12px;color:#aaa;line-height:1.5;">
            Centralt: ≥${config.criteria.central.minRooms} rok eller ≥${config.criteria.central.minSqm} m², ≤${config.criteria.central.maxRent.toLocaleString("sv-SE")} kr, med visning.
            Korttid visas endast om centralt och ≤${config.criteria.tempBonus.maxRent.toLocaleString("sv-SE")} kr.
            ${[
              youthExactEnabled
                ? `Ungdomsbostäder för exakt ${youthAge} år (egen kort kö) visas som huvudträffar.`
                : "",
              youthRangeEnabled
                ? `Ungdomsbostäder med bredare åldersspann som omfattar ${youthAge} år hamnar i bonuslistan (längre kötid).`
                : "",
            ].filter(Boolean).join(" ")}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = renderText(items, dateLabel);
  return { subject, html, text };
}

function renderText(items: DigestItem[], dateLabel: string): string {
  const lines: string[] = [`Bostadsdigest ${dateLabel}`, ""];
  for (const s of SECTIONS) {
    const group = sortItems(s.bucket, items.filter((i) => i.bucket === s.bucket));
    lines.push(`== ${s.title} (${group.length}) ==`);
    if (group.length === 0) lines.push(`  ${s.empty}`);
    for (const item of group) {
      const l = item.listing;
      const meta = [fmtSize(l), fmtRent(l.rent), fmtQueue(l), fmtDeadline(l)]
        .filter(Boolean)
        .join(" · ");
      const age =
        (item.bucket === "youth" || item.bucket === "youth-range") && item.ageBand
          ? `  [${formatAgeBand(item.ageBand)}]`
          : "";
      lines.push(`  ${[l.address, l.district].filter(Boolean).join(", ")}${age}`);
      lines.push(`    ${meta}`);
      lines.push(`    ${baseUrl}${l.url}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
