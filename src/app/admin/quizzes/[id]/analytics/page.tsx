import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { analyzeQuiz } from "@/lib/analytics";
import { requireAdmin } from "@/lib/auth";
import { formatPoints } from "@/lib/grading";
import { attemptResults, getQuizFull, listAttempts } from "@/lib/quizzes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rateTone(p: number) {
  return p >= 75 ? "bg-success" : p >= 50 ? "bg-warn" : "bg-danger";
}

export default async function AnalyticsPage(props: PageProps<"/admin/quizzes/[id]/analytics">) {
  await requireAdmin();
  const quiz = await getQuizFull((await props.params).id);
  if (!quiz) notFound();
  const rows = await listAttempts(quiz.id);
  const stats = analyzeQuiz(
    quiz.questions,
    rows.map((a) => attemptResults(a, quiz)),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/quizzes/${quiz.id}/attempts`} className="text-sm text-muted hover:text-foreground">
          ← Attempts
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{quiz.title}</h1>
        <p className="mt-1 text-muted">
          Question analytics from {rows.length} submitted attempt{rows.length === 1 ? "" : "s"}.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted">No attempts yet — analytics appear once students submit.</div>
      ) : (
        quiz.questions.map((q, i) => {
          const s = stats[i];
          return (
            <article key={q.id} className="card p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span className="font-medium uppercase tracking-wide">Question {i + 1}</span>
                <span>
                  {s.asked} asked · {s.answered} answered
                  {s.avgEarned != null && <> · avg {formatPoints(Math.round(s.avgEarned * 100) / 100)} / {formatPoints(q.points)} pts</>}
                </span>
              </div>
              <Markdown>{q.text}</Markdown>

              {s.correctRate != null && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">Answered correctly</span>
                    <span className="font-medium tabular-nums">{s.correctRate}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border">
                    <div className={`h-full rounded-full ${rateTone(s.correctRate)}`} style={{ width: `${s.correctRate}%` }} />
                  </div>
                </div>
              )}

              {q.type === "numeric" ? (
                <div className="mt-4 text-sm">
                  <p className="text-muted">
                    Correct answer: <span className="font-mono text-foreground">{q.numericAnswer}</span>
                    {q.numericTolerance > 0 && <> ± {q.numericTolerance}</>}
                  </p>
                  {s.numericValues.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.numericValues.map((v) => (
                        <Bar key={v.value} label={<span className="font-mono">{v.value}</span>} count={v.count} total={s.asked} />
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <ul className="mt-4 space-y-1.5">
                  {q.choices.map((c, ci) => (
                    <Bar
                      key={c.id}
                      label={
                        <span className="flex min-w-0 items-start gap-2">
                          <span className="w-4 shrink-0 text-xs font-semibold text-muted">{LETTERS[ci]}</span>
                          <Markdown inline className="min-w-0 flex-1">{c.text}</Markdown>
                          {c.isCorrect && <span className="shrink-0 text-xs text-success">Correct</span>}
                          {s.topDistractor === c.id && <span className="shrink-0 text-xs text-danger">Top distractor</span>}
                        </span>
                      }
                      count={s.choiceCounts[c.id] ?? 0}
                      total={s.asked}
                      tone={c.isCorrect ? "bg-success" : s.topDistractor === c.id ? "bg-danger" : "bg-accent"}
                    />
                  ))}
                </ul>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}

function Bar({
  label,
  count,
  total,
  tone = "bg-accent",
}: {
  label: React.ReactNode;
  count: number;
  total: number;
  tone?: string;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <li className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm sm:grid-cols-[1fr_12rem]">
      <div className="min-w-0">{label}</div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-14 text-right text-xs tabular-nums text-muted">
          {count} · {pct}%
        </span>
      </div>
    </li>
  );
}
