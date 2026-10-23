import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, passwordMatches, verifySessionToken } from "./session";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("ADMIN_PASSWORD", "hunter2");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("session tokens", () => {
  it("round-trips", async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it("rejects missing, tampered and expired tokens", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken(`${token}x`)).toBe(false);
    expect(await verifySessionToken(`1.${token.split(".")[1]}`)).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("is invalidated by a password change", async () => {
    const token = await createSessionToken();
    vi.stubEnv("ADMIN_PASSWORD", "new-password");
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("requires SESSION_SECRET in production", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(createSessionToken()).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("passwordMatches", () => {
  it("checks the admin password", async () => {
    expect(await passwordMatches("hunter2")).toBe(true);
    expect(await passwordMatches("hunter")).toBe(false);
    expect(await passwordMatches("")).toBe(false);
  });
});
