/**
 * Tauri IPC — platform domain.
 *
 * Host / OS primitives: runtime & VM capability probing, window / overlay /
 * theme control, and UI-side resolution of permission + interactive-UI
 * prompts. Plus the cross-platform `openPath` helper.
 *
 * Mirrors Rust-side `src-tauri/src/commands/platform/*`.
 */
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// System / Runtimes
// ---------------------------------------------------------------------------

export interface RuntimeCheckItem {
  name: string;
  available: boolean;
  version: string | null;
  download_url: string;
  hint: string;
}

export interface SystemDependencyItem {
  key: string;
  name: string;
  feature: string;
  available: boolean;
  required: boolean;
  status: "ok" | "warning" | "missing";
  details: string | null;
  hint: string;
  remediation: string | null;
  action: SystemDependencyAction | null;
}

export interface SystemDependencyAction {
  kind: "install_command" | "open_url" | "open_settings";
  command: string | null;
  url: string | null;
}

export interface PrivilegeElevationCheckItem {
  key: string;
  name: string;
  available: boolean;
  required: boolean;
  status: "ok" | "warning" | "missing";
  details: string | null;
  hint: string;
  remediation: string | null;
  action: SystemDependencyAction | null;
}

export const systemApi = {
  getVmStatus: () =>
    invoke<{ backend: string; available: boolean; description: string }>("get_vm_status"),
  checkRuntimes: () => invoke<RuntimeCheckItem[]>("check_runtimes"),
  checkSystemDependencies: () =>
    invoke<SystemDependencyItem[]>("check_system_dependencies"),
  checkPrivilegeElevation: () =>
    invoke<PrivilegeElevationCheckItem[]>("check_privilege_elevation"),
  runSystemDependencyAction: (key: string) =>
    invoke<void>("run_system_dependency_action", { key }),
  setRuntimePath: (runtimeKey: string, exePath: string) =>
    invoke<RuntimeCheckItem[]>("set_runtime_path", { runtimeKey, exePath }),
};

// ---------------------------------------------------------------------------
// Window / Overlay / Theme
// ---------------------------------------------------------------------------

export const windowApi = {
  enterMinimalMode: () => invoke<void>("enter_minimal_mode"),
  exitMinimalMode: () => invoke<void>("exit_minimal_mode"),
  /** Open (or focus) the professional features window (light IDE + Git). */
  openProWindow: (opts?: { view?: string; projectDir?: string; sessionId?: string }) =>
    invoke<void>("open_pro_window", {
      view: opts?.view ?? "ide",
      projectDir: opts?.projectDir ?? null,
      sessionId: opts?.sessionId ?? null,
    }),
  quitApp: () => invoke<void>("quit_app"),
  setOverlayPosition: (x: number, y: number) =>
    invoke<void>("set_overlay_position", { x, y }),
  saveOverlayPosition: (x: number, y: number) =>
    invoke<void>("save_overlay_position", { x, y }),
  setThemeBorder: (theme: "violet" | "gold") =>
    invoke<void>("set_window_theme_border", { theme }),
};

// ---------------------------------------------------------------------------
// XiaoNuo extras: update check / cloud connectors / account / team templates
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  notes: string;
  release_url?: string | null;
}

export interface CloudConnector {
  id: string;
  name: string;
  provider: string;
  connected: boolean;
  available: boolean;
}

export interface AccountInfo {
  /** "local" when signed out, "cloud" when signed in. */
  kind: string;
  name: string;
  signed_in: boolean;
  email?: string | null;
  base_url?: string | null;
  balance?: number | null;
}

export const cloudAccountApi = {
  signIn: (baseUrl: string, username: string, password: string) =>
    invoke<AccountInfo>("cloud_sign_in", { baseUrl, username, password }),
  signOut: () => invoke<AccountInfo>("cloud_sign_out"),
  status: () => invoke<AccountInfo>("cloud_account_status"),
  /** Sync (or remove) the cloud LLM provider in Settings; returns model ids. */
  syncLlm: () => invoke<string[]>("sync_cloud_llm_config"),
};

export type {
  TeamTemplate,
  TeamExpertSnapshot,
  MarketTeamPackageV2 as MarketTeamPackage,
} from "../../types/pisciAsset";

import type { TeamTemplate } from "../../types/pisciAsset";

export interface WebDavConfig {
  url: string;
  username: string;
  connected: boolean;
}

export interface WebDavEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
}

export const cloudApi = {
  getWebDavConfig: () => invoke<WebDavConfig>("get_webdav_config"),
  saveWebDavConfig: (url: string, username: string, password?: string) =>
    invoke<WebDavConfig>("save_webdav_config", { url, username, password: password ?? null }),
  disconnectWebDav: () => invoke<void>("disconnect_webdav"),
  listWebDavFiles: (path?: string) =>
    invoke<WebDavEntry[]>("list_webdav_files", { path: path ?? null }),
};

export interface MarketExpert {
  id: string;
  name: string;
  description: string;
  download_url: string;
  /** Origin source id: "github" | "cloud" | "clawhub" | custom. */
  source?: string;
  /** Whether the source is an official/trusted registry. */
  trusted?: boolean;
  featured?: boolean;
}

export interface MarketTeam {
  id: string;
  name: string;
  description: string;
  download_url: string;
  source?: string;
  trusted?: boolean;
  featured?: boolean;
}

export interface MarketSkill {
  id: string;
  name: string;
  description: string;
  download_url: string;
  source?: string;
  trusted?: boolean;
  tags?: string[];
  featured?: boolean;
}

export interface MarketIndex {
  experts: MarketExpert[];
  teams: MarketTeam[];
  skills: MarketSkill[];
}

export const marketplaceApi = {
  fetchIndex: (url?: string) => invoke<MarketIndex>("fetch_marketplace_index", { url: url ?? null }),
  /** Aggregate official GitHub registry + cloud marketplace (multi-source). */
  fetchAggregated: (cloudBaseUrl?: string, githubUrl?: string) =>
    invoke<MarketIndex>("fetch_marketplace_aggregated", {
      cloudBaseUrl: cloudBaseUrl ?? null,
      githubUrl: githubUrl ?? null,
    }),
  fetchTeamPackage: (url: string) =>
    invoke<import("../../types/pisciAsset").MarketTeamPackageV2>("fetch_market_team_package", { url }),
  installExpert: (downloadUrl: string) => invoke<string>("install_market_expert", { downloadUrl }),
  installSkill: (downloadUrl: string) =>
    invoke<import("./config").SkillCatalogItem>("install_market_skill", { downloadUrl }),
};

export const extrasApi = {
  checkUpdate: () => invoke<UpdateInfo>("check_update"),
  listCloudConnectors: () => invoke<CloudConnector[]>("list_cloud_connectors"),
  getAccount: () => invoke<AccountInfo>("get_account"),
  listTeamTemplates: () => invoke<TeamTemplate[]>("list_team_templates"),
};

// ---------------------------------------------------------------------------
// Permission prompts (confirmation gates)
// ---------------------------------------------------------------------------

export const permissionApi = {
  respond: (requestId: string, approved: boolean) =>
    invoke<void>('respond_permission', { requestId, approved }),
};

// ---------------------------------------------------------------------------
// Interactive UI (chat_ui tool responses)
// ---------------------------------------------------------------------------

export const interactiveApi = {
  respond: (requestId: string, values: Record<string, unknown>) =>
    invoke<void>('respond_interactive_ui', { requestId, values }),
};

// ---------------------------------------------------------------------------
// File / Path utilities
// ---------------------------------------------------------------------------

/**
 * Open a local file or directory with the system default application.
 * On Windows, directories are opened with Explorer.exe directly,
 * which is more reliable than shell.open() for folder paths.
 */
export function openPath(path: string): Promise<void> {
  return invoke<void>("open_path", { path });
}
