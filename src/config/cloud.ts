import { invoke } from "@tauri-apps/api/core";

/**
 * Return the official Cloud endpoint decrypted by the Rust desktop layer.
 *
 * The frontend intentionally has no persisted or user-editable fallback: both
 * development overrides and the production endpoint are controlled by the
 * `get_cloud_base_url` Tauri command.
 */
export async function getCloudBaseUrl(): Promise<string> {
  const baseUrl = await invoke<string>("get_cloud_base_url");
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Normalize a navigation URL: add https:// when scheme is missing. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
