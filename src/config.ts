import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Load .env first, then .env.local (which overrides). Neither is required.
loadEnv();
loadEnv({ path: ".env.local", override: true });

/**
 * All environment + tunable search criteria in one place.
 * Criteria have sensible defaults so they can be changed without redeploying
 * (override via env), and are also easy to edit here directly.
 */

const numFromEnv = (v: string | undefined, fallback: number): number =>
  v === undefined || v === "" ? fallback : Number(v);

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  DIGEST_FROM: z.string().optional(),
  DIGEST_TO: z.string().optional(),
  DRY_RUN: z.string().optional(),
  PREVIEW: z.string().optional(),
  TZ: z.string().default("Europe/Stockholm"),
});

const env = EnvSchema.parse(process.env);

export const config = {
  dryRun: Boolean(env.DRY_RUN),
  /** Send an email of ALL current matches without deduping or persisting. */
  preview: Boolean(env.PREVIEW),
  tz: env.TZ,

  db: {
    url: env.DATABASE_URL,
  },

  email: {
    apiKey: env.RESEND_API_KEY,
    from: env.DIGEST_FROM,
    to: env.DIGEST_TO,
  },

  bostad: {
    baseUrl: "https://bostad.stockholm.se",
    listPath: "/AllaAnnonser",
    userAgent:
      "apt-scraper/1.0 (personal daily digest; contact via bostad.stockholm.se account)",
    /** Polite delay between per-listing detail fetches (ms). */
    detailDelayMs: 400,
  },

  criteria: {
    central: {
      maxRent: numFromEnv(process.env.CENTRAL_MAX_RENT, 15000),
      minRooms: numFromEnv(process.env.CENTRAL_MIN_ROOMS, 3),
      minSqm: numFromEnv(process.env.CENTRAL_MIN_SQM, 60),
      /** Require the ad to offer a viewing ("blir aktuell / inbjuden till visning"). */
      requireViewing: true,
    },
    tempBonus: {
      /** Korttid ads are surfaced only when inside tullarna AND this cheap. */
      maxRent: numFromEnv(process.env.TEMP_BONUS_MAX_RENT, 10000),
    },
    youth: {
      age: numFromEnv(process.env.YOUTH_AGE, 19),
      /**
       * Show the primary "endast {age} år" section. Off until explicitly
       * enabled (e.g. YOUTH_EXACT=1 YOUTH_AGE=20).
       */
      exactEnabled: Boolean(process.env.YOUTH_EXACT),
      /** Show the "bredare åldersspann" bonus section. Off until YOUTH_RANGE=1. */
      rangeEnabled: Boolean(process.env.YOUTH_RANGE),
    },
  },
} as const;

function assertEmailConfigured(missing: string[]): void {
  if (!config.email.apiKey) missing.push("RESEND_API_KEY");
  if (!config.email.from) missing.push("DIGEST_FROM");
  if (!config.email.to) missing.push("DIGEST_TO");
}

/** Validate that everything required for a real (non-dry) run is present. */
export function assertRunnable(): void {
  const missing: string[] = [];
  if (!config.db.url) missing.push("DATABASE_URL");
  assertEmailConfigured(missing);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env for a live run: ${missing.join(", ")}. ` +
        `Set them or run with DRY_RUN=1.`,
    );
  }
}

/** Preview mode needs email config but no database. */
export function assertPreviewable(): void {
  const missing: string[] = [];
  assertEmailConfigured(missing);
  if (missing.length > 0) {
    throw new Error(`Missing email env for PREVIEW: ${missing.join(", ")}.`);
  }
}
