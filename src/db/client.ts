import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Lazily create the Drizzle client (only when DATABASE_URL is set). */
export function getDb() {
  if (!config.db.url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!_db) {
    _sql = postgres(config.db.url, { max: 1 });
    _db = drizzle(_sql, { schema });
  }
  return _db;
}

/** Close the underlying connection so the process can exit cleanly. */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}

export { schema };
