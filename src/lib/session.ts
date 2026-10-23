// Edge/Node-agnostic signed session token (used by proxy.ts and server code).

export const SESSION_COOKIE = "quizzer_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  // Development convenience only.
  const fallback = process.env.ADMIN_PASSWORD;
  if (!fallback) throw new Error("SESSION_SECRET (or ADMIN_PASSWORD in development) must be set");
  return fallback;
}

async function hmac(data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Signing the current password means changing ADMIN_PASSWORD logs every session out.
const payload = (exp: number) => `admin:${exp}:${process.env.ADMIN_PASSWORD ?? ""}`;

export async function createSessionToken() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return `${exp}.${await hmac(payload(exp))}`;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(payload(exp)));
}

/** Compares HMACs rather than raw strings so timing doesn't leak the password length. */
export async function passwordMatches(input: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmac(`pw:${input}`), hmac(`pw:${expected}`)]);
  return safeEqual(a, b);
}
