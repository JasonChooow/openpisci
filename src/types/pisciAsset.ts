/** Pisci marketplace asset kinds. */
export type PisciAssetKind = "expert" | "team" | "skill";

/**
 * Global asset id: `{publisher}/{kind}/{slug}@{semver}`
 * Example: `openpisci/expert/research-analyst@1.0.0`
 */
export type PisciAssetId = string;

export const ASSET_ID_PATTERN =
  /^[a-z0-9-]+\/(expert|team|skill)\/[a-z0-9-]+@\d+\.\d+\.\d+$/;

export interface ParsedAssetId {
  publisher: string;
  kind: PisciAssetKind;
  slug: string;
  version: string;
}

export function parseAssetId(id: string): ParsedAssetId | null {
  const m = id.match(/^([a-z0-9-]+)\/(expert|team|skill)\/([a-z0-9-]+)@(\d+\.\d+\.\d+)$/);
  if (!m) return null;
  return {
    publisher: m[1],
    kind: m[2] as PisciAssetKind,
    slug: m[3],
    version: m[4],
  };
}

export function formatAssetId(
  publisher: string,
  kind: PisciAssetKind,
  slug: string,
  version: string,
): PisciAssetId {
  return `${publisher}/${kind}/${slug}@${version}`;
}

/** Semver tuple compare: 1 if a>b, -1 if a<b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function semverLt(a: string, b: string): boolean {
  return compareSemver(a, b) < 0;
}

/**
 * Embedded expert snapshot inside a team template (copy model).
 * Self-contained so teams work after market install without pre-installed experts.
 */
export interface TeamExpertSnapshot {
  member_id: string;
  role: string;
  name: string;
  description: string;
  system_prompt: string;
  icon: string;
  color: string;
  /** Global id of the source expert pack, if known */
  source_id?: string;
  /** Version copied from source; used for manual upgrade checks */
  source_version?: string;
}

export type TeamTemplateOrigin = "builtin" | "market" | "user";

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  /** Legacy role labels; kept in sync with members */
  roles: string[];
  spec_version?: number;
  org_spec?: string;
  members?: TeamExpertSnapshot[];
  origin?: TeamTemplateOrigin;
  installed_at?: string;
}

export interface MarketExpertPackageV1 {
  spec_version?: number;
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  icon?: string;
  color?: string;
}

export interface MarketTeamPackageV2 {
  spec_version?: number;
  id: string;
  name: string;
  description: string;
  roles?: string[];
  org_spec?: string;
  members?: TeamExpertSnapshot[];
}
