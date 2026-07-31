# apt-scraper — Stockholm rental-apartment daily digest

A daily email digest of **new** rental apartments from
[bostad.stockholm.se](https://bostad.stockholm.se) (Bostadsförmedlingen i
Stockholm) that match saved criteria. Runs once a day on Railway, remembers what
it has already sent (Neon Postgres), and emails only genuinely new listings.

## What it looks for

1. **Central ("innanför tullarna")** — inside a hand-drawn central-Stockholm
   polygon, **≥3 rooms OR ≥60 m²**, **≤15 000 kr/mån**, and **viewable**
   (listings that state "Bostaden kommer inte att visas" are excluded — that's
   the common case). Bundled/senior/student ads are excluded.
2. **Ungdomsbostäder** whose age band admits **19 years** (across all of
   Stockholm; no viewing requirement).
3. **Korttid (temporary) bonus** — only surfaced when central **and** ≤10 000 kr.

All thresholds live in [`src/config.ts`](src/config.ts) and can be overridden
with env vars (see `.env.example`). Just tell the assistant to change them.

## How it works

- `GET /AllaAnnonser` returns every current ad as JSON in one request — the main
  feed needs no headless browser.
- Only the small set of central/youth candidates get their detail page fetched,
  to read the viewing status and the youth age band.
- Matches are diffed against the `sent_listings` table so nothing re-notifies,
  then the digest is emailed (via Resend) and the new ids are recorded.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + Resend vars
npm test                     # unit tests (offline, uses fixtures)
DRY_RUN=1 npm run dev        # real fetch + filter, writes scratch/digest.html, no email/DB
```

`DRY_RUN=1` prints the matches and writes the rendered email to
`scratch/digest.html` without sending or touching the database.

```bash
PREVIEW=1 npm run dev   # emails ALL current matches, skips dedupe, no DB write
```

`PREVIEW=1` actually sends the email (needs the Resend vars) but ignores the
"already sent" table and persists nothing — handy for seeing exactly what the
digest looks like right now without affecting the daily dedupe.

## Configuration (env)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `RESEND_API_KEY` | Resend API key |
| `DIGEST_FROM` | Verified sender, e.g. `Bostadsdigest <digest@yourdomain.se>` |
| `DIGEST_TO` | Recipient(s), comma-separated |
| `TZ` | `Europe/Stockholm` (date label) |
| `DRY_RUN` | Set to `1` for a no-send dry run |
| `CENTRAL_MAX_RENT` / `CENTRAL_MIN_ROOMS` / `CENTRAL_MIN_SQM` | Central criteria overrides |
| `TEMP_BONUS_MAX_RENT` | Korttid bonus rent cap |
| `YOUTH_AGE` | Age used for the youth age-band check (default 19) |

### Email: quickest start with Resend

For the fastest test you can set `DIGEST_FROM="Bostadsdigest <onboarding@resend.dev>"`
and `DIGEST_TO` to the email on your Resend account — Resend allows that sender
without domain verification, but only to your own address. For real delivery to
any address, verify a domain in Resend and use a `@yourdomain.se` sender.

## Database

Schema is a single table, `sent_listings` (see [`src/db/schema.ts`](src/db/schema.ts)).
It's already created on the Neon `apt-scraper` project. To recreate elsewhere:

```bash
npm run db:migrate   # applies drizzle/0000_init.sql
```

## Deploy on Railway (daily cron)

1. Push this repo to GitHub and create a Railway project from it.
2. Railway reads [`railway.json`](railway.json): Nixpacks build (`npm run build`),
   start `node dist/index.js`, cron `0 5 * * *` UTC, no restart.
   - `0 5 * * *` UTC = **07:00** in summer (CEST) / **06:00** in winter (CET).
     Railway cron is UTC-only, so adjust the hour if you want a fixed local time.
3. Set the env vars from the table above in the Railway service
   (`DATABASE_URL`, `RESEND_API_KEY`, `DIGEST_FROM`, `DIGEST_TO`, `TZ`).
4. Trigger the service once from the Railway dashboard to confirm the first email.

The digest always sends — on a quiet day you'll get an "inga nya" email so you
know the job ran.

## Project layout

```
src/
  index.ts              orchestrator (fetch → filter → enrich → dedupe → email → persist)
  config.ts             env + tunable criteria
  bostad/               API client, zod schema + normalize, viewing/age parsers
  filter/               innanför-tullarna polygon + criteria predicates
  db/                   drizzle schema + client
  digest/               dedupe, HTML/text render, Resend email
test/                   node:test unit tests + captured fixtures
```
