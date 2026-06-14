/** Normalize project paths for cross-platform equality checks. */
export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function sameProjectPath(a: string, b: string): boolean {
  return normalizeProjectPath(a) === normalizeProjectPath(b);
}

/** Sanitize a user-entered project folder name for filesystem use. */
export function sanitizeProjectName(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
}

/** Join workspace root with a project folder name (cross-platform). */
export function joinProjectPath(workspaceRoot: string, projectName: string): string {
  const base = workspaceRoot.replace(/[/\\]+$/, "");
  const segment = sanitizeProjectName(projectName);
  if (!base || !segment) return base || segment;
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base}${sep}${segment}`;
}
