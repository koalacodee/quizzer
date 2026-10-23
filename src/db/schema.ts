import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const questionType = pgEnum("question_type", ["single", "multiple", "true_false", "numeric"]);
export const answerReveal = pgEnum("answer_reveal", ["immediately", "after_close", "never"]);
export const scoringMode = pgEnum("scoring_mode", ["all_or_nothing", "partial"]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "submitted"]);

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Short code for `/q/:code` share links. */
  shortCode: text("short_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Optional time limit in minutes; null = untimed. */
  timeLimitMinutes: integer("time_limit_minutes"),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
  shuffleChoices: boolean("shuffle_choices").notNull().default(false),
  /** When correct answers and explanations appear on the results page. */
  answerReveal: answerReveal("answer_reveal").notNull().default("immediately"),
  published: boolean("published").notNull().default(false),
  /** Optional availability window. */
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  /** Attempts per participant; null = unlimited. */
  maxAttempts: integer("max_attempts"),
  requireName: boolean("require_name").notNull().default(false),
  collectStudentId: boolean("collect_student_id").notNull().default(false),
  /** Draw this many random questions per attempt; null = all. */
  questionPoolSize: integer("question_pool_size"),
  scoring: scoringMode("scoring").notNull().default("all_or_nothing"),
  /** Fraction of a question's points deducted for a wrong answer (0–1). */
  negativeMarking: doublePrecision("negative_marking").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: questionType("type").notNull().default("single"),
    /** Markdown + LaTeX ($inline$, $$block$$). */
    text: text("text").notNull(),
    points: doublePrecision("points").notNull().default(1),
    /** Optional Markdown shown after submission. */
    explanation: text("explanation").notNull().default(""),
    /** Numeric questions only. */
    numericAnswer: doublePrecision("numeric_answer"),
    numericTolerance: doublePrecision("numeric_tolerance").notNull().default(0),
  },
  (t) => [index("questions_quiz_idx").on(t.quizId)],
);

export const choices = pgTable(
  "choices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (t) => [index("choices_question_idx").on(t.questionId)],
);

/** questionId -> selected choice ids (numeric questions: a single number as a string) */
export type AttemptAnswers = Record<string, string[]>;

/** Question order and choice order chosen by the server when an attempt starts. */
export type AttemptLayout = { questionIds: string[]; choiceOrder: Record<string, string[]> };

/** Per-question grading frozen at submission time, so later edits don't rewrite history. */
export type SnapshotQuestion = {
  questionId: string;
  type: "single" | "multiple" | "true_false" | "numeric";
  text: string;
  points: number;
  explanation: string;
  numericAnswer: number | null;
  numericTolerance: number;
  choices: { id: string; text: string; isCorrect: boolean }[];
  selected: string[];
  earned: number;
  correct: boolean;
  answered: boolean;
};

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    status: attemptStatus("status").notNull().default("in_progress"),
    participantName: text("participant_name").notNull().default(""),
    participantId: text("participant_id").notNull().default(""),
    /** Random per-browser id (httpOnly cookie), used to count attempts. */
    clientToken: text("client_token").notNull().default(""),
    /** Taken by an admin while the quiz was unpublished; excluded from stats. */
    preview: boolean("preview").notNull().default(false),
    layout: jsonb("layout").$type<AttemptLayout>(),
    answers: jsonb("answers").$type<AttemptAnswers>().notNull().default({}),
    /** Null for attempts submitted before snapshots existed. */
    results: jsonb("results").$type<SnapshotQuestion[]>(),
    score: doublePrecision("score").notNull().default(0),
    maxScore: doublePrecision("max_score").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadline: timestamp("deadline", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    late: boolean("late").notNull().default(false),
  },
  (t) => [index("attempts_quiz_idx").on(t.quizId), index("attempts_quiz_status_idx").on(t.quizId, t.status)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  questions: many(questions),
  attempts: many(attempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
  choices: many(choices),
}));

export const choicesRelations = relations(choices, ({ one }) => ({
  question: one(questions, { fields: [choices.questionId], references: [questions.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  quiz: one(quizzes, { fields: [attempts.quizId], references: [quizzes.id] }),
}));
