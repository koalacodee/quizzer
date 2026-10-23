import { isAdmin } from "@/lib/auth";
import { percent } from "@/lib/grading";
import { attemptResults, getQuizFull, listAttempts, slugify } from "@/lib/quizzes";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function csvCell(v: string | number | boolean | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/quizzes/[id]/attempts">) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const quiz = await getQuizFull((await ctx.params).id);
  if (!quiz) return Response.json({ error: "Not found" }, { status: 404 });
  const rows = await listAttempts(quiz.id);

  const header = ["Name", "Student ID", "Score", "Max", "Percent", "Started", "Submitted", "Duration (s)", "Late"];
  quiz.questions.forEach((_, i) => header.push(`Q${i + 1} answer`, `Q${i + 1} points`));

  const lines = [header.map(csvCell).join(",")];
  for (const a of rows) {
    const byQuestion = new Map(attemptResults(a, quiz).map((r) => [r.questionId, r]));
    const submitted = a.submittedAt ?? a.startedAt;
    const cells: (string | number | boolean | null)[] = [
      a.participantName,
      a.participantId,
      a.score,
      a.maxScore,
      percent(a.score, a.maxScore),
      a.startedAt.toISOString(),
      a.submittedAt?.toISOString() ?? "",
      Math.max(0, Math.round((submitted.getTime() - a.startedAt.getTime()) / 1000)),
      a.late ? "yes" : "",
    ];
    for (const q of quiz.questions) {
      const r = byQuestion.get(q.id);
      if (!r) {
        cells.push("", "");
        continue;
      }
      const answer =
        r.type === "numeric"
          ? (r.selected[0] ?? "")
          : r.choices
              .map((c, i) => (r.selected.includes(c.id) ? LETTERS[i] : null))
              .filter(Boolean)
              .join(" ");
      cells.push(answer, r.earned);
    }
    lines.push(cells.map(csvCell).join(","));
  }

  // BOM so Excel opens UTF-8 names correctly.
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(quiz.title)}-attempts.csv"`,
    },
  });
}
