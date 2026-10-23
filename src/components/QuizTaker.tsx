"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { resumeAttempt, startAttempt, submitAttempt, type ActiveAttempt } from "@/app/quiz/[id]/actions";
import type { QuizStatus } from "@/lib/availability";
import { formatPoints } from "@/lib/grading";
import { orderChoices } from "@/lib/layout";
import { LocalTime } from "./LocalTime";

type QuestionType = "single" | "multiple" | "true_false" | "numeric";

export type TakerQuiz = {
  id: string;
  title: string;
  description: React.ReactNode;
  published: boolean;
  timeLimitMinutes: number | null;
  totalPoints: number;
  status: QuizStatus;
  opensAt: string | null;
  closesAt: string | null;
  requireName: boolean;
  collectStudentId: boolean;
  questionPoolSize: number | null;
  /** null = unlimited */
  attemptsRemaining: number | null;
  questions: {
    id: string;
    type: QuestionType;
    points: number;
    text: React.ReactNode;
    choices: { id: string; text: React.ReactNode }[];
  }[];
};

type Progress = {
  current: number;
  answers: Record<string, string[]>;
  flagged: string[];
};

type Saved = Progress & { attemptId: string };

const NAME_KEY = "quizzer:name";
const STUDENT_ID_KEY = "quizzer:student-id";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Delays between automatic submit retries when the timer runs out. */
const RETRY_DELAYS = [2_000, 5_000, 10_000];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isAnswered = (answers: Progress["answers"], id: string) => !!answers[id]?.some((v) => v.trim() !== "");

export function QuizTaker({ quiz }: { quiz: TakerQuiz }) {
  const router = useRouter();
  const storageKey = `quizzer:attempt:${quiz.id}`;
  const [session, setSession] = useState<ActiveAttempt | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, answers: {}, flagged: [] });
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Latest answers for submits fired from timers.
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Restore an in-progress attempt (the server is the source of truth for order and deadline).
  useEffect(() => {
    const s = storage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    setName(s?.getItem(NAME_KEY) ?? "");
    setStudentId(s?.getItem(STUDENT_ID_KEY) ?? "");
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(s?.getItem(storageKey) ?? "null");
    } catch {
      s?.removeItem(storageKey);
    }
    if (!saved?.attemptId) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    resumeAttempt(saved.attemptId)
      .then((active) => {
        if (cancelled) return;
        if (active?.status === "in_progress") {
          setSession(active);
          setProgress({ current: saved.current ?? 0, answers: saved.answers ?? {}, flagged: saved.flagged ?? [] });
        } else {
          s?.removeItem(storageKey);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (session) storage()?.setItem(storageKey, JSON.stringify({ ...progress, attemptId: session.attemptId }));
  }, [progress, session, storageKey]);

  const start = () => {
    const s = storage();
    s?.setItem(NAME_KEY, name.trim());
    s?.setItem(STUDENT_ID_KEY, studentId.trim());
    setStartError(null);
    startTransition(async () => {
      try {
        const res = await startAttempt({ quizId: quiz.id, participantName: name, participantId: studentId });
        if ("error" in res) {
          setStartError(res.error);
          return;
        }
        setProgress({ current: 0, answers: {}, flagged: [] });
        setSession(res);
      } catch {
        setStartError("Couldn't reach the server — check your connection and try again.");
      }
    });
  };

  const submit = useCallback(
    async (auto = false) => {
      if (!session) return;
      setError(null);
      setSubmitting(true);
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await submitAttempt({ attemptId: session.attemptId, answers: progressRef.current.answers });
          if ("error" in res) {
            setError(res.error);
            break;
          }
          storage()?.removeItem(storageKey);
          router.push(`/results/${res.attemptId}`);
          return;
        } catch {
          if (!auto || attempt >= RETRY_DELAYS.length) {
            setError("Couldn't reach the server — your answers are saved on this device. Check your connection and submit again.");
            break;
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      setSubmitting(false);
    },
    [session, router, storageKey],
  );

  if (!hydrated) return <div className="card mx-auto h-64 max-w-2xl animate-pulse" />;

  if (!session) {
    return (
      <Intro
        quiz={quiz}
        name={name}
        setName={setName}
        studentId={studentId}
        setStudentId={setStudentId}
        onStart={start}
        starting={starting}
        error={startError}
      />
    );
  }

  return (
    <Runner
      quiz={quiz}
      session={session}
      progress={progress}
      setProgress={setProgress}
      reviewing={reviewing}
      setReviewing={setReviewing}
      onSubmit={submit}
      submitting={submitting}
      error={error}
    />
  );
}

function Intro({
  quiz,
  name,
  setName,
  studentId,
  setStudentId,
  onStart,
  starting,
  error,
}: {
  quiz: TakerQuiz;
  name: string;
  setName: (s: string) => void;
  studentId: string;
  setStudentId: (s: string) => void;
  onStart: () => void;
  starting: boolean;
  error: string | null;
}) {
  const pooled = quiz.questionPoolSize != null && quiz.questionPoolSize < quiz.questions.length;
  const exhausted = quiz.attemptsRemaining === 0;
  // Admins can preview closed or upcoming quizzes; students get a notice instead of a start button.
  const blocked = quiz.published && (quiz.status !== "open" || exhausted);

  return (
    <div className="mx-auto max-w-2xl">
      {!quiz.published && (
        <p className="mb-4 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2 text-sm text-warn">
          Preview — this quiz is not published yet. Only admins can see it.
        </p>
      )}
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{quiz.title}</h1>
        {quiz.description && <div className="mt-4 text-muted">{quiz.description}</div>}

        <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat label="Questions" value={String(pooled ? quiz.questionPoolSize : quiz.questions.length)} />
          <Stat label="Points" value={pooled ? "Varies" : formatPoints(quiz.totalPoints)} />
          <Stat label="Time" value={quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : "Untimed"} />
        </dl>

        {(quiz.opensAt || quiz.closesAt || quiz.attemptsRemaining != null) && (
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {quiz.opensAt && quiz.status === "upcoming" && (
              <li>Opens <LocalTime date={quiz.opensAt} /></li>
            )}
            {quiz.closesAt && (
              <li>
                {quiz.status === "closed" ? "Closed" : "Closes"} <LocalTime date={quiz.closesAt} />
              </li>
            )}
            {quiz.attemptsRemaining != null && (
              <li>
                {quiz.attemptsRemaining} attempt{quiz.attemptsRemaining === 1 ? "" : "s"} remaining
              </li>
            )}
          </ul>
        )}

        {blocked ? (
          <p className="mt-6 rounded-xl border border-border bg-background px-4 py-3 text-center text-sm text-muted">
            {quiz.status === "upcoming"
              ? "This quiz hasn't opened yet — come back later."
              : quiz.status === "closed"
                ? "This quiz is closed."
                : "You've used all your attempts for this quiz."}
          </p>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onStart();
            }}
          >
            <div>
              <label htmlFor="name" className="label">
                Your name {quiz.requireName ? "" : "(optional)"}
              </label>
              <input
                id="name"
                className="input"
                value={name}
                maxLength={100}
                required={quiz.requireName}
                placeholder="So you can find your result later"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {quiz.collectStudentId && (
              <div>
                <label htmlFor="student-id" className="label">Student ID</label>
                <input
                  id="student-id"
                  className="input"
                  value={studentId}
                  maxLength={100}
                  required
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={starting}>
              {starting ? "Starting…" : "Start quiz"}
            </button>
            <p className="text-center text-xs text-muted">
              Tip: use <Kbd>1</Kbd>–<Kbd>9</Kbd> to pick answers and <Kbd>←</Kbd> <Kbd>→</Kbd> to move between questions.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Runner({
  quiz,
  session,
  progress,
  setProgress,
  reviewing,
  setReviewing,
  onSubmit,
  submitting,
  error,
}: {
  quiz: TakerQuiz;
  session: ActiveAttempt;
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  reviewing: boolean;
  setReviewing: (v: boolean) => void;
  onSubmit: (auto?: boolean) => void;
  submitting: boolean;
  error: string | null;
}) {
  const byId = useMemo(() => new Map(quiz.questions.map((q) => [q.id, q])), [quiz.questions]);
  const ordered = useMemo(
    () => session.layout.questionIds.map((id) => byId.get(id)).filter((q) => !!q),
    [session.layout.questionIds, byId],
  );
  const total = ordered.length;
  const current = Math.min(progress.current, total - 1);
  const question = ordered[current];
  const choices = useMemo(
    () => (question ? orderChoices(session.layout.choiceOrder[question.id], question.choices) : []),
    [question, session.layout.choiceOrder],
  );
  const answeredCount = ordered.filter((q) => isAnswered(progress.answers, q.id)).length;

  const goTo = useCallback(
    (i: number) => {
      setReviewing(false);
      setProgress((p) => ({ ...p, current: Math.max(0, Math.min(total - 1, i)) }));
    },
    [total, setProgress, setReviewing],
  );

  const toggleChoice = useCallback(
    (qId: string, cId: string, type: QuestionType) =>
      setProgress((p) => {
        const prev = p.answers[qId] ?? [];
        const next =
          type === "multiple"
            ? prev.includes(cId) ? prev.filter((x) => x !== cId) : [...prev, cId]
            : prev[0] === cId ? [] : [cId];
        return { ...p, answers: { ...p.answers, [qId]: next } };
      }),
    [setProgress],
  );

  const setNumeric = useCallback(
    (qId: string, value: string) =>
      setProgress((p) => ({ ...p, answers: { ...p.answers, [qId]: value === "" ? [] : [value] } })),
    [setProgress],
  );

  const toggleFlag = useCallback(
    (qId: string) =>
      setProgress((p) => ({
        ...p,
        flagged: p.flagged.includes(qId) ? p.flagged.filter((x) => x !== qId) : [...p.flagged, qId],
      })),
    [setProgress],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    if (reviewing || !question) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (/^[1-9]$/.test(e.key)) {
        const choice = choices[Number(e.key) - 1];
        if (choice && question.type !== "numeric") toggleChoice(question.id, choice.id, question.type);
      } else if (e.key === "ArrowRight") {
        if (current === total - 1) setReviewing(true);
        else goTo(current + 1);
      } else if (e.key === "ArrowLeft") {
        goTo(current - 1);
      } else if (e.key.toLowerCase() === "f") {
        toggleFlag(question.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, choices, current, total, reviewing, toggleChoice, toggleFlag, goTo, setReviewing]);

  if (!question) {
    return (
      <div className="card mx-auto max-w-2xl p-8 text-center text-muted">
        This quiz changed since you started.{" "}
        <button type="button" className="text-accent underline" onClick={() => onSubmit()}>
          Submit what you have
        </button>
        .
      </div>
    );
  }

  const isLast = current === total - 1;
  const flagged = new Set(progress.flagged);
  const single = question.type !== "multiple";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="truncate text-sm font-medium text-muted">{quiz.title}</h1>
        {session.deadline && <Countdown deadline={session.deadline} onExpire={() => onSubmit(true)} />}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${(answeredCount / total) * 100}%` }}
        />
      </div>

      {error && !reviewing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" className="btn-primary py-1.5" onClick={() => onSubmit()} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit again"}
          </button>
        </div>
      )}

      {reviewing ? (
        <Review
          ordered={ordered}
          progress={progress}
          onJump={goTo}
          onSubmit={() => onSubmit()}
          submitting={submitting}
          error={error}
        />
      ) : (
        <>
          <article key={question.id} className="card p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="font-medium uppercase tracking-wide">
                Question {current + 1} <span className="opacity-60">/ {total}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5">
                  {formatPoints(question.points)} {question.points === 1 ? "pt" : "pts"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleFlag(question.id)}
                  className={`rounded-full border px-2 py-0.5 transition ${
                    flagged.has(question.id)
                      ? "border-warn bg-warn-soft text-warn"
                      : "border-border hover:text-foreground"
                  }`}
                  title="Flag for review (F)"
                >
                  {flagged.has(question.id) ? "⚑ Flagged" : "⚐ Flag"}
                </button>
              </span>
            </div>

            <div className="text-lg">{question.text}</div>

            {question.type === "multiple" && (
              <p className="mt-3 text-sm text-muted">Select all that apply.</p>
            )}

            {question.type === "numeric" ? (
              <div className="mt-6">
                <label htmlFor={`answer-${question.id}`} className="label">Your answer</label>
                <input
                  id={`answer-${question.id}`}
                  className="input max-w-xs font-mono text-base"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Enter a number"
                  value={progress.answers[question.id]?.[0] ?? ""}
                  onChange={(e) => setNumeric(question.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (isLast) setReviewing(true);
                      else goTo(current + 1);
                    }
                  }}
                />
              </div>
            ) : (
              <ul className="mt-6 space-y-3" role={single ? "radiogroup" : "group"}>
                {choices.map((choice, i) => {
                  const selected = progress.answers[question.id]?.includes(choice.id) ?? false;
                  return (
                    <li key={choice.id}>
                      <button
                        type="button"
                        role={single ? "radio" : "checkbox"}
                        aria-checked={selected}
                        onClick={() => toggleChoice(question.id, choice.id, question.type)}
                        className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-accent bg-accent-soft ring-1 ring-accent"
                            : "border-border hover:border-accent/50 hover:bg-background"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-xs font-semibold transition ${
                            single ? "rounded-full" : "rounded-md"
                          } ${selected ? "bg-accent text-white dark:text-stone-950" : "border border-border text-muted"}`}
                        >
                          {LETTERS[i]}
                        </span>
                        <span className="min-w-0 flex-1">{choice.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={() => goTo(current - 1)} disabled={current === 0}>
              ← Previous
            </button>
            {isLast ? (
              <button type="button" className="btn-primary" onClick={() => setReviewing(true)}>
                Review &amp; submit
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => goTo(current + 1)}>
                Next →
              </button>
            )}
          </div>
        </>
      )}

      {/* Question navigator */}
      <nav className="mt-8" aria-label="Questions">
        <div className="flex flex-wrap justify-center gap-1.5">
          {ordered.map((q, i) => {
            const answered = isAnswered(progress.answers, q.id);
            const active = !reviewing && i === current;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goTo(i)}
                aria-current={active ? "step" : undefined}
                aria-label={`Question ${i + 1}${answered ? ", answered" : ""}${flagged.has(q.id) ? ", flagged" : ""}`}
                className={`relative h-9 w-9 rounded-lg border text-xs font-medium transition ${
                  active
                    ? "border-accent bg-accent text-white dark:text-stone-950"
                    : answered
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-border text-muted hover:border-accent/50"
                }`}
              >
                {i + 1}
                {flagged.has(q.id) && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warn ring-2 ring-background" />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition ${
              reviewing ? "border-accent bg-accent text-white dark:text-stone-950" : "border-border text-muted hover:border-accent/50"
            }`}
          >
            Finish
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          {answeredCount} of {total} answered · progress is saved on this device
        </p>
      </nav>
    </div>
  );
}

function Review({
  ordered,
  progress,
  onJump,
  onSubmit,
  submitting,
  error,
}: {
  ordered: TakerQuiz["questions"];
  progress: Progress;
  onJump: (i: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const unanswered = ordered.map((q, i) => ({ q, i })).filter(({ q }) => !isAnswered(progress.answers, q.id));
  const flagged = ordered.map((q, i) => ({ q, i })).filter(({ q }) => progress.flagged.includes(q.id));

  return (
    <div className="card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Ready to submit?</h2>
      <p className="mt-1 text-muted">
        You answered {ordered.length - unanswered.length} of {ordered.length} questions.
      </p>

      {unanswered.length > 0 && (
        <JumpList title="Unanswered" tone="danger" items={unanswered} onJump={onJump} />
      )}
      {flagged.length > 0 && <JumpList title="Flagged" tone="warn" items={flagged} onJump={onJump} />}

      {error && (
        <p className="mt-6 rounded-xl border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className="btn-ghost" onClick={() => onJump(ordered.length - 1)}>
          ← Back to questions
        </button>
        <button type="button" className="btn-primary px-6 py-3" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Grading…" : "Submit answers"}
        </button>
      </div>
    </div>
  );
}

function JumpList({
  title,
  tone,
  items,
  onJump,
}: {
  title: string;
  tone: "danger" | "warn";
  items: { i: number }[];
  onJump: (i: number) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className={`text-sm font-medium ${tone === "danger" ? "text-danger" : "text-warn"}`}>
        {title} ({items.length})
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map(({ i }) => (
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-medium ${
              tone === "danger" ? "border-danger/40 bg-danger-soft text-danger" : "border-warn/40 bg-warn-soft text-warn"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function Countdown({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, deadline - now);
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const low = left < 60_000;
  return (
    <span
      className={`rounded-full border px-3 py-1 font-mono text-sm tabular-nums ${
        low ? "border-danger/50 bg-danger-soft text-danger" : "border-border text-muted"
      }`}
      aria-live={low ? "polite" : "off"}
    >
      ⏱ {h ? `${h}:${String(m).padStart(2, "0")}` : m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[0.7rem]">{children}</kbd>
  );
}
