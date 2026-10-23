"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { regradeAttempts, saveQuiz } from "@/app/admin/actions";
import { formatPoints } from "@/lib/grading";
import { TRUE_FALSE_LABELS, type QuizInput } from "@/lib/quiz-format";
import { MarkdownField } from "./MarkdownField";

type QuestionType = QuizInput["questions"][number]["type"];
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
  numericAnswer: null,
  numericTolerance: 0,
  showExplanation: false,
  choices: [blankChoice(), blankChoice(), blankChoice(), blankChoice()],
});

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single answer",
  multiple: "Multiple answers",
  true_false: "True / False",
  numeric: "Numeric",
};

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
      numericAnswer: q.type === "numeric" ? q.numericAnswer : null,
      numericTolerance: q.type === "numeric" ? q.numericTolerance : 0,
      // Numeric questions keep their choices in the draft (so switching back restores them) but don't save them.
      choices: q.type === "numeric" ? [] : q.choices.map(({ id, text, correct }) => ({ id, text, correct })),
    })),
  };
}

/** Changes a question's type, reshaping its choices to fit. */
function withType(q: DraftQuestion, type: QuestionType): DraftQuestion {
  if (type === "true_false") {
    // Reuse the first two choices' ids so past attempts still line up.
    const firstCorrect = Math.max(0, q.choices.slice(0, 2).findIndex((c) => c.correct));
    const choices = TRUE_FALSE_LABELS.map((text, i) => ({
      ...(q.choices[i] ?? blankChoice()),
      text,
      correct: i === firstCorrect,
    }));
    return { ...q, type, choices };
  }
  if (type === "single") {
    // Keep only the first correct choice when switching to single-answer.
    let seen = false;
    const choices = q.choices.map((c) => {
      const keep = c.correct && !seen;
      if (c.correct) seen = true;
      return { ...c, correct: keep };
    });
    return { ...q, type, choices };
  }
  return { ...q, type };
}

// Dates travel as Date objects; <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInput(d: Date | null) {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (s: string) => (s ? new Date(s) : null);
const optionalInt = (s: string) => (s ? Math.max(1, Math.round(Number(s))) : null);

const EMPTY: QuizInput = {
  title: "",
  description: "",
  timeLimitMinutes: null,
  shuffleQuestions: false,
  shuffleChoices: false,
  answerReveal: "immediately",
  published: false,
  opensAt: null,
  closesAt: null,
  maxAttempts: null,
  requireName: false,
  collectStudentId: false,
  questionPoolSize: null,
  scoring: "all_or_nothing",
  negativeMarking: 0,
  questions: [],
};

type Backup = { draft: Draft; at: number };

function readBackup(key: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const backup = JSON.parse(raw) as Backup;
    // JSON turns dates into strings.
    const date = (v: Date | string | null) => (v ? new Date(v) : null);
    backup.draft = { ...backup.draft, opensAt: date(backup.draft.opensAt), closesAt: date(backup.draft.closesAt) };
    return backup;
  } catch {
    return null;
  }
}

function writeBackup(key: string, backup: Backup | null) {
  try {
    if (backup) window.localStorage.setItem(key, JSON.stringify(backup));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage full or blocked — the backup is a convenience only.
  }
}

export function QuizEditor({
  quizId,
  initial,
  attemptCount = 0,
}: {
  quizId: string | null;
  initial?: QuizInput;
  attemptCount?: number;
}) {
  const router = useRouter();
  const backupKey = `quizzer:editor:${quizId ?? "new"}`;
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial ?? EMPTY));
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [preview, setPreview] = useState(true);
  const [pending, startTransition] = useTransition();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [regradeMessage, setRegradeMessage] = useState<string | null>(null);

  // Start new quizzes with one question ready to fill in, and offer to restore an unsaved draft.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random keys and storage are client-only
    if (!initial) setDraft((d) => (d.questions.length ? d : { ...d, questions: [blankQuestion()] }));
    setBackup(readBackup(backupKey));
  }, [initial, backupKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    const t = setTimeout(() => writeBackup(backupKey, { draft, at: Date.now() }), 500);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(t);
    };
  }, [dirty, draft, backupKey]);

  const patch = (p: Partial<Draft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };
  const patchQuestion = (key: string, fn: (q: DraftQuestion) => DraftQuestion) => {
    setDirty(true);
    setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.key === key ? fn(q) : q)) }));
  };
  const moveQuestion = (from: number, to: number) => {
    setDirty(true);
    setDraft((d) => {
      if (to < 0 || to >= d.questions.length || from === to) return d;
      const qs = [...d.questions];
      const [moved] = qs.splice(from, 1);
      qs.splice(to, 0, moved);
      return { ...d, questions: qs };
    });
  };
  const removeQuestion = (key: string) => {
    setDirty(true);
    setDraft((d) => ({ ...d, questions: d.questions.filter((x) => x.key !== key) }));
  };

  const save = (thenPreview = false) => {
    setErrors([]);
    startTransition(async () => {
      const res = await saveQuiz(quizId, fromDraft(draft));
      if ("errors" in res) {
        setErrors(res.errors);
        return;
      }
      writeBackup(backupKey, null);
      setBackup(null);
      setDraft(toDraft(res.quiz));
      setDirty(false);
      setSavedAt(new Date());
      if (thenPreview) window.open(`/quiz/${res.id}`, "_blank");
      if (!quizId) router.replace(`/admin/quizzes/${res.id}`);
    });
  };

  const regrade = () => {
    if (!quizId || !confirm("Re-grade every past attempt against the current answer key? Scores may change.")) return;
    setRegradeMessage(null);
    startTransition(async () => {
      const { count } = await regradeAttempts(quizId);
      setRegradeMessage(`Re-graded ${count} attempt${count === 1 ? "" : "s"}.`);
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

      {backup && !dirty && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <span>You have unsaved changes from {new Date(backup.at).toLocaleString()}.</span>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-primary py-1.5"
              onClick={() => {
                setDraft(backup.draft);
                setDirty(true);
                setBackup(null);
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="btn-ghost py-1.5"
              onClick={() => {
                writeBackup(backupKey, null);
                setBackup(null);
              }}
            >
              Discard
            </button>
          </span>
        </div>
      )}

      {quizId && attemptCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span>
            {attemptCount} attempt{attemptCount === 1 ? " has" : "s have"} been submitted. Past results keep the grading
            they were submitted with.
            {regradeMessage && <strong className="ml-1">{regradeMessage}</strong>}
          </span>
          <button
            type="button"
            className="btn-ghost py-1.5"
            disabled={pending || dirty}
            title={dirty ? "Save your changes first" : undefined}
            onClick={regrade}
          >
            Re-grade past attempts
          </button>
        </div>
      )}

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
              onChange={(e) => patch({ timeLimitMinutes: optionalInt(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="opens" className="label">Opens</label>
            <input
              id="opens"
              type="datetime-local"
              className="input"
              value={toLocalInput(draft.opensAt)}
              onChange={(e) => patch({ opensAt: fromLocalInput(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="closes" className="label">Closes</label>
            <input
              id="closes"
              type="datetime-local"
              className="input"
              value={toLocalInput(draft.closesAt)}
              onChange={(e) => patch({ closesAt: fromLocalInput(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="attempts" className="label">Attempts per student</label>
            <input
              id="attempts"
              type="number"
              min={1}
              className="input"
              placeholder="Unlimited"
              value={draft.maxAttempts ?? ""}
              onChange={(e) => patch({ maxAttempts: optionalInt(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="pool" className="label">Questions per attempt</label>
            <input
              id="pool"
              type="number"
              min={1}
              max={draft.questions.length || undefined}
              className="input"
              placeholder={`All (${draft.questions.length})`}
              value={draft.questionPoolSize ?? ""}
              onChange={(e) => patch({ questionPoolSize: optionalInt(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="reveal" className="label">Reveal answers</label>
            <select
              id="reveal"
              className="input"
              value={draft.answerReveal}
              onChange={(e) => patch({ answerReveal: e.target.value as Draft["answerReveal"] })}
            >
              <option value="immediately">Right after submitting</option>
              <option value="after_close">After the quiz closes</option>
              <option value="never">Never</option>
            </select>
          </div>
          <div>
            <label htmlFor="scoring" className="label">Multiple-answer scoring</label>
            <select
              id="scoring"
              className="input"
              value={draft.scoring}
              onChange={(e) => patch({ scoring: e.target.value as Draft["scoring"] })}
            >
              <option value="all_or_nothing">All or nothing</option>
              <option value="partial">Partial credit</option>
            </select>
          </div>
          <div>
            <label htmlFor="negative" className="label">Penalty per wrong answer (%)</label>
            <input
              id="negative"
              type="number"
              min={0}
              max={100}
              step={5}
              className="input"
              value={Math.round(draft.negativeMarking * 100)}
              onChange={(e) => patch({ negativeMarking: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="label">Options</span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Toggle checked={draft.published} onChange={(v) => patch({ published: v })} label="Published" hint="Visible on the quiz list" />
            <Toggle checked={draft.shuffleQuestions} onChange={(v) => patch({ shuffleQuestions: v })} label="Shuffle questions" />
            <Toggle checked={draft.shuffleChoices} onChange={(v) => patch({ shuffleChoices: v })} label="Shuffle choices" />
            <Toggle checked={draft.requireName} onChange={(v) => patch({ requireName: v })} label="Require name" />
            <Toggle
              checked={draft.collectStudentId}
              onChange={(v) => patch({ collectStudentId: v })}
              label="Ask for student ID"
              hint="Attempt limits count per ID"
            />
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
        <section
          key={q.key}
          className={`card p-6 transition ${dragKey === q.key ? "opacity-50" : ""}`}
          draggable={dragKey === q.key}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(index));
          }}
          onDragEnd={() => setDragKey(null)}
          onDragOver={(e) => {
            if (dragKey) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (Number.isInteger(from)) moveQuestion(from, index);
            setDragKey(null);
          }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="cursor-grab select-none rounded px-1 text-muted hover:text-foreground active:cursor-grabbing"
                title="Drag to reorder"
                aria-hidden
                onPointerDown={() => setDragKey(q.key)}
                onPointerUp={() => setDragKey(null)}
              >
                ⋮⋮
              </span>
              <span className="text-sm font-semibold">Question {index + 1}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto py-1.5"
                value={q.type}
                aria-label="Question type"
                onChange={(e) => patchQuestion(q.key, (qq) => withType(qq, e.target.value as QuestionType))}
              >
                {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
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
              <IconButton title="Move up" disabled={index === 0} onClick={() => moveQuestion(index, index - 1)}>↑</IconButton>
              <IconButton title="Move down" disabled={index === draft.questions.length - 1} onClick={() => moveQuestion(index, index + 1)}>↓</IconButton>
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
                  removeQuestion(q.key);
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

          {q.type === "numeric" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`answer-${q.key}`} className="label">Correct answer</label>
                <input
                  id={`answer-${q.key}`}
                  type="number"
                  step="any"
                  className="input font-mono"
                  placeholder="e.g. 3.14"
                  value={q.numericAnswer ?? ""}
                  onChange={(e) =>
                    patchQuestion(q.key, (qq) => ({
                      ...qq,
                      numericAnswer: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label htmlFor={`tolerance-${q.key}`} className="label">Accept within ±</label>
                <input
                  id={`tolerance-${q.key}`}
                  type="number"
                  step="any"
                  min={0}
                  className="input font-mono"
                  value={q.numericTolerance}
                  onChange={(e) =>
                    patchQuestion(q.key, (qq) => ({ ...qq, numericTolerance: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="label mb-0">Choices</span>
                <span className="text-xs text-muted">
                  {q.type === "multiple" ? "Mark every correct answer" : "Click the letter to mark the correct answer"}
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
                          q.type !== "multiple"
                            ? { ...x, correct: x.key === c.key }
                            : x.key === c.key
                              ? { ...x, correct: !x.correct }
                              : x,
                        ),
                      }))
                    }
                    className={`mt-1 grid h-8 w-8 shrink-0 place-items-center text-xs font-semibold transition ${
                      q.type === "multiple" ? "rounded-lg" : "rounded-full"
                    } ${
                      c.correct
                        ? "bg-success text-white dark:text-stone-950"
                        : "border border-border text-muted hover:border-success hover:text-success"
                    }`}
                  >
                    {c.correct ? "✓" : LETTERS[ci]}
                  </button>
                  <div className="min-w-0 flex-1">
                    {q.type === "true_false" ? (
                      <div className="rounded-xl border border-border px-3 py-2 text-sm">{c.text}</div>
                    ) : (
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
                    )}
                  </div>
                  {q.type !== "true_false" && (
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
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-3">
            {q.type !== "numeric" && q.type !== "true_false" && (
              <button
                type="button"
                className="btn-ghost py-1.5 text-xs"
                disabled={q.choices.length >= 26}
                onClick={() => patchQuestion(q.key, (qq) => ({ ...qq, choices: [...qq.choices, blankChoice()] }))}
              >
                + Add choice
              </button>
            )}
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
