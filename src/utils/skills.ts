import type { Skill } from "../services/tauri";

/**
 * IDs of skills shipped by `SkillLoader::create_builtin_skills` (see
 * piscis-desktop `skills/loader.rs`). These are always available via progressive
 * `skill_list` / trigger matching — exclude from composer explicit-skill picker.
 */
const BUILTIN_SKILL_IDS = new Set([
  // DB ids (from upsert_skill safe_id of builtin display names)
  "office_automation",
  "file_management",
  "web_automation",
  "system_administration",
  "desktop_control",
  // Filesystem directory slugs (alias guard)
  "office-automation",
  "file-management",
  "web-automation",
  "system-admin",
  "desktop-control",
]);

const PRIMARY_OFFICE_SKILL_IDS = new Set([
  "meeting-notes-assistant",
  "word___docx",
  "data-analysis-skill",
  "ppt-master",
  "pdf-convert-compdf",
  "file-classifier",
  "invoice-organizer",
]);

export function skillDisplayName(name: string): string {
  return name.replace(/善春AI[·\s|：:，,\-—]*/gi, "").trim();
}

export function isBuiltinSkill(skill: Pick<Skill, "id">): boolean {
  const id = skill.id.trim().toLowerCase();
  return BUILTIN_SKILL_IDS.has(id);
}

export function isPrimaryOfficeSkill(skill: Pick<Skill, "id">): boolean {
  const id = skill.id.trim().toLowerCase();
  return PRIMARY_OFFICE_SKILL_IDS.has(id);
}

/** User-installed / registry skills eligible for explicit composer selection. */
export function composerSelectableSkills(skills: Skill[]): Skill[] {
  return skills.filter((s) => s.enabled && !isBuiltinSkill(s));
}

/** Compact composer list: keep only the office basics on the visible button. */
export function composerPrimaryOfficeSkills(skills: Skill[]): Skill[] {
  return composerSelectableSkills(skills).filter(isPrimaryOfficeSkill);
}
