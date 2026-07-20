import { createHmac, randomBytes } from "node:crypto";

const username = process.env.AUTH_USERNAME?.trim() || "analytics";
const password = process.env.AUTH_PASSWORD || randomBytes(18).toString("base64url");
const secret = randomBytes(32).toString("base64url");
const passwordVerifier = createHmac("sha256", secret)
  .update(password)
  .digest("base64url");

console.log(`DASHBOARD_AUTH_ENABLED=true`);
console.log(`DASHBOARD_AUTH_USERNAME=${username}`);
console.log(`DASHBOARD_AUTH_PASSWORD=${password}`);
console.log(`DASHBOARD_AUTH_PASSWORD_HASH=hmac_sha256:${passwordVerifier}`);
console.log(`DASHBOARD_AUTH_SECRET=${secret}`);
console.log("\nDASHBOARD_AUTH_PASSWORD is shown for handoff only; do not store it as an environment variable.");
