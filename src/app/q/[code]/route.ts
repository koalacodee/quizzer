import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quizzes } from "@/db/schema";

/** Short share links: /q/:code → /quiz/:id */
export async function GET(req: Request, ctx: RouteContext<"/q/[code]">) {
  const code = (await ctx.params).code.toLowerCase();
  const quiz = /^[a-z0-9]{4,12}$/.test(code)
    ? await db.query.quizzes.findFirst({ where: eq(quizzes.shortCode, code), columns: { id: true } })
    : undefined;
  return Response.redirect(new URL(quiz ? `/quiz/${quiz.id}` : "/", req.url), 307);
}
