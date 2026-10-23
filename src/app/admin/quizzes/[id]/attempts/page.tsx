import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { requireAdmin } from "@/lib/auth";
import { formatPoints, percent } from "@/lib/grading";
import { getQuizFull, listAttempts } from "@/lib/quizzes";
import { DeleteAttemptButton } from "./DeleteAttemptButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Attempts" };

export default async function AttemptsPage(props: PageProps<"/admin/quizzes/[id]/attempts">) {
  await requireAdmin();
  const quiz = await getQuizFull((await props.params).id);
  if (!quiz) notFound();
  const rows = await listAttempts(quiz.id);
  const pcts = rows.map((a) => percent(a.score, a.maxScore));
  const avg = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;
  const showIds = quiz.collectStudentId || rows.some((a) => a.participantId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">← All quizzes</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{quiz.title}</h1>
          <p className="mt-1 text-muted">
            {rows.length} attempt{rows.length === 1 ? "" : "s"}
            {avg != null && <> · average {avg}% · best {Math.max(...pcts)}%</>}
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/quizzes/${quiz.id}/analytics`} className="btn-ghost">Analytics</Link>
            <a href={`/api/admin/quizzes/${quiz.id}/attempts`} className="btn-ghost" download>Export CSV</a>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted">No one has taken this quiz yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                {showIds && <th className="px-4 py-3 font-medium">Student ID</th>}
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => {
                const p = percent(a.score, a.maxScore);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3">{a.participantName || <span className="text-muted">Anonymous</span>}</td>
                    {showIds && <td className="px-4 py-3 font-mono text-xs">{a.participantId || "—"}</td>}
                    <td className="px-4 py-3">
                      <span className={p >= 75 ? "text-success" : p >= 50 ? "text-warn" : "text-danger"}>{p}%</span>
                      <span className="ml-2 text-xs text-muted">
                        {formatPoints(a.score)}/{formatPoints(a.maxScore)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {a.submittedAt && <LocalTime date={a.submittedAt} />}
                      {a.late && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">Late</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/results/${a.id}`} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground">
                        View
                      </Link>
                      <DeleteAttemptButton id={a.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
