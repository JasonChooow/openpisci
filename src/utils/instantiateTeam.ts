import { koiApi } from "../services/tauri";
import type { TeamTemplate } from "../types/pisciAsset";
import { getTeamMembers } from "./teamStorage";

/** Instantiate embedded expert snapshots as runtime Koi pool members. */
export async function instantiateTeamMembers(tpl: TeamTemplate): Promise<string[]> {
  const members = getTeamMembers(tpl);
  const ids: string[] = [];
  for (const m of members) {
    const koi = await koiApi.create({
      name: m.name,
      role: m.role,
      icon: m.icon,
      color: m.color,
      system_prompt: m.system_prompt,
      description: m.description,
    });
    ids.push(koi.id);
  }
  return ids;
}
