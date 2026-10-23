-- Give every quiz a 10-digit share code (first digit 1-9), replacing the earlier short codes.
DO $$
DECLARE
	r record;
	code text;
BEGIN
	FOR r IN SELECT "id" FROM "quizzes" LOOP
		LOOP
			code := (1000000000 + floor(random() * 9000000000))::bigint::text;
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "quizzes" WHERE "short_code" = code);
		END LOOP;
		UPDATE "quizzes" SET "short_code" = code WHERE "id" = r."id";
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_short_code_format" CHECK ("quizzes"."short_code" ~ '^[1-9][0-9]{9}$');