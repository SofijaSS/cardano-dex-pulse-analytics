import { cookies } from "next/headers";
import {
  createSessionToken,
  secureTextEqual,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth-core";

export const DASHBOARD_SESSION_COOKIE = "cardano-dex-pulse-session";
export const DASHBOARD_SESSION_SECONDS = 12 * 60 * 60;

type AuthConfiguration = {
  passwordHash: string;
  secret: string;
  username: string;
};

export function isDashboardAuthEnabled() {
  return process.env.DASHBOARD_AUTH_ENABLED === "true";
}

export function getDashboardAuthConfiguration(): AuthConfiguration | null {
  const username = process.env.DASHBOARD_AUTH_USERNAME?.trim();
  const passwordHash = process.env.DASHBOARD_AUTH_PASSWORD_HASH?.trim();
  const secret = process.env.DASHBOARD_AUTH_SECRET?.trim();
  if (!username || !passwordHash || !secret || secret.length < 32) return null;
  return { username, passwordHash, secret };
}

export function isDashboardAuthConfigured() {
  return getDashboardAuthConfiguration() != null;
}

export async function verifyDashboardCredentials(
  username: string,
  password: string,
) {
  const configuration = getDashboardAuthConfiguration();
  if (!isDashboardAuthEnabled() || !configuration) return false;
  const [usernameMatches, passwordMatches] = await Promise.all([
    secureTextEqual(username, configuration.username),
    verifyPassword(password, configuration.passwordHash),
  ]);
  return usernameMatches && passwordMatches;
}

export async function buildDashboardSessionToken() {
  const configuration = getDashboardAuthConfiguration();
  if (!configuration) throw new Error("Dashboard authentication is not configured.");
  const expiresAt = Date.now() + DASHBOARD_SESSION_SECONDS * 1000;
  return createSessionToken(
    configuration.username,
    configuration.secret,
    expiresAt,
  );
}

export async function hasValidDashboardSession() {
  if (!isDashboardAuthEnabled()) return true;
  const configuration = getDashboardAuthConfiguration();
  if (!configuration) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(
    token,
    configuration.username,
    configuration.secret,
  );
}
