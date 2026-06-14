export type SettingsSubTab =
  | "general"
  | "models"
  | "agent"
  | "channels"
  | "tools"
  | "system"
  | "memory"
  | "audit"
  | "archive"
  | "about"
  | "debug";

export type ToolsSubTab = "builtin" | "user" | "mcp" | "integrations";

export type OpenSettingsOptions = {
  toolsSubTab?: ToolsSubTab;
};
