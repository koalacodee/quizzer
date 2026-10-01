/**
 * Normalizes a Postgres URL for postgres.js. Neon connection strings include
 * `channel_binding=require`, which postgres.js would otherwise forward to the
 * server as an (unsupported) startup parameter.
 */
export function databaseUrl(raw = process.env.DATABASE_URL) {
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  url.searchParams.delete("channel_binding");
  return url.toString();
}

/** Neon's pooled endpoints (`-pooler` hosts) run PgBouncer in transaction mode. */
export function isPooled(url: string) {
  return new URL(url).hostname.includes("-pooler");
}
