import { isAdmin } from "@/lib/auth";
import { EXPORT_VERSION } from "@/lib/quiz-format";
import { getQuizFull, toExport } from "@/lib/quizzes";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/quizzes/[id]/export">) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const quiz = await getQuizFull((await ctx.params).id);
  if (!quiz) return Response.json({ error: "Not found" }, { status: 404 });

  const body = JSON.stringify({ version: EXPORT_VERSION, ...toExport(quiz) }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(quiz.title)}.quiz.json"`,
    },
  });
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
}
