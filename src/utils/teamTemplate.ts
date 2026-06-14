import type { TeamTemplate } from "../types/pisciAsset";
import { brand } from "../brand";
import { getTeamMembers } from "./teamStorage";

/** Build a pool org_spec markdown draft from a team template. */
export function orgSpecFromTeamTemplate(t: TeamTemplate): string {
  if (t.org_spec?.trim()) return t.org_spec.trim();
  const members = getTeamMembers(t);
  const roles = members.map((m) => `- **${m.role}** (${m.name}): ${m.description || m.role}`).join("\n");
  return `# ${t.name}\n\n${t.description}\n\n## Roles\n${roles}\n\n## Collaboration\n- Each role owns their lane; hand off via pool chat when blocked.\n- Supervisor (${brand.displayNameZh}) coordinates merges and integration.\n`;
}

export type { TeamTemplate } from "../types/pisciAsset";
