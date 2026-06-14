#!/usr/bin/env node
/**
 * One-off helper: extract JSX line ranges from Settings/index.tsx into panel section files.
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(root, "src/components/Settings/index.tsx"), "utf8");
const lines = src.split("\n");

function extract(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

const sectionStyle = `export const SECTION_H2: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border)",
};
`;

fs.writeFileSync(
  path.join(root, "src/components/Settings/settingsStyles.ts"),
  `import type React from "react";\n\n${sectionStyle}`,
);

const ranges = {
  ModelsSection: [623, 1007],
  WorkspaceSection: [1009, 1055],
  SecuritySection: [1057, 1082],
  AllowMultipleSection: [1083, 1091],
  AgentConfigSection: [1094, 1323],
  InterfaceSection: [1325, 1429],
  ChannelsSection: [1431, 1845],
  EmailSection: [1847, 1908],
  SshSection: [1910, 2022],
  SystemSection: [2024, 2328],
};

const outDir = path.join(root, "src/components/Settings/sections");
fs.mkdirSync(outDir, { recursive: true });

for (const [name, [start, end]] of Object.entries(ranges)) {
  const body = extract(start, end);
  const content = `/* Auto-extracted from Settings/index.tsx lines ${start}-${end} — edit in place after split */\nimport { open as openUrl } from "@tauri-apps/plugin-shell";\nimport { useTranslation } from "react-i18next";\nimport { FONT_SCALE_OPTIONS, setFontScale, type FontScale } from "../../../utils/fontScale";\nimport { useSettingsForm } from "../../SettingsHub/useSettingsForm";\nimport { SECTION_H2 } from "../settingsStyles";\n\nexport default function ${name}() {\n  const { t } = useTranslation();\n  const ctx = useSettingsForm();\n  const {\n    form,\n    update,\n    theme,\n    setTheme,\n    showKeys,\n    setShowKeys,\n    fontScale,\n    setFontScaleState,\n    defaultWorkspace,\n    gatewayStatus,\n    gatewayMsg,\n    gatewayConnecting,\n    gatewayDisconnecting,\n    handleGatewayConnect,\n    handleGatewayDisconnect,\n    statusBadge,\n    wechatQr,\n    wechatBindState,\n    wechatBindError,\n    handleWechatBind,\n    renderEnterpriseCapabilityPanel,\n    sshServers,\n    setSshServers,\n    sshEditIdx,\n    setSshEditIdx,\n    sshEditForm,\n    setSshEditForm,\n    sshShowPassword,\n    setSshShowPassword,\n    llmProviders,\n    setLlmProviders,\n    llmEditIdx,\n    setLlmEditIdx,\n    llmEditForm,\n    setLlmEditForm,\n    llmShowKey,\n    setLlmShowKey,\n    EMPTY_LLM_PROVIDER,\n    runtimes,\n    runtimesLoading,\n    runtimesSettingKey,\n    handleCheckRuntimes,\n    handleSelectRuntimePath,\n    systemDependencies,\n    systemDependenciesLoading,\n    privilegeElevationChecks,\n    privilegeElevationLoading,\n    systemDependencyActionKey,\n    systemDependencyActionError,\n    handleRunDependencyAction,\n    dependencyActionLabel,\n  } = ctx;\n\n  return (\n    <>\n${body.split("\n").map((l) => "      " + l).join("\n")}\n    </>\n  );\n}\n`;
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
}

console.log("Extracted", Object.keys(ranges).length, "sections to", outDir);
