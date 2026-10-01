# Quizzer

A small, minimalist quiz platform for sharing quick quizzes after each lecture or section.

- **Next.js 16** (App Router, Server Actions) — full-stack
- **Drizzle ORM + PostgreSQL**
- **Markdown + LaTeX** everywhere (questions, choices, explanations, descriptions) via `react-markdown`, `remark-math` + KaTeX, GFM tables and highlighted code blocks
- Tailwind CSS v4, automatic light/dark mode

## Features

**Taking quizzes** (`/`, `/quiz/:id`)
- One question at a time, clean card layout, progress bar and question navigator
- Single-answer and multiple-answer ("select all that apply") questions
- Keyboard shortcuts: `1`–`9` pick an answer, `←`/`→` navigate, `F` flags a question
- Flag questions for review; a review screen lists unanswered and flagged questions before submitting
- Progress is saved in the browser, so a refresh doesn't lose answers
- Optional time limit with auto-submit, optional question/choice shuffling
- Instant grade: score ring, points, correct/incorrect counts, time taken, and a per-question review with correct answers and explanations (can be hidden per quiz)
- Grading happens on the server; correct answers are never sent to the browser before submission

**Managing quizzes** (`/admin`, password-protected)
- Dashboard with question count, points, attempts and average score per quiz
- Editor: title, Markdown description, time limit, publish/shuffle/reveal options; questions with Markdown + LaTeX text, points (grade), choices, correct answer(s), optional explanation; reorder, duplicate, delete; live preview and a formatting toolbar
- Import JSON (upload, drag & drop or paste) with clear validation errors
- Export a single quiz or all quizzes as JSON (re-importable)
- Publish/unpublish, preview drafts, duplicate, copy share link
- Attempts list per quiz (name, score, date) with links to each result

## Getting started

```bash
cp .env.example .env          # set DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npm install
npm run db:migrate            # create tables
npm run db:seed               # optional: adds a sample calculus quiz
npm run dev
```

Open http://localhost:3000 for quizzes and http://localhost:3000/admin to manage them.

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database with Drizzle Studio |
| `npm run db:seed` | Import `examples/sample-quiz.json` |

## JSON format

```jsonc
{
  "title": "Lecture 4 — Probability",
  "description": "Markdown **supported**",
  "timeLimitMinutes": 15,        // null = untimed
  "shuffleQuestions": false,
  "shuffleChoices": false,
  "showAnswers": true,           // reveal answers/explanations after submitting
  "published": true,
  "questions": [
    {
      "type": "single",          // or "multiple" (auto-detected if omitted)
      "text": "If $P(A)=0.5$ and $P(B\\mid A)=0.2$, what is $P(A\\cap B)$?",
      "points": 2,
      "explanation": "$P(A\\cap B)=P(A)\\,P(B\\mid A)$",
      "choices": [
        { "text": "$0.1$", "correct": true },
        { "text": "$0.7$", "correct": false }
      ]
    },
    // Short form: `question`/`grade` aliases, string choices + 0-based `answer` index (or array)
    { "question": "Is $\\pi$ irrational?", "grade": 1, "choices": ["Yes", "No"], "answer": 0 }
  ]
}
```

Import accepts a single quiz, an array of quizzes, or an export file (`{ "version": 1, "quizzes": [...] }`).
Remember that backslashes must be escaped in JSON (`\\frac`, `\\int`).

## Notes

- Grading is all-or-nothing per question: a multiple-answer question earns its points only when the exact set of correct choices is selected.
- Admin auth is a single shared password (`ADMIN_PASSWORD`) with an HMAC-signed, HTTP-only session cookie; `/admin` and `/api/admin` are guarded in `src/proxy.ts` and again inside every server action / route.
- Editing a quiz keeps question and choice ids stable, so past attempts still show up correctly in results.
