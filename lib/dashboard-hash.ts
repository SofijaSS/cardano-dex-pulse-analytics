const DASHBOARD_SECTION_IDS = new Set([
  "overview",
  "weekly-report",
  "dex-table",
  "charts",
]);

export function dashboardSectionIdFromHash(hash: string) {
  if (!hash.startsWith("#")) return null;

  try {
    const sectionId = decodeURIComponent(hash.slice(1));
    return DASHBOARD_SECTION_IDS.has(sectionId) ? sectionId : null;
  } catch {
    return null;
  }
}

export function scrollToDashboardHash(
  hash: string,
  root: Pick<Document, "getElementById"> = document,
) {
  const sectionId = dashboardSectionIdFromHash(hash);
  if (!sectionId) return false;

  const section = root.getElementById(sectionId);
  if (!section) return false;

  section.scrollIntoView({ behavior: "auto", block: "start" });
  return true;
}
