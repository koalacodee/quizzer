// Vercel build: migrate the production database, and preview databases only when they
// are separate (MIGRATE_PREVIEW=1, e.g. Neon preview branches), then build.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
const migrate = env === "production" || (env === "preview" && process.env.MIGRATE_PREVIEW === "1");
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (migrate) run("npm run db:migrate");
else console.log(`Skipping migrations (VERCEL_ENV=${env ?? "unset"}, MIGRATE_PREVIEW=${process.env.MIGRATE_PREVIEW ?? "unset"})`);
run("npm run build");
