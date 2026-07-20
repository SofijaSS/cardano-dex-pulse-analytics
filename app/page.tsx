import { Dashboard } from "@/components/Dashboard";
import { redirect } from "next/navigation";
import {
  hasValidDashboardSession,
  isDashboardAuthEnabled,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authEnabled = isDashboardAuthEnabled();
  if (authEnabled && !(await hasValidDashboardSession())) redirect("/login");
  return <Dashboard authEnabled={authEnabled} />;
}
