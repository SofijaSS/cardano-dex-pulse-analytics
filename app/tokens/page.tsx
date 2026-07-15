import { redirect } from "next/navigation";
import { TokenAnalytics } from "@/components/TokenAnalytics";
import {
  hasValidDashboardSession,
  isDashboardAuthEnabled,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const authEnabled = isDashboardAuthEnabled();
  if (authEnabled && !(await hasValidDashboardSession())) redirect("/login");
  return <TokenAnalytics authEnabled={authEnabled} />;
}
