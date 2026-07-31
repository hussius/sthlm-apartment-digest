import * as cheerio from "cheerio";
import { config } from "../config.js";
import {
  ListListingsSchema,
  normalize,
  type Listing,
} from "./schema.js";

const { baseUrl, listPath, userAgent } = config.bostad;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      // Retry on transient server errors only.
      if (res.status < 500) {
        throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
      }
      lastErr = new Error(`GET ${url} -> ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(500 * (i + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch and normalize every current ad from /AllaAnnonser. */
export async function fetchAllListings(): Promise<Listing[]> {
  const res = await fetchWithRetry(`${baseUrl}${listPath}`, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  const json = await res.json();
  const parsed = ListListingsSchema.parse(json);
  return parsed.map(normalize);
}

/**
 * Fetch a listing's detail page and return its visible text
 * (used by the viewing/age parsers). Markup-independent.
 */
export async function fetchDetailText(listing: Listing): Promise<string> {
  const res = await fetchWithRetry(`${baseUrl}${listing.url}`, {
    headers: { Accept: "text/html", "User-Agent": userAgent },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const main = $("main");
  const text = (main.length ? main : $("body")).text();
  // Collapse whitespace so multi-word phrases match reliably.
  return text.replace(/\s+/g, " ").trim();
}
