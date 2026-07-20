import { BarChart3, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { PreserveTerms } from "@/components/PreserveTerms";
import {
  hasValidDashboardSession,
  isDashboardAuthConfigured,
  isDashboardAuthEnabled,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isDashboardAuthEnabled()) redirect("/");
  if (await hasValidDashboardSession()) redirect("/");

  return (
    <main className="login-shell">
      <section className="login-brand-panel" aria-label="Cardano DEX Pulse">
        <div className="login-brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Cardano DEX</strong><small>Pulse / Analytics</small></span>
        </div>
        <div className="login-brand-copy">
          <span><ShieldCheck size={16} aria-hidden="true" /> Verified-data workspace</span>
          <h2><PreserveTerms>Cardano DEX insights, all in one place.</PreserveTerms></h2>
          <p>Source-reconciled DEX volume, TVL, weekly comparisons and reporting tools in one protected workspace.</p>
        </div>
        <div className="login-signal" aria-hidden="true">
          <BarChart3 size={26} />
          <i /><i /><i /><i /><i />
        </div>
      </section>
      <section className="login-form-panel">
        <LoginForm configured={isDashboardAuthConfigured()} />
      </section>
    </main>
  );
}
