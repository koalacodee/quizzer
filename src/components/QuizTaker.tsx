"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { submitAttempt } from "@/app/quiz/[id]/actions";
import { formatPoints } from "@/lib/grading";

export type TakerQuiz = {
  id: string;
  title: string;
  description: React.ReactNode;
  published: boolean;
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  totalPoints: number;
  questions: {
    id: string;
    type: "single" | "multiple";
    points: number;
    text: React.ReactNode;
    choices: { id: string; text: React.ReactNode }[];
  }[];
};

type Progress = {
  startedAt: number;
  name: string;
  current: number;
  answers: Record<string, string[]>;
  flagged: string[];
  questionOrder: string[];
  choiceOrder: Record<string, string[]>;
};

const NAME_KEY = "quizzer:name";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function QuizTaker({ quiz }: { quiz: TakerQuiz }) {
  const router = useRouter();
  const storageKey = `quizzer:progress:${quiz.id}`;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [name, setName] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);

  // Restore an in-progress attempt (survives refreshes) and the remembered name.
  useEffect(() => {
    const s = storage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    setName(s?.getItem(NAME_KEY) ?? "");
    const raw = s?.getItem(storageKey);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Progress;
        const ids = new Set(quiz.questions.map((q) => q.id));
        // Drop saved progress if the quiz changed since.
        if (
          saved.questionOrder.length === ids.size &&
          saved.questionOrder.every((id) => ids.has(id))
        ) {
          setProgress(saved);
        } else {
          s?.removeItem(storageKey);
        }
      } catch {
        s?.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, [quiz.questions, storageKey]);

  useEffect(() => {
    if (progress) storage()?.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  const start = () => {
    storage()?.setItem(NAME_KEY, name.trim());
    const qIds = quiz.questions.map((q) => q.id);
    setProgress({
      startedAt: Date.now(),
      name: name.trim(),
      current: 0,
      answers: {},
      flagged: [],
      questionOrder: quiz.shuffleQuestions ? shuffle(qIds) : qIds,
      choiceOrder: Object.fromEntries(
        quiz.questions.map((q) => {
          const cIds = q.choices.map((c) => c.id);
          return [q.id, quiz.shuffleChoices ? shuffle(cIds) : cIds];
        }),
      ),
    });
  };

  const submit = useCallback(() => {
    if (!progress) return;
    setError(null);
    startTransition(async () => {
      const res = await submitAttempt({
        quizId: quiz.id,
        participantName: progress.name,
        answers: progress.answers,
        startedAt: progress.startedAt,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      storage()?.removeItem(storageKey);
      router.push(`/results/${res.attemptId}`);
    });
  }, [progress, quiz.id, router, storageKey]);

  if (!hydrated) return <div className="card mx-auto h-64 max-w-2xl animate-pulse" />;

  if (!progress) {
    return (
      <Intro quiz={quiz} name={name} setName={setName} onStart={start} />
    );
  }

  return (
    <Runner
      quiz={quiz}
      progress={progress}
      setProgress={setProgress}
      reviewing={reviewing}
      setReviewing={setReviewing}
      onSubmit={submit}
      submitting={pending}
      error={error}
    />
  );
}

function Intro({
  quiz,
  name,
  setName,
  onStart,
}: {
  quiz: TakerQuiz;
  name: string;
  setName: (s: string) => void;
  onStart: () => void;
}) {
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
          <Stat label="Questions" value={String(quiz.questions.length)} />
          <Stat label="Points" value={formatPoints(quiz.totalPoints)} />
          <Stat label="Time" value={quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : "Untimed"} />
        </dl>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onStart();
          }}
        >
          <div>
            <label htmlFor="name" className="label">Your name (optional)</label>
            <input
              id="name"
              className="input"
              value={name}
              maxLength={100}
              placeholder="So you can find your result later"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary w-full py-3 text-base">
            Start quiz
          </button>
          <p className="text-center text-xs text-muted">
            Tip: use <Kbd>1</Kbd>–<Kbd>9</Kbd> to pick answers and <Kbd>←</Kbd> <Kbd>→</Kbd> to move between questions.
          </p>
        </form>
      </div>
    </div>
  );
}

function Runner({
  quiz,
  progress,
  setProgress,
  reviewing,
  setReviewing,
  onSubmit,
  submitting,
  error,
}: {
  quiz: TakerQuiz;
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress | null>>;
  reviewing: boolean;
  setReviewing: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const byId = useMemo(() => new Map(quiz.questions.map((q) => [q.id, q])), [quiz.questions]);
  const ordered = progress.questionOrder.map((id) => byId.get(id)!).filter(Boolean);
  const total = ordered.length;
  const current = Math.min(progress.current, total - 1);
  const question = ordered[current];
  const answeredCount = ordered.filter((q) => progress.answers[q.id]?.length).length;

  const update = useCallback(
    (fn: (p: Progress) => Progress) => setProgress((p) => (p ? fn(p) : p)),
    [setProgress],
  );

  const goTo = useCallback(
    (i: number) => {
      setReviewing(false);
      update((p) => ({ ...p, current: Math.max(0, Math.min(total - 1, i)) }));
    },
    [total, update, setReviewing],
  );

  const toggleChoice = useCallback(
    (qId: string, cId: string, type: "single" | "multiple") =>
      update((p) => {
        const prev = p.answers[qId] ?? [];
        const next =
          type === "single"
            ? prev[0] === cId ? [] : [cId]
            : prev.includes(cId) ? prev.filter((x) => x !== cId) : [...prev, cId];
        return { ...p, answers: { ...p.answers, [qId]: next } };
      }),
    [update],
  );

  const toggleFlag = useCallback(
    (qId: string) =>
      update((p) => ({
        ...p,
        flagged: p.flagged.includes(qId) ? p.flagged.filter((x) => x !== qId) : [...p.flagged, qId],
      })),
    [update],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    if (reviewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      const order = progress.choiceOrder[question.id] ?? question.choices.map((c) => c.id);
      if (/^[1-9]$/.test(e.key)) {
        const cId = order[Number(e.key) - 1];
        if (cId) toggleChoice(question.id, cId, question.type);
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
  }, [question, current, total, reviewing, progress.choiceOrder, toggleChoice, toggleFlag, goTo, setReviewing]);

  const isLast = current === total - 1;
  const flagged = new Set(progress.flagged);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="truncate text-sm font-medium text-muted">{quiz.title}</h1>
        {quiz.timeLimitMinutes && (
          <Countdown
            deadline={progress.startedAt + quiz.timeLimitMinutes * 60_000}
            onExpire={onSubmit}
          />
        )}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${(answeredCount / total) * 100}%` }}
        />
      </div>

      {reviewing ? (
        <Review
          ordered={ordered}
          progress={progress}
          onJump={goTo}
          onSubmit={onSubmit}
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

            <ul className="mt-6 space-y-3" role={question.type === "single" ? "radiogroup" : "group"}>
              {(progress.choiceOrder[question.id] ?? question.choices.map((c) => c.id)).map((cId, i) => {
                const choice = question.choices.find((c) => c.id === cId);
                if (!choice) return null;
                const selected = progress.answers[question.id]?.includes(cId) ?? false;
                return (
                  <li key={cId}>
                    <button
                      type="button"
                      role={question.type === "single" ? "radio" : "checkbox"}
                      aria-checked={selected}
                      onClick={() => toggleChoice(question.id, cId, question.type)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-accent bg-accent-soft ring-1 ring-accent"
                          : "border-border hover:border-accent/50 hover:bg-background"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-xs font-semibold transition ${
                          question.type === "single" ? "rounded-full" : "rounded-md"
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
            const answered = !!progress.answers[q.id]?.length;
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
  const unanswered = ordered.map((q, i) => ({ q, i })).filter(({ q }) => !progress.answers[q.id]?.length);
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
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const low = left < 60_000;
  return (
    <span
      className={`rounded-full border px-3 py-1 font-mono text-sm tabular-nums ${
        low ? "border-danger/50 bg-danger-soft text-danger" : "border-border text-muted"
      }`}
      aria-live={low ? "polite" : "off"}
    >
      ⏱ {m}:{String(s).padStart(2, "0")}
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
