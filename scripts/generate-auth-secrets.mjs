import { pbkdf2Sync, randomBytes } from "node:crypto";

const iterations = 310_000;
const username = process.env.AUTH_USERNAME?.trim() || "analytics";
const password = process.env.AUTH_PASSWORD || randomBytes(18).toString("base64url");
const salt = randomBytes(16);
const passwordHash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const encodedHash = [
  "pbkdf2_sha256",
  iterations,
  salt.toString("base64url"),
  passwordHash.toString("base64url"),
].join("$");

console.log(`DASHBOARD_AUTH_ENABLED=true`);
console.log(`DASHBOARD_AUTH_USERNAME=${username}`);
console.log(`DASHBOARD_AUTH_PASSWORD=${password}`);
console.log(`DASHBOARD_AUTH_PASSWORD_HASH=${encodedHash}`);
console.log(`DASHBOARD_AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
console.log("\nDASHBOARD_AUTH_PASSWORD is shown for handoff only; do not store it as an environment variable.");
