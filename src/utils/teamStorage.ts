import type { KoiWithStats } from "../services/tauri";
import type {
  MarketExpertPackageV1,
  MarketTeamPackageV2,
  TeamExpertSnapshot,
  TeamTemplate,
} from "../types/pisciAsset";
import { parseAssetId } from "../types/pisciAsset";

export const INSTALLED_TEAMS_KEY = "piscis-installed-teams";

function newMemberId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function snapshotFromKoi(koi: KoiWithStats, role?: string): TeamExpertSnapshot {
  return {
    member_id: newMemberId(),
    role: role ?? koi.role,
    name: koi.name,
    description: koi.description,
    system_prompt: koi.system_prompt,
    icon: koi.icon || "🎯",
    color: koi.color || "#7c5cff",
    source_id: undefined,
    source_version: undefined,
  };
}

export function snapshotFromExpertPack(pack: MarketExpertPackageV1, role: string): TeamExpertSnapshot {
  const parsed = parseAssetId(pack.id);
  return {
    member_id: newMemberId(),
    role,
    name: pack.name,
    description: pack.description,
    system_prompt: pack.system_prompt,
    icon: pack.icon ?? "🎯",
    color: pack.color ?? "#7c5cff",
    source_id: pack.id,
    source_version: parsed?.version,
  };
}

export function syncRolesFromMembers(members: TeamExpertSnapshot[]): string[] {
  return members.map((m) => m.role);
}

export function getTeamMembers(t: TeamTemplate): TeamExpertSnapshot[] {
  if (t.members?.length) return t.members;
  return (t.roles ?? []).map((role, i) => ({
    member_id: `legacy-${i}`,
    role,
    name: role,
    description: "",
    system_prompt: `You are the ${role} role in team "${t.name}".`,
    icon: "👤",
    color: "#7c5cff",
  }));
}

/** Upgrade v1 role-only templates to v2 with embedded member snapshots. */
export function normalizeTeamTemplate(t: TeamTemplate, origin: TeamTemplate["origin"] = t.origin): TeamTemplate {
  const members = getTeamMembers(t);
  return {
    ...t,
    spec_version: 2,
    origin: origin ?? t.origin ?? "user",
    members,
    roles: syncRolesFromMembers(members),
  };
}

export function loadInstalledTeams(): TeamTemplate[] {
  try {
    const raw = localStorage.getItem(INSTALLED_TEAMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeamTemplate[];
    return parsed.map((t) => normalizeTeamTemplate(t, t.origin ?? "market"));
  } catch {
    return [];
  }
}

export function saveInstalledTeams(teams: TeamTemplate[]) {
  localStorage.setItem(INSTALLED_TEAMS_KEY, JSON.stringify(teams));
}

export function teamFromMarketPackage(pkg: MarketTeamPackageV2): TeamTemplate {
  const members =
    pkg.members?.length
      ? pkg.members
      : (pkg.roles ?? []).map((role, i) => ({
          member_id: `m-${i}`,
          role,
          name: role,
          description: "",
          system_prompt: `You are the ${role} role in team "${pkg.name}".`,
          icon: "👤",
          color: "#7c5cff",
        }));

  return normalizeTeamTemplate(
    {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      roles: pkg.roles ?? syncRolesFromMembers(members),
      org_spec: pkg.org_spec,
      members,
      origin: "market",
      installed_at: new Date().toISOString(),
      spec_version: pkg.spec_version ?? 2,
    },
    "market",
  );
}

export function forkTeamTemplate(t: TeamTemplate, newId?: string): TeamTemplate {
  const members = getTeamMembers(t).map((m) => ({ ...m, member_id: newMemberId() }));
  return normalizeTeamTemplate(
    {
      ...t,
      id: newId ?? `user/team/${Date.now().toString(36)}@1.0.0`,
      name: `${t.name} (副本)`,
      members,
      roles: syncRolesFromMembers(members),
      origin: "user",
      installed_at: new Date().toISOString(),
    },
    "user",
  );
}

export function newEmptyUserTeam(): TeamTemplate {
  return normalizeTeamTemplate(
    {
      id: `user/team/custom-${Date.now().toString(36)}@1.0.0`,
      name: "",
      description: "",
      roles: [],
      members: [],
      origin: "user",
      installed_at: new Date().toISOString(),
    },
    "user",
  );
}
