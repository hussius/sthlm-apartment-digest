import { z } from "zod";

/**
 * Shape of one ad in GET /AllaAnnonser. The endpoint returns an array of these.
 * Only fields we rely on are validated; unknown fields are ignored.
 *
 * Note: for "bundled" ads (one ad = many similar units, `Antal` > 1) the
 * per-unit fields `Yta`/`Hyra` are null and the range fields
 * `LägstaHyran`/`HögstaYtan`/... carry the info instead.
 */
export const RawListingSchema = z
  .object({
    "LägenhetId": z.number(),
    AnnonsId: z.number(),
    Stadsdel: z.string().nullable().default(null),
    Gatuadress: z.string().nullable().default(null),
    Kommun: z.string().nullable().default(null),
    Vaning: z.number().nullable().default(null),
    AntalRum: z.number().nullable().default(null),
    Yta: z.number().nullable().default(null),
    Hyra: z.number().nullable().default(null),
    AnnonseradTill: z.string().nullable().default(null),
    AnnonseradFran: z.string().nullable().default(null),
    KoordinatLongitud: z.number().nullable().default(null),
    KoordinatLatitud: z.number().nullable().default(null),
    Url: z.string(),
    Antal: z.number().nullable().default(null),
    Balkong: z.boolean().default(false),
    Hiss: z.boolean().default(false),
    Nyproduktion: z.boolean().default(false),
    Ungdom: z.boolean().default(false),
    Student: z.boolean().default(false),
    Senior: z.boolean().default(false),
    Familjelagenhet: z.boolean().default(false),
    Korttid: z.boolean().default(false),
    Vanlig: z.boolean().default(false),
    KompisUngdom: z.boolean().default(false),
    Lagenhetstyp: z.string().nullable().default(null),
    "LägstaHyran": z.number().nullable().default(null),
    "HögstaHyran": z.number().nullable().default(null),
    "LägstaYtan": z.number().nullable().default(null),
    "HögstaYtan": z.number().nullable().default(null),
    "LägstaAntalRum": z.number().nullable().default(null),
    "HögstaAntalRum": z.number().nullable().default(null),
    LiknadeLagenhetStatistik: z
      .object({
        KotidFordelningQ1: z.number().nullable().default(null),
        KotidFordelningQ3: z.number().nullable().default(null),
      })
      .nullable()
      .default(null),
  })
  .passthrough();

export type RawListing = z.infer<typeof RawListingSchema>;

export const ListListingsSchema = z.array(RawListingSchema);

/** Normalized, easy-to-filter view of an ad. */
export interface Listing {
  id: number;
  annonsId: number;
  address: string;
  district: string;
  /** Rooms — highest available (inclusive for a range/bundle). */
  rooms: number | null;
  /** Size in sqm — highest available. */
  sqm: number | null;
  /** Rent in kr/month — lowest available (inclusive for a range/bundle). */
  rent: number | null;
  lat: number | null;
  lng: number | null;
  url: string;
  deadline: string | null;
  count: number;
  floor: number | null;
  balcony: boolean;
  elevator: boolean;
  newProduction: boolean;
  flags: {
    ungdom: boolean;
    kompisUngdom: boolean;
    student: boolean;
    senior: boolean;
    korttid: boolean;
    vanlig: boolean;
    familj: boolean;
  };
  /** Typical queue time in years to get a similar apartment (Q1–Q3). */
  queueYears: { q1: number | null; q3: number | null } | null;
}

export function normalize(raw: RawListing): Listing {
  const rooms = raw.AntalRum ?? raw["HögstaAntalRum"] ?? raw["LägstaAntalRum"];
  const sqm = raw.Yta ?? raw["HögstaYtan"] ?? raw["LägstaYtan"];
  const rent = raw.Hyra ?? raw["LägstaHyran"] ?? raw["HögstaHyran"];
  const stat = raw.LiknadeLagenhetStatistik;
  return {
    id: raw["LägenhetId"],
    annonsId: raw.AnnonsId,
    address: raw.Gatuadress ?? "",
    district: raw.Stadsdel ?? "",
    rooms: rooms ?? null,
    sqm: sqm ?? null,
    rent: rent ?? null,
    lat: raw.KoordinatLatitud,
    lng: raw.KoordinatLongitud,
    url: raw.Url,
    deadline: raw.AnnonseradTill,
    count: raw.Antal ?? 1,
    floor: raw.Vaning,
    balcony: raw.Balkong,
    elevator: raw.Hiss,
    newProduction: raw.Nyproduktion,
    flags: {
      ungdom: raw.Ungdom,
      kompisUngdom: raw.KompisUngdom,
      student: raw.Student,
      senior: raw.Senior,
      korttid: raw.Korttid,
      vanlig: raw.Vanlig,
      familj: raw.Familjelagenhet,
    },
    queueYears:
      stat && (stat.KotidFordelningQ1 != null || stat.KotidFordelningQ3 != null)
        ? { q1: stat.KotidFordelningQ1, q3: stat.KotidFordelningQ3 }
        : null,
  };
}

export function fullUrl(baseUrl: string, listing: Listing): string {
  return `${baseUrl}${listing.url}`;
}
