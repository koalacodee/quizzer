import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl, isPooled } from "./url";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function createClient() {
  const url = databaseUrl();
  return postgres(url, {
    max: process.env.VERCEL ? 3 : 10,
    // Prepared statements don't work through PgBouncer in transaction mode.
    prepare: !isPooled(url),
  });
}

// Reuse the connection across hot reloads in development.
const client = globalForDb.pgClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
