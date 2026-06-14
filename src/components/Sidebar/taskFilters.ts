export type TaskDateFilter = "all" | "today" | "last7" | "last30";

export function taskMatchesDateFilter(updatedAt: number, filter: TaskDateFilter): boolean {
  if (filter === "all" || !updatedAt) return true;
  const now = Date.now();
  const diff = now - updatedAt;
  const day = 86400000;
  if (filter === "today") return diff < day;
  if (filter === "last7") return diff < 7 * day;
  if (filter === "last30") return diff < 30 * day;
  return true;
}
