"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveQuiz } from "@/app/admin/actions";
import { formatPoints } from "@/lib/grading";
import type { QuizInput } from "@/lib/quiz-format";
import { MarkdownField } from "./MarkdownField";

type DraftChoice = { key: string; id?: string; text: string; correct: boolean };
type DraftQuestion = Omit<QuizInput["questions"][number], "choices"> & {
  key: string;
  choices: DraftChoice[];
  showExplanation: boolean;
};
type Draft = Omit<QuizInput, "questions"> & { questions: DraftQuestion[] };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const newKey = () => Math.random().toString(36).slice(2);

const blankChoice = (): DraftChoice => ({ key: newKey(), text: "", correct: false });
const blankQuestion = (): DraftQuestion => ({
  key: newKey(),
  type: "single",
  text: "",
  points: 1,
  explanation: "",
  showExplanation: false,
  choices: [blankChoice(), blankChoice(), blankChoice(), blankChoice()],
});

function toDraft(q: QuizInput): Draft {
  return {
    ...q,
    questions: q.questions.map((qq) => ({
      ...qq,
      key: qq.id ?? newKey(),
      showExplanation: !!qq.explanation,
      choices: qq.choices.map((c) => ({ ...c, key: c.id ?? newKey() })),
    })),
  };
}

function fromDraft(d: Draft): QuizInput {
  return {
    ...d,
    questions: d.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.showExplanation ? q.explanation : "",
      choices: q.choices.map(({ id, text, correct }) => ({ id, text, correct })),
    })),
  };
}

const EMPTY: QuizInput = {
  title: "",
  description: "",
  timeLimitMinutes: null,
  shuffleQuestions: false,
  shuffleChoices: false,
  showAnswers: true,
  published: false,
  questions: [],
};

export function QuizEditor({ quizId, initial }: { quizId: string | null; initial?: QuizInput }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(initial ?? { ...EMPTY, questions: [] }),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [preview, setPreview] = useState(true);
  const [pending, startTransition] = useTransition();

  // Start new quizzes with one question ready to fill in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random keys must be generated client-side
    if (!initial) setDraft((d) => (d.questions.length ? d : { ...d, questions: [blankQuestion()] }));
  }, [initial]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (p: Partial<Draft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };
  const patchQuestion = (key: string, fn: (q: DraftQuestion) => DraftQuestion) => {
    setDirty(true);
    setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.key === key ? fn(q) : q)) }));
  };
  const moveQuestion = (index: number, delta: number) => {
    setDirty(true);
    setDraft((d) => {
      const qs = [...d.questions];
      const j = index + delta;
      if (j < 0 || j >= qs.length) return d;
      [qs[index], qs[j]] = [qs[j], qs[index]];
      return { ...d, questions: qs };
    });
  };

  const save = (thenPreview = false) => {
    setErrors([]);
    startTransition(async () => {
      const res = await saveQuiz(quizId, fromDraft(draft));
      if ("errors" in res) {
        setErrors(res.errors);
        return;
      }
      setDraft(toDraft(res.quiz));
      setDirty(false);
      setSavedAt(new Date());
      if (thenPreview) window.open(`/quiz/${res.id}`, "_blank");
      if (!quizId) router.replace(`/admin/quizzes/${res.id}`);
    });
  };

  const totalPoints = draft.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">← All quizzes</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{quizId ? "Edit quiz" : "New quiz"}</h1>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
          Live preview
        </label>
      </div>

      {/* Quiz settings */}
      <section className="card space-y-5 p-6">
        <div>
          <label htmlFor="title" className="label">Title</label>
          <input
            id="title"
            className="input text-base"
            value={draft.title}
            placeholder="e.g. Lecture 3 — Linear Algebra Basics"
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="description" className="label">Description (Markdown + LaTeX)</label>
          <MarkdownField
            id="description"
            rows={3}
            preview={preview}
            value={draft.description}
            placeholder="What does this quiz cover?"
            onChange={(v) => patch({ description: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="time" className="label">Time limit (minutes)</label>
            <input
              id="time"
              type="number"
              min={1}
              className="input"
              placeholder="Untimed"
              value={draft.timeLimitMinutes ?? ""}
              onChange={(e) =>
                patch({ timeLimitMinutes: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-1 lg:col-span-2">
            <span className="label">Options</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle checked={draft.published} onChange={(v) => patch({ published: v })} label="Published" hint="Visible on the quiz list" />
              <Toggle checked={draft.showAnswers} onChange={(v) => patch({ showAnswers: v })} label="Reveal answers" hint="Show correct answers after submitting" />
              <Toggle checked={draft.shuffleQuestions} onChange={(v) => patch({ shuffleQuestions: v })} label="Shuffle questions" />
              <Toggle checked={draft.shuffleChoices} onChange={(v) => patch({ shuffleChoices: v })} label="Shuffle choices" />
            </div>
          </div>
        </div>
      </section>

      {/* Questions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Questions <span className="text-sm font-normal text-muted">· {draft.questions.length} · {formatPoints(totalPoints)} pts total</span>
        </h2>
      </div>

      {draft.questions.map((q, index) => (
        <section key={q.key} className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">Question {index + 1}</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto py-1.5"
                value={q.type}
                aria-label="Question type"
                onChange={(e) => {
                  const type = e.target.value as "single" | "multiple";
                  patchQuestion(q.key, (qq) => {
                    // Keep only the first correct choice when switching to single-answer.
                    let seen = false;
                    const choices =
                      type === "single"
                        ? qq.choices.map((c) => {
                            const keep = c.correct && !seen;
                            if (c.correct) seen = true;
                            return { ...c, correct: keep };
                          })
                        : qq.choices;
                    return { ...qq, type, choices };
                  });
                }}
              >
                <option value="single">Single answer</option>
                <option value="multiple">Multiple answers</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  className="input w-20 py-1.5"
                  value={q.points}
                  aria-label="Points"
                  onChange={(e) => patchQuestion(q.key, (qq) => ({ ...qq, points: Number(e.target.value) }))}
                />
                pts
              </label>
              <IconButton title="Move up" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>↑</IconButton>
              <IconButton title="Move down" disabled={index === draft.questions.length - 1} onClick={() => moveQuestion(index, 1)}>↓</IconButton>
              <IconButton
                title="Duplicate"
                onClick={() => {
                  setDirty(true);
                  setDraft((d) => {
                    const qs = [...d.questions];
                    qs.splice(index + 1, 0, {
                      ...q,
                      id: undefined,
                      key: newKey(),
                      choices: q.choices.map((c) => ({ ...c, id: undefined, key: newKey() })),
                    });
                    return { ...d, questions: qs };
                  });
                }}
              >
                ⧉
              </IconButton>
              <IconButton
                title="Delete question"
                danger
                onClick={() => {
                  if (q.text && !confirm("Delete this question?")) return;
                  patch({ questions: draft.questions.filter((x) => x.key !== q.key) });
                }}
              >
                ✕
              </IconButton>
            </div>
          </div>

          <MarkdownField
            rows={4}
            preview={preview}
            value={q.text}
            placeholder={"Question text. Markdown and LaTeX supported, e.g. What is $\\frac{d}{dx} x^2$?"}
            onChange={(v) => patchQuestion(q.key, (qq) => ({ ...qq, text: v }))}
          />

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Choices</span>
              <span className="text-xs text-muted">
                {q.type === "single" ? "Click the letter to mark the correct answer" : "Mark every correct answer"}
              </span>
            </div>
            {q.choices.map((c, ci) => (
              <div key={c.key} className="flex items-start gap-2">
                <button
                  type="button"
                  title={c.correct ? "Correct answer" : "Mark as correct"}
                  aria-pressed={c.correct}
                  onClick={() =>
                    patchQuestion(q.key, (qq) => ({
                      ...qq,
                      choices: qq.choices.map((x) =>
                        q.type === "single"
                          ? { ...x, correct: x.key === c.key }
                          : x.key === c.key
                            ? { ...x, correct: !x.correct }
                            : x,
                      ),
                    }))
                  }
                  className={`mt-1 grid h-8 w-8 shrink-0 place-items-center text-xs font-semibold transition ${
                    q.type === "single" ? "rounded-full" : "rounded-lg"
                  } ${
                    c.correct
                      ? "bg-success text-white dark:text-stone-950"
                      : "border border-border text-muted hover:border-success hover:text-success"
                  }`}
                >
                  {c.correct ? "✓" : LETTERS[ci]}
                </button>
                <div className="min-w-0 flex-1">
                  <MarkdownField
                    compact
                    preview={preview}
                    value={c.text}
                    placeholder={`Choice ${LETTERS[ci]}`}
                    onChange={(v) =>
                      patchQuestion(q.key, (qq) => ({
                        ...qq,
                        choices: qq.choices.map((x) => (x.key === c.key ? { ...x, text: v } : x)),
                      }))
                    }
                  />
                </div>
                <IconButton
                  title="Remove choice"
                  disabled={q.choices.length <= 2}
                  onClick={() =>
                    patchQuestion(q.key, (qq) => ({ ...qq, choices: qq.choices.filter((x) => x.key !== c.key) }))
                  }
                  className="mt-1"
                >
                  ✕
                </IconButton>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="btn-ghost py-1.5 text-xs"
                disabled={q.choices.length >= 26}
                onClick={() => patchQuestion(q.key, (qq) => ({ ...qq, choices: [...qq.choices, blankChoice()] }))}
              >
                + Add choice
              </button>
              {!q.showExplanation && (
                <button
                  type="button"
                  className="btn-ghost py-1.5 text-xs"
                  onClick={() => patchQuestion(q.key, (qq) => ({ ...qq, showExplanation: true }))}
                >
                  + Add explanation
                </button>
              )}
            </div>
          </div>

          {q.showExplanation && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">Explanation (shown after submitting)</span>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-danger"
                  onClick={() => patchQuestion(q.key, (qq) => ({ ...qq, showExplanation: false, explanation: "" }))}
                >
                  Remove
                </button>
              </div>
              <MarkdownField
                rows={3}
                preview={preview}
                value={q.explanation}
                placeholder="Why is the answer correct?"
                onChange={(v) => patchQuestion(q.key, (qq) => ({ ...qq, explanation: v }))}
              />
            </div>
          )}
        </section>
      ))}

      <button
        type="button"
        className="w-full rounded-2xl border-2 border-dashed border-border py-6 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        onClick={() => patch({ questions: [...draft.questions, blankQuestion()] })}
      >
        + Add question
      </button>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm">
            {errors.length > 0 ? (
              <details className="text-danger">
                <summary className="cursor-pointer">
                  {errors.length} problem{errors.length > 1 ? "s" : ""} to fix before saving
                </summary>
                <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            ) : dirty ? (
              <span className="text-muted">Unsaved changes</span>
            ) : savedAt ? (
              <span className="text-success">Saved at {savedAt.toLocaleTimeString()}</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => save(true)}>
              Save &amp; preview
            </button>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => save()}>
              {pending ? "Saving…" : "Save quiz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2 hover:bg-background">
      <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function IconButton({
  children,
  danger,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-sm text-muted transition hover:bg-background disabled:opacity-30 ${
        danger ? "hover:text-danger" : "hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}
