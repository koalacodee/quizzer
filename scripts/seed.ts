// Seeds the database with the sample quiz: `npm run db:seed`
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { databaseUrl } from "../src/db/url";
import { parseQuizImport } from "../src/lib/quiz-format";
import { createQuiz } from "../src/lib/quiz-store";

const client = postgres(databaseUrl(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL), { max: 1 });
const db = drizzle(client, { schema });

async function main() {
  const res = parseQuizImport(readFileSync(join(__dirname, "../examples/sample-quiz.json"), "utf8"));
  if (!res.ok) throw new Error(res.errors.join("\n"));

  for (const quiz of res.quizzes) {
    const quizId = await createQuiz(db, quiz);
    const [{ shortCode }] = await db
      .select({ shortCode: schema.quizzes.shortCode })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.id, quizId));
    console.log(`Seeded "${quiz.title}" → /q/${shortCode}`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
