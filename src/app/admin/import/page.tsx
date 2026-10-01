import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./ImportForm";

export const metadata: Metadata = { title: "Import quizzes" };

const EXAMPLE = `{
  "title": "Lecture 4 — Probability",
  "description": "Covers **Bayes' rule** and expectation.",
  "timeLimitMinutes": 15,
  "published": true,
  "questions": [
    {
      "type": "single",
      "text": "If $P(A)=0.5$ and $P(B\\\\mid A)=0.2$, what is $P(A \\\\cap B)$?",
      "points": 2,
      "explanation": "$P(A\\\\cap B) = P(A)\\\\,P(B\\\\mid A)$",
      "choices": [
        { "text": "$0.1$", "correct": true },
        { "text": "$0.7$", "correct": false },
        { "text": "$0.25$", "correct": false }
      ]
    },
    {
      "question": "Short form: plain-string choices + answer index (0-based)",
      "grade": 1,
      "choices": ["Yes", "No"],
      "answer": 0
    }
  ]
}`;

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">← All quizzes</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Import quizzes</h1>
        <p className="mt-1 text-muted">
          Upload or paste JSON. A single quiz, an array of quizzes, or an export file (<code>{"{ quizzes: [...] }"}</code>) all work.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ImportForm />
        <aside className="card h-fit p-5 text-sm">
          <h2 className="font-semibold">Format</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li><code>text</code> (or <code>question</code>) — Markdown + LaTeX</li>
            <li><code>points</code> (or <code>grade</code>) — default 1</li>
            <li><code>type</code> — <code>single</code> | <code>multiple</code> (auto-detected)</li>
            <li><code>choices</code> — objects with <code>correct</code>, or strings + <code>answer</code> index/indices</li>
            <li><code>explanation</code> — optional, shown after submitting</li>
          </ul>
          <p className="mt-3 text-muted">Remember to escape backslashes in JSON: <code>\\frac</code>.</p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-background p-3 text-xs leading-relaxed">{EXAMPLE}</pre>
        </aside>
      </div>
    </div>
  );
}
