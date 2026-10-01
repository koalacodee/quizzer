import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function isAdmin() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every admin server action / route handler. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
