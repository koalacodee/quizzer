import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "./actions";
import { QuizRowActions } from "./QuizRowActions";
import { quizStatus } from "@/lib/availability";
import { formatPoints } from "@/lib/grading";
import { listQuizzesForAdmin } from "@/lib/quizzes";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage quizzes" };

export default async function AdminPage() {
  await requireAdmin();
  const quizzes = await listQuizzesForAdmin();
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manage quizzes</h1>
          <p className="mt-1 text-muted">Create, import, export and track results.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/export" className="btn-ghost" download>Export all</a>
          <Link href="/admin/import" className="btn-ghost">Import JSON</Link>
          <Link href="/admin/quizzes/new" className="btn-primary">+ New quiz</Link>
          <form action={logout}>
            <button className="btn-ghost text-muted">Log out</button>
          </form>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          No quizzes yet. <Link href="/admin/quizzes/new" className="text-accent underline">Create one</Link> or{" "}
          <Link href="/admin/import" className="text-accent underline">import a JSON file</Link>.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Quiz</th>
                <th className="px-4 py-3 font-medium">Questions</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Avg.</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quizzes.map((q) => (
                <tr key={q.id} className="hover:bg-background/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/quizzes/${q.id}`} className="font-medium hover:text-accent">
                      {q.title}
                    </Link>
                    <div className="text-xs text-muted">
                      Updated {q.updatedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {q.questionCount} · {formatPoints(q.totalPoints)} pts
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/quizzes/${q.id}/attempts`} className="hover:text-accent">
                      {q.attemptCount}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{q.avgPercent == null ? "—" : `${Math.round(q.avgPercent)}%`}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        q.published ? "bg-success-soft text-success" : "border border-border text-muted"
                      }`}
                    >
                      {q.published ? "Published" : "Draft"}
                    </span>
                    {quizStatus(q, now) !== "open" && (
                      <span className="ml-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                        {quizStatus(q, now) === "upcoming" ? "Scheduled" : "Closed"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <QuizRowActions id={q.id} shortCode={q.shortCode} title={q.title} published={q.published} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
