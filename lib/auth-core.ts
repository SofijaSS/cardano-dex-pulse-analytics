const encoder = new TextEncoder();
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_VERIFIER_PREFIX = "hmac_sha256:";
const DEFAULT_PASSWORD_ITERATIONS = 310_000;
const MIN_PASSWORD_ITERATIONS = 100_000;
const MAX_PASSWORD_ITERATIONS = 1_000_000;

type SessionPayload = {
  exp: number;
  username: string;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function secureBytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

async function derivePasswordBytes(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

export async function createPasswordHash(
  password: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
  iterations = DEFAULT_PASSWORD_ITERATIONS,
) {
  if (!password) throw new Error("Password cannot be empty.");
  if (iterations < MIN_PASSWORD_ITERATIONS || iterations > MAX_PASSWORD_ITERATIONS) {
    throw new Error("Password iteration count is outside the supported range.");
  }
  const hash = await derivePasswordBytes(password, salt, iterations);
  return [
    PASSWORD_HASH_PREFIX,
    String(iterations),
    bytesToBase64Url(salt),
    bytesToBase64Url(hash),
  ].join("$");
}

export async function createPasswordVerifier(password: string, secret: string) {
  if (!password) throw new Error("Password cannot be empty.");
  if (secret.length < 32) throw new Error("Password verifier secret is too short.");
  return `${PASSWORD_VERIFIER_PREFIX}${bytesToBase64Url(await sign(password, secret))}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
  secret?: string,
) {
  if (encodedHash.startsWith(PASSWORD_VERIFIER_PREFIX)) {
    if (!secret || secret.length < 32) return false;
    try {
      const expected = base64UrlToBytes(
        encodedHash.slice(PASSWORD_VERIFIER_PREFIX.length),
      );
      return secureBytesEqual(await sign(password, secret), expected);
    } catch {
      return false;
    }
  }

  const [prefix, iterationsValue, saltValue, expectedValue, ...extra] =
    encodedHash.split("$");
  const iterations = Number.parseInt(iterationsValue || "", 10);
  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    extra.length ||
    !saltValue ||
    !expectedValue ||
    !Number.isInteger(iterations) ||
    iterations < MIN_PASSWORD_ITERATIONS ||
    iterations > MAX_PASSWORD_ITERATIONS
  ) {
    return false;
  }

  try {
    const actual = await derivePasswordBytes(
      password,
      base64UrlToBytes(saltValue),
      iterations,
    );
    return secureBytesEqual(actual, base64UrlToBytes(expectedValue));
  } catch {
    return false;
  }
}

export async function secureTextEqual(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return secureBytesEqual(
    new Uint8Array(leftDigest),
    new Uint8Array(rightDigest),
  );
}

export async function createSessionToken(
  username: string,
  secret: string,
  expiresAt: number,
) {
  const payload: SessionPayload = { username, exp: expiresAt };
  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );
  const signature = bytesToBase64Url(await sign(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  expectedUsername: string,
  secret: string,
  now = Date.now(),
) {
  const [encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra.length) return false;

  try {
    const expectedSignature = await sign(encodedPayload, secret);
    if (!secureBytesEqual(expectedSignature, base64UrlToBytes(encodedSignature))) {
      return false;
    }
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as Partial<SessionPayload>;
    return (
      payload.username === expectedUsername &&
      typeof payload.exp === "number" &&
      Number.isFinite(payload.exp) &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}
