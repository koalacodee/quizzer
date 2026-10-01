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

export const questionType = pgEnum("question_type", ["single", "multiple"]);

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Optional time limit in minutes; null = untimed. */
  timeLimitMinutes: integer("time_limit_minutes"),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
  shuffleChoices: boolean("shuffle_choices").notNull().default(false),
  /** Reveal correct answers and explanations on the results page. */
  showAnswers: boolean("show_answers").notNull().default(true),
  published: boolean("published").notNull().default(false),
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

/** questionId -> selected choice ids */
export type AttemptAnswers = Record<string, string[]>;

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    participantName: text("participant_name").notNull().default(""),
    answers: jsonb("answers").$type<AttemptAnswers>().notNull(),
    score: doublePrecision("score").notNull(),
    maxScore: doublePrecision("max_score").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempts_quiz_idx").on(t.quizId)],
);

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
