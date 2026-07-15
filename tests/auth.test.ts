import { describe, expect, it } from "vitest";
import {
  createPasswordHash,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth-core";

describe("dashboard authentication", () => {
  it("verifies PBKDF2 password hashes without accepting a different password", async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const hash = await createPasswordHash("correct horse battery staple", salt, 100_000);

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", hash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("password", "not-a-supported-hash")).resolves.toBe(false);
  });

  it("accepts signed sessions only for the configured user before expiry", async () => {
    const now = 1_750_000_000_000;
    const secret = "a-secure-session-secret-that-is-long-enough";
    const token = await createSessionToken("analytics", secret, now + 60_000);

    await expect(verifySessionToken(token, "analytics", secret, now)).resolves.toBe(true);
    await expect(verifySessionToken(token, "another-user", secret, now)).resolves.toBe(false);
    await expect(verifySessionToken(token, "analytics", secret, now + 60_001)).resolves.toBe(false);
  });

  it("rejects tampered session payloads and signatures", async () => {
    const secret = "another-secure-session-secret-that-is-long-enough";
    const token = await createSessionToken("analytics", secret, Date.now() + 60_000);
    const [payload, signature] = token.split(".");

    await expect(
      verifySessionToken(`${payload}x.${signature}`, "analytics", secret),
    ).resolves.toBe(false);
    await expect(
      verifySessionToken(`${payload}.${signature}x`, "analytics", secret),
    ).resolves.toBe(false);
  });
});
