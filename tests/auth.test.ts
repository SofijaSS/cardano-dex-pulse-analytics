import { describe, expect, it } from "vitest";
import {
  createPasswordHash,
  createPasswordVerifier,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth-core";
import { DASHBOARD_SESSION_SECONDS, decodePasswordHash } from "@/lib/auth";

describe("dashboard authentication", () => {
  it("limits authenticated sessions to four hours", () => {
    expect(DASHBOARD_SESSION_SECONDS).toBe(4 * 60 * 60);
  });

  it("verifies PBKDF2 password hashes without accepting a different password", async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const hash = await createPasswordHash("correct horse battery staple", salt, 100_000);

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", hash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("password", "not-a-supported-hash")).resolves.toBe(false);
  });

  it("verifies hosting-compatible password verifiers with the server secret", async () => {
    const secret = "password-verifier-secret-that-is-long-enough";
    const verifier = await createPasswordVerifier("high-entropy-password", secret);

    await expect(
      verifyPassword("high-entropy-password", verifier, secret),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("wrong-password", verifier, secret),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("high-entropy-password", verifier, `${secret}-wrong`),
    ).resolves.toBe(false);
  });

  it("decodes the hosting-safe password hash transport format", async () => {
    const hash = await createPasswordHash(
      "transport-safe password",
      Uint8Array.from({ length: 16 }, (_, index) => 16 - index),
      100_000,
    );
    const transported = `base64url:${Buffer.from(hash).toString("base64url")}`;

    expect(decodePasswordHash(transported)).toBe(hash);
    expect(decodePasswordHash(hash)).toBe(hash);
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
