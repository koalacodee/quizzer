import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { Markdown } from "@/components/Markdown";
import { formatPoints, gradeQuestion, percent } from "@/lib/grading";
import { getQuizFull, isUuid } from "@/lib/quizzes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your result" };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function verdict(p: number) {
  if (p >= 90) return { text: "Outstanding!", emoji: "🏆" };
  if (p >= 75) return { text: "Great job!", emoji: "🎉" };
  if (p >= 50) return { text: "Good effort — review the misses below.", emoji: "👍" };
  return { text: "Keep practicing — you've got this.", emoji: "📚" };
}

function duration(start: Date | null, end: Date) {
  if (!start) return null;
  const s = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export default async function ResultPage(props: PageProps<"/results/[attemptId]">) {
  const { attemptId } = await props.params;
  if (!isUuid(attemptId)) notFound();
  const attempt = await db.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
  if (!attempt) notFound();
  const quiz = await getQuizFull(attempt.quizId);
  if (!quiz) notFound();

  const pct = percent(attempt.score, attempt.maxScore);
  const results = quiz.questions.map((q) => ({ q, r: gradeQuestion(q, attempt.answers[q.id]) }));
  const correctCount = results.filter(({ r }) => r.correct).length;
  const v = verdict(pct);
  const time = duration(attempt.startedAt, attempt.submittedAt);
  const ringColor = pct >= 75 ? "var(--success)" : pct >= 50 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="card flex flex-col items-center p-8 text-center">
        <p className="text-sm text-muted">{quiz.title}</p>
        <div
          className="relative mt-6 grid h-40 w-40 place-items-center rounded-full"
          style={{ background: `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--border) 0deg)` }}
        >
          <div className="grid h-32 w-32 place-items-center rounded-full bg-surface">
            <div>
              <div className="text-4xl font-semibold tabular-nums">{pct}%</div>
              <div className="text-xs text-muted">
                {formatPoints(attempt.score)} / {formatPoints(attempt.maxScore)} pts
              </div>
            </div>
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold">
          {v.emoji} {v.text}
        </h1>
        {attempt.participantName && <p className="mt-1 text-muted">{attempt.participantName}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
          <span className="rounded-full bg-success-soft px-3 py-1 text-success">{correctCount} correct</span>
          <span className="rounded-full bg-danger-soft px-3 py-1 text-danger">
            {results.length - correctCount} incorrect
          </span>
          {time && <span className="rounded-full border border-border px-3 py-1 text-muted">⏱ {time}</span>}
        </div>
        <div className="mt-8 flex gap-3">
          <Link href={`/quiz/${quiz.id}`} className="btn-ghost">Retake</Link>
          <Link href="/" className="btn-primary">More quizzes</Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Review</h2>
        {!quiz.showAnswers && (
          <p className="text-sm text-muted">Correct answers are hidden for this quiz.</p>
        )}
        {results.map(({ q, r }, i) => {
          const picked = new Set(attempt.answers[q.id] ?? []);
          return (
            <article
              key={q.id}
              className={`card border-l-4 p-5 sm:p-6 ${r.correct ? "border-l-success" : "border-l-danger"}`}
            >
              <div className="mb-3 flex items-center justify-between text-xs text-muted">
                <span className="font-medium uppercase tracking-wide">Question {i + 1}</span>
                <span className={r.correct ? "text-success" : "text-danger"}>
                  {r.correct ? "✓" : "✗"} {formatPoints(r.earned)} / {formatPoints(r.max)}
                </span>
              </div>
              <Markdown>{q.text}</Markdown>
              <ul className="mt-4 space-y-2">
                {q.choices.map((c, ci) => {
                  const mine = picked.has(c.id);
                  const reveal = quiz.showAnswers && c.isCorrect;
                  const tone = reveal
                    ? "border-success/50 bg-success-soft"
                    : mine
                      ? quiz.showAnswers || !r.correct
                        ? "border-danger/50 bg-danger-soft"
                        : "border-success/50 bg-success-soft"
                      : "border-border";
                  return (
                    <li key={c.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ${tone}`}>
                      <span className="mt-0.5 w-4 shrink-0 text-xs font-semibold text-muted">{LETTERS[ci]}</span>
                      <Markdown inline className="min-w-0 flex-1">{c.text}</Markdown>
                      <span className="shrink-0 text-xs text-muted">
                        {mine && "Your answer"}
                        {mine && reveal && " · "}
                        {reveal && <span className="text-success">Correct</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {picked.size === 0 && <p className="mt-2 text-xs text-danger">Not answered</p>}
              {quiz.showAnswers && q.explanation && (
                <div className="mt-4 rounded-xl bg-background p-4 text-sm">
                  <div className="label">Explanation</div>
                  <Markdown>{q.explanation}</Markdown>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
