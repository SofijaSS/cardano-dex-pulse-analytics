"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(form.get("username") || ""),
          password: String(form.get("password") || ""),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || "Sign-in failed. Please try again.");
        return;
      }
      window.location.replace("/");
    } catch {
      setError("The sign-in service is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-card__intro">
        <span className="eyebrow">Private analytics workspace</span>
        <h1>Sign in to Cardano DEX Pulse</h1>
        <p>Use the dashboard credentials provided by your analytics administrator.</p>
      </div>

      {!configured ? (
        <div className="login-error" role="alert">
          Authentication is enabled but its server credentials are incomplete.
        </div>
      ) : null}

      <label className="login-field">
        <span>Username</span>
        <div>
          <UserRound size={17} aria-hidden="true" />
          <input
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            required
            disabled={!configured || submitting}
          />
        </div>
      </label>

      <label className="login-field">
        <span>Password</span>
        <div>
          <KeyRound size={17} aria-hidden="true" />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!configured || submitting}
          />
        </div>
      </label>

      <div className="login-message" aria-live="polite">
        {error ? <span className="login-error">{error}</span> : null}
      </div>

      <button
        className="button button--primary login-submit"
        type="submit"
        disabled={!configured || submitting}
      >
        {submitting ? "Signing in…" : "Open dashboard"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>

      <small className="login-card__note">
        Your session expires automatically after 12 hours.
      </small>
    </form>
  );
}
