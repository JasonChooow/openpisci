/**
 * Shared cloud platform configuration (desktop side).
 *
 * The cloud base URL is used by the in-app browser page, cloud-account login,
 * the cloud LLM gateway, and the official marketplace source. It is persisted
 * in localStorage so the frontend can read it synchronously; the Rust side
 * keeps its own encrypted copy once the user signs in.
 */

const CLOUD_BASE_URL_KEY = "pisci-cloud-base-url";

/** Default cloud homepage; user-editable in the browser page / settings. */
export const DEFAULT_CLOUD_BASE_URL = "https://www.dimnuo.com";

export function getCloudBaseUrl(): string {
  try {
    const v = localStorage.getItem(CLOUD_BASE_URL_KEY);
    if (v && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_CLOUD_BASE_URL;
}

export function setCloudBaseUrl(url: string): void {
  try {
    localStorage.setItem(CLOUD_BASE_URL_KEY, url.trim());
  } catch {
    /* ignore */
  }
}

/** Normalize a user-entered URL: add https:// when scheme is missing. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
