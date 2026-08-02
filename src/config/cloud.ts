import { invoke } from "@tauri-apps/api/core";

/**
 * Return the platform edge address, resolved by the Rust desktop layer.
 *
 * The frontend intentionally has no persisted or user-editable fallback: both
 * development overrides and the production endpoint are controlled by the
 * `get_cloud_base_url` Tauri command.
 */
export async function getCloudBaseUrl(): Promise<string> {
  const baseUrl = await invoke<string>("get_cloud_base_url");
  return baseUrl.trim().replace(/\/+$/, "");
}

export interface PlatformService {
  name: string;
  url: string;
  min_client_version?: string | null;
  status: string;
}

export interface PlatformDiscovery {
  version?: number;
  issued_at?: number;
  expires_at?: number;
  environment?: string;
  services?: PlatformService[];
  features?: Record<string, unknown>;
  /** Present only when no document could be verified. */
  available?: false;
  edge_url?: string;
}

/**
 * The signed platform document: where each service is, which are down, and
 * which features are on.
 *
 * Read this before rendering anything that depends on a service being
 * reachable. A tab that knows DimStore is down can say so, rather than spinning
 * until a request times out.
 *
 * Signature verification happens in Rust against a key pinned at build time —
 * that pin, not the address, is what keeps a tampered document from pointing
 * the client somewhere else.
 */
export async function getPlatformDiscovery(): Promise<PlatformDiscovery> {
  return invoke<PlatformDiscovery>("get_platform_discovery");
}

/**
 * Whether a service is worth calling.
 *
 * An unmentioned service counts as usable: not being named is not the same as
 * being down, and disabling a feature over a missing name is worse than
 * attempting the call and handling the failure.
 */
export function isServiceUsable(
  discovery: PlatformDiscovery,
  name: string
): boolean {
  const service = discovery.services?.find((s) => s.name === name);
  return !service || service.status !== "down";
}

/** Normalize a navigation URL: add https:// when scheme is missing. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
