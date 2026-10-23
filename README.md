# Quizzer

A small, minimalist quiz platform for sharing quick quizzes after each lecture or section.

- **Next.js 16** (App Router, Server Actions) — full-stack
- **Drizzle ORM + PostgreSQL**
- **Markdown + LaTeX** everywhere (questions, choices, explanations, descriptions) via `react-markdown`, `remark-math` + KaTeX, GFM tables and highlighted code blocks
- Tailwind CSS v4, automatic light/dark mode

## Features

**Taking quizzes** (`/`, `/quiz/:id`)
- One question at a time, clean card layout, progress bar and question navigator
- Question types: single answer, multiple answers ("select all that apply"), true/false, and numeric (with a ± tolerance; `2,5` and `2.5` both work)
- Keyboard shortcuts: `1`–`9` pick an answer, `←`/`→` navigate, `F` flags a question
- Flag questions for review; a review screen lists unanswered and flagged questions before submitting
- Attempts are started on the server, which fixes the question order, choice order and deadline — reloading or clearing browser storage can't reset the clock. Answers are kept in the browser between reloads
- Optional time limit with auto-submit (retried automatically if the connection drops); late submissions are flagged
- Optional question/choice shuffling, and question pools (each attempt draws N random questions)
- Optional availability window (opens/closes), attempt limit per student, required name and student ID
- Instant grade: score ring, points, correct/incorrect counts, time taken, and a per-question review. Correct answers and explanations are revealed right away, after the quiz closes, or never
- Grading happens on the server; correct answers are never sent to the browser before submission
- Each result is frozen when it's submitted, so editing a quiz later doesn't change past results (unless you choose to re-grade)

**Managing quizzes** (`/admin`, password-protected)
- Dashboard with question count, points, attempts and average score per quiz
- Editor: title, Markdown description, time limit, schedule, attempt limit, question pool, answer reveal, scoring options; questions with Markdown + LaTeX text, points (grade), choices, correct answer(s), optional explanation; drag-and-drop reorder, duplicate, delete; live preview and a formatting toolbar; unsaved changes are backed up in the browser
- Scoring: all-or-nothing or partial credit for multiple-answer questions, and optional negative marking (a total never goes below 0)
- Import JSON (upload, drag & drop or paste) with clear validation errors
- Export a single quiz or all quizzes as JSON (re-importable)
- Publish/unpublish, preview drafts, duplicate, copy share link
- Attempts list per quiz (name, student ID, score, date, late) with links to each result, CSV export, and "re-grade past attempts" after fixing an answer key
- Analytics per question: % correct, average points, how often each choice was picked (highlighting the most popular wrong answer), and the spread of numeric answers
- Share page with a QR code and a short link (`/q/abc123`), plus a full-screen mode for lecture slides

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
| `npm run lint` / `typecheck` / `test` | ESLint / TypeScript / Vitest unit tests |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database with Drizzle Studio |
| `npm run db:seed` | Import `examples/sample-quiz.json` |

## Deploying to Vercel + Neon

1. **Import the repo in Vercel** (Add New → Project → pick `koalacodee/quizzer`). Framework preset: Next.js. Leave the build settings alone — `vercel.json` runs [`scripts/vercel-build.mjs`](scripts/vercel-build.mjs), which applies migrations to the production database before each production build.
2. **Add Neon** from the project's **Storage** tab (Create Database → Neon) and connect it to all environments. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) for you.
   *Using an existing Neon project instead?* Add `DATABASE_URL` = the **pooled** connection string and `DATABASE_URL_UNPOOLED` = the direct one, under Settings → Environment Variables.
3. **Add the remaining environment variables:**
   - `ADMIN_PASSWORD` — the admin password
   - `SESSION_SECRET` — a long random string, e.g. from `openssl rand -base64 32` (required in production)
4. **Deploy** (or redeploy if the first build ran before the database was connected).
5. *Optional* — load the sample quiz into the production database from your machine:
   ```bash
   DATABASE_URL="<neon direct connection string>" npm run db:seed
   ```

Schema changes later: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, and push — the next production deploy applies it.

**Preview deployments don't run migrations** by default, so a branch can never change the production schema. If you enable Neon's preview branching (each preview gets its own database branch), set `MIGRATE_PREVIEW=1` for the Preview environment so previews migrate their own branch.

## JSON format

```jsonc
{
  "title": "Lecture 4 — Probability",
  "description": "Markdown **supported**",
  "timeLimitMinutes": 15,        // null = untimed
  "shuffleQuestions": false,
  "shuffleChoices": false,
  "answerReveal": "immediately", // or "after_close" (needs closesAt) or "never"
  "published": true,
  "opensAt": null,               // ISO date-time, e.g. "2026-03-01T09:00:00Z"
  "closesAt": null,
  "maxAttempts": null,           // per student; null = unlimited
  "requireName": false,
  "collectStudentId": false,     // attempt limits then count per student ID
  "questionPoolSize": null,      // draw N random questions per attempt
  "scoring": "all_or_nothing",   // or "partial" for multiple-answer questions
  "negativeMarking": 0,          // fraction of points lost per wrong answer, 0–1
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
    { "question": "Is $\\pi$ irrational?", "grade": 1, "choices": ["Yes", "No"], "answer": 0 },
    // Numeric: `answer` is the value, `tolerance` the accepted ± difference
    { "type": "numeric", "text": "$\\int_0^1 2x\\,dx = ?$", "answer": 1, "tolerance": 0.001 },
    // True/false: `answer` is true or false
    { "type": "true_false", "text": "Every continuous function is differentiable.", "answer": false }
  ]
}
```

Import accepts a single quiz, an array of quizzes, or an export file (`{ "version": 2, "quizzes": [...] }`). Version 1 files (with `showAnswers`) still import.
Remember that backslashes must be escaped in JSON (`\\frac`, `\\int`).

## Notes

- By default grading is all-or-nothing per question: a multiple-answer question earns its points only when the exact set of correct choices is selected. Partial credit scores `(right − wrong) / correct` of the points.
- Admin auth is a single shared password (`ADMIN_PASSWORD`) with an HMAC-signed, HTTP-only session cookie; `/admin` and `/api/admin` are guarded in `src/proxy.ts` and again inside every server action / route. Changing `ADMIN_PASSWORD` signs out every session.
- Login (10 tries per 15 minutes) and starting attempts (30 per hour) are rate-limited per IP, using a small `rate_limits` table in Postgres.
- Attempt limits are counted per browser (an HTTP-only cookie) or, when student IDs are collected, per ID. They stop casual retakes, not a determined student.
- Editing a quiz keeps question and choice ids stable, so past attempts still show up correctly in results.
