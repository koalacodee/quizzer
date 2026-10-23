import "server-only";
import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window counter in Postgres: one upsert per call, no extra infrastructure.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const windowStart = sql`now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${windowStart} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${windowStart} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });

  // Occasionally sweep stale windows so the table stays small.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
  }
  return row.count <= limit;
}

/** Best-effort client IP (Vercel sets x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
