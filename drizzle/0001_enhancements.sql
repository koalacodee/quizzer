CREATE TYPE "public"."answer_reveal" AS ENUM('immediately', 'after_close', 'never');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."scoring_mode" AS ENUM('all_or_nothing', 'partial');--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'true_false';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'numeric';--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "answers" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "max_score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
-- Backfill: attempts made before start times were tracked.
UPDATE "attempts" SET "started_at" = "submitted_at" WHERE "started_at" IS NULL;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "started_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "submitted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "status" "attempt_status" DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
-- Backfill: every existing attempt was submitted.
UPDATE "attempts" SET "status" = 'submitted';--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "participant_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "client_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "results" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_answer" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_tolerance" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "short_code" text;--> statement-breakpoint
-- Backfill: share codes for existing quizzes (new ones get 6-character codes from the app).
UPDATE "quizzes" SET "short_code" = substr(md5(random()::text || "id"::text), 1, 8);--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "short_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "answer_reveal" "answer_reveal" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
-- Backfill from the old boolean, dropped in the next migration.
UPDATE "quizzes" SET "answer_reveal" = 'never' WHERE "show_answers" = false;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "require_name" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "collect_student_id" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "question_pool_size" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "scoring" "scoring_mode" DEFAULT 'all_or_nothing' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "negative_marking" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "attempts_quiz_status_idx" ON "attempts" USING btree ("quiz_id","status");--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_short_code_unique" UNIQUE("short_code");