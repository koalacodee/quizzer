import { asc } from "drizzle-orm";
import { db } from "@/db";
import { choices, questions, quizzes } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { EXPORT_VERSION } from "@/lib/quiz-format";
import { toExport } from "@/lib/quizzes";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const all = await db.query.quizzes.findMany({
    orderBy: asc(quizzes.createdAt),
    with: {
      questions: { orderBy: asc(questions.position), with: { choices: { orderBy: asc(choices.position) } } },
    },
  });
  const body = JSON.stringify({ version: EXPORT_VERSION, quizzes: all.map(toExport) }, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="quizzes-${date}.json"`,
    },
  });
}
