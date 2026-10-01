// Seeds the database with the sample quiz: `npm run db:seed`
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { parseQuizImport } from "../src/lib/quiz-format";
import { databaseUrl } from "../src/db/url";

const client = postgres(databaseUrl(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL), { max: 1 });
const db = drizzle(client, { schema });

async function main() {
  const res = parseQuizImport(readFileSync(join(__dirname, "../examples/sample-quiz.json"), "utf8"));
  if (!res.ok) throw new Error(res.errors.join("\n"));

  for (const quiz of res.quizzes) {
    await db.transaction(async (tx) => {
      const { questions, ...meta } = quiz;
      const [{ id: quizId }] = await tx.insert(schema.quizzes).values(meta).returning({ id: schema.quizzes.id });
      for (const [position, q] of questions.entries()) {
        const [{ id: questionId }] = await tx
          .insert(schema.questions)
          .values({ quizId, position, type: q.type, text: q.text, points: q.points, explanation: q.explanation })
          .returning({ id: schema.questions.id });
        await tx.insert(schema.choices).values(
          q.choices.map((c, i) => ({ questionId, position: i, text: c.text, isCorrect: c.correct })),
        );
      }
      console.log(`Seeded "${quiz.title}" → /quiz/${quizId}`);
    });
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
