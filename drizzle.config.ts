import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/db/url";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations should use a direct (non-pooled) connection when one is available.
  dbCredentials: { url: databaseUrl(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL) },
});
