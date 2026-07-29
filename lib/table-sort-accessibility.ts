export type TableSortDirection = "asc" | "desc";
export type AriaSortDirection = "ascending" | "descending";

export function tableAriaSort(
  active: boolean,
  direction: TableSortDirection,
): AriaSortDirection | undefined {
  if (!active) return undefined;
  return direction === "asc" ? "ascending" : "descending";
}

export function sortButtonAriaLabel(
  label: string,
  active: boolean,
  direction: TableSortDirection,
) {
  if (!active) return `Sort by ${label} in ascending order`;

  const current = direction === "asc" ? "ascending" : "descending";
  const next = direction === "asc" ? "descending" : "ascending";
  return `${label}, sorted ${current}. Sort ${next}`;
}
