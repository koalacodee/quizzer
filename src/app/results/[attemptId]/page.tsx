import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { LocalTime } from "@/components/LocalTime";
import { Markdown } from "@/components/Markdown";
import { isAdmin } from "@/lib/auth";
import { canRevealAnswers, quizStatus } from "@/lib/availability";
import { formatPoints, percent } from "@/lib/grading";
import { attemptResults, attemptsRemaining, getQuizFull, isUuid } from "@/lib/quizzes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your result" };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function verdict(p: number) {
  if (p >= 90) return { text: "Outstanding!", emoji: "🏆" };
  if (p >= 75) return { text: "Great job!", emoji: "🎉" };
  if (p >= 50) return { text: "Good effort — review the misses below.", emoji: "👍" };
  return { text: "Keep practicing — you've got this.", emoji: "📚" };
}

function duration(start: Date, end: Date | null) {
  if (!end) return null;
  const s = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export default async function ResultPage(props: PageProps<"/results/[attemptId]">) {
  const { attemptId } = await props.params;
  if (!isUuid(attemptId)) notFound();
  const attempt = await db.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
  if (!attempt || attempt.status !== "submitted") notFound();
  const quiz = await getQuizFull(attempt.quizId);
  if (!quiz) notFound();

  const admin = await isAdmin();
  const reveal = canRevealAnswers(quiz, new Date(), admin);
  const results = attemptResults(attempt, quiz);
  const pct = percent(attempt.score, attempt.maxScore);
  const correctCount = results.filter((r) => r.correct).length;
  const v = verdict(pct);
  const time = duration(attempt.startedAt, attempt.submittedAt);
  const ringColor = pct >= 75 ? "var(--success)" : pct >= 50 ? "var(--warn)" : "var(--danger)";

  const remaining = await attemptsRemaining(quiz, {
    clientToken: (await cookies()).get("quizzer_pid")?.value ?? "",
    participantId: attempt.participantId,
  });
  const canRetake = quiz.published && quizStatus(quiz) === "open" && remaining !== 0;

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
        {(attempt.participantName || attempt.participantId) && (
          <p className="mt-1 text-muted">
            {[attempt.participantName, attempt.participantId].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
          <span className="rounded-full bg-success-soft px-3 py-1 text-success">{correctCount} correct</span>
          <span className="rounded-full bg-danger-soft px-3 py-1 text-danger">
            {results.length - correctCount} incorrect
          </span>
          {time && <span className="rounded-full border border-border px-3 py-1 text-muted">⏱ {time}</span>}
          {attempt.late && <span className="rounded-full bg-warn-soft px-3 py-1 text-warn">Submitted late</span>}
        </div>
        <div className="mt-8 flex gap-3">
          {canRetake && (
            <Link href={`/q/${quiz.shortCode}`} className="btn-ghost">
              Retake{remaining != null && ` (${remaining} left)`}
            </Link>
          )}
          <Link href="/" className="btn-primary">More quizzes</Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Review</h2>
        {!reveal && (
          <p className="text-sm text-muted">
            {quiz.answerReveal === "after_close" && quiz.closesAt ? (
              <>Correct answers will be revealed after <LocalTime date={quiz.closesAt} />.</>
            ) : (
              "Correct answers are hidden for this quiz."
            )}
          </p>
        )}
        {results.map((r, i) => {
          const picked = new Set(r.selected);
          const partial = !r.correct && r.earned > 0;
          const border = r.correct ? "border-l-success" : partial ? "border-l-warn" : "border-l-danger";
          const tone = r.correct ? "text-success" : partial ? "text-warn" : "text-danger";
          return (
            <article key={r.questionId} className={`card border-l-4 p-5 sm:p-6 ${border}`}>
              <div className="mb-3 flex items-center justify-between text-xs text-muted">
                <span className="font-medium uppercase tracking-wide">Question {i + 1}</span>
                <span className={tone}>
                  {r.correct ? "✓" : partial ? "◐" : "✗"} {formatPoints(r.earned)} / {formatPoints(r.points)}
                </span>
              </div>
              <Markdown>{r.text}</Markdown>
              {r.type === "numeric" ? (
                <div className="mt-4 space-y-2 text-sm">
                  <div
                    className={`rounded-xl border px-3 py-2 ${
                      !r.answered ? "border-border" : r.correct ? "border-success/50 bg-success-soft" : "border-danger/50 bg-danger-soft"
                    }`}
                  >
                    <span className="text-xs text-muted">Your answer: </span>
                    <span className="font-mono">{r.selected[0] ?? "—"}</span>
                  </div>
                  {reveal && (
                    <div className="rounded-xl border border-success/50 bg-success-soft px-3 py-2">
                      <span className="text-xs text-muted">Correct answer: </span>
                      <span className="font-mono">{r.numericAnswer}</span>
                      {r.numericTolerance > 0 && <span className="text-muted"> ± {r.numericTolerance}</span>}
                    </div>
                  )}
                </div>
              ) : (
                <ul className="mt-4 space-y-2">
                  {r.choices.map((c, ci) => {
                    const mine = picked.has(c.id);
                    const shownCorrect = reveal && c.isCorrect;
                    const choiceTone = shownCorrect
                      ? "border-success/50 bg-success-soft"
                      : mine
                        ? reveal || !r.correct
                          ? "border-danger/50 bg-danger-soft"
                          : "border-success/50 bg-success-soft"
                        : "border-border";
                    return (
                      <li key={c.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ${choiceTone}`}>
                        <span className="mt-0.5 w-4 shrink-0 text-xs font-semibold text-muted">{LETTERS[ci]}</span>
                        <Markdown inline className="min-w-0 flex-1">{c.text}</Markdown>
                        <span className="shrink-0 text-xs text-muted">
                          {mine && "Your answer"}
                          {mine && shownCorrect && " · "}
                          {shownCorrect && <span className="text-success">Correct</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!r.answered && <p className="mt-2 text-xs text-danger">Not answered</p>}
              {reveal && r.explanation && (
                <div className="mt-4 rounded-xl bg-background p-4 text-sm">
                  <div className="label">Explanation</div>
                  <Markdown>{r.explanation}</Markdown>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
