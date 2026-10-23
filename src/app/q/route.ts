import { normalizeShareCode } from "@/lib/quiz-store";

/** "Join by code" form on the home page: /q?code=482 910 3756 → /q/4829103756 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = normalizeShareCode(url.searchParams.get("code") ?? "");
  return Response.redirect(new URL(code ? `/q/${code}` : "/?code=invalid", url), 303);
}
