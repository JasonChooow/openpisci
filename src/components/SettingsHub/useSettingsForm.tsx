import { useState, useEffect, useCallback, useMemo, createContext, useContext, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { RootState, settingsActions } from "../../store";
import {
  settingsApi,
  gatewayApi,
  systemApi,
  wechatApi,
  enterpriseCapabilityApi,
  Settings as SettingsData,
  ChannelInfo,
  RuntimeCheckItem,
  SystemDependencyItem,
  PrivilegeElevationCheckItem,
  SshServerConfig,
  LlmProviderConfig,
  EnterpriseCapabilityStatus,
  EnterpriseCapabilityTestResult,
} from "../../services/tauri";
import { setLanguage } from "../../i18n";
import { getFontScale, type FontScale } from "../../utils/fontScale";
import { DEFAULT_SETTINGS, EMPTY_LLM_PROVIDER, type EnterprisePlatformId } from "../Settings/settingsDefaults";

export type UseSettingsFormOptions = {
  theme: "violet" | "gold" | "minimal";
  setTheme: (t: "violet" | "gold" | "minimal") => void;
  onOpenTools?: () => void;
};

export function useSettingsFormInternal({ theme, setTheme, onOpenTools }: UseSettingsFormOptions) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { settings } = useSelector((s: RootState) => s.settings);
  const [form, setForm] = useState<SettingsData>({ ...DEFAULT_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<ChannelInfo[]>([]);
  const [gatewayConnecting, setGatewayConnecting] = useState(false);
  const [gatewayDisconnecting, setGatewayDisconnecting] = useState(false);
  const [gatewayMsg, setGatewayMsg] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeCheckItem[]>([]);
  const [runtimesLoading, setRuntimesLoading] = useState(false);
  const [runtimesSettingKey, setRuntimesSettingKey] = useState<string | null>(null);
  const [systemDependencies, setSystemDependencies] = useState<SystemDependencyItem[]>([]);
  const [systemDependenciesLoading, setSystemDependenciesLoading] = useState(false);
  const [privilegeElevationChecks, setPrivilegeElevationChecks] = useState<PrivilegeElevationCheckItem[]>([]);
  const [privilegeElevationLoading, setPrivilegeElevationLoading] = useState(false);
  const [systemDependencyActionKey, setSystemDependencyActionKey] = useState<string | null>(null);
  const [systemDependencyActionError, setSystemDependencyActionError] = useState<string | null>(null);
  const [defaultWorkspace, setDefaultWorkspace] = useState<string>("");
  const [capabilityStatus, setCapabilityStatus] = useState<Partial<Record<EnterprisePlatformId, EnterpriseCapabilityStatus>>>({});
  const [capabilityLoading, setCapabilityLoading] = useState<Partial<Record<EnterprisePlatformId, boolean>>>({});
  const [capabilityTesting, setCapabilityTesting] = useState<Partial<Record<EnterprisePlatformId, boolean>>>({});
  const [capabilityTest, setCapabilityTest] = useState<Partial<Record<EnterprisePlatformId, EnterpriseCapabilityTestResult | null>>>({});
  const [capabilityMsg, setCapabilityMsg] = useState<Partial<Record<EnterprisePlatformId, string | null>>>({});
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getFontScale());

  // WeChat binding flow
  const [wechatQr, setWechatQr] = useState<string | null>(null);
  const [wechatBindState, setWechatBindState] = useState<"idle" | "loading" | "scan" | "scaned" | "success" | "error">("idle");
  const [wechatBindError, setWechatBindError] = useState<string | null>(null);

  const handleWechatBind = async () => {
    setWechatBindState("loading");
    setWechatQr(null);
    setWechatBindError(null);
    try {
      const result = await wechatApi.startLogin();
      if (result.connected) {
        setWechatBindState("success");
      } else if (result.qr_data_url && result.qrcode_token) {
        setWechatQr(result.qr_data_url);
        setWechatBindState("scan");
        // Start polling for scan status
        pollWechatStatus(result.qrcode_token);
      } else {
        setWechatBindState("error");
        setWechatBindError(result.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setWechatBindState("error");
      setWechatBindError(msg);
    }
  };

  const pollWechatStatus = async (token: string) => {
    const maxAttempts = 150; // ~5 minutes at 2s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await wechatApi.pollLogin(token);
        if (status.connected) {
          setWechatBindState("success");
          setWechatQr(null);
          // Auto-connect gateway so the WeChat listener starts immediately after binding.
          try {
            const r = await gatewayApi.connect();
            setGatewayStatus(r.channels);
          } catch {
            // Non-fatal: user can still click "Connect" manually.
          }
          return;
        }
        if (status.message === "scaned") {
          setWechatBindState("scaned");
        }
        if (status.message === "expired") {
          setWechatBindState("error");
          setWechatBindError(t("settings.wechatQrExpired"));
          return;
        }
      } catch {
        // network hiccup, keep polling
      }
    }
    setWechatBindState("error");
    setWechatBindError(t("settings.wechatBindFailed"));
  };

  // SSH Servers
  const [sshServers, setSshServers] = useState<SshServerConfig[]>([]);
  const [sshEditIdx, setSshEditIdx] = useState<number | null>(null);
  const [sshEditForm, setSshEditForm] = useState<SshServerConfig>({ id: "", label: "", host: "", port: 22, username: "", password: "", private_key: "" });
  const [sshShowPassword, setSshShowPassword] = useState(false);

  // Named LLM Providers
  const [llmProviders, setLlmProviders] = useState<LlmProviderConfig[]>([]);
  const [llmEditIdx, setLlmEditIdx] = useState<number | null>(null);
  const [llmEditForm, setLlmEditForm] = useState<LlmProviderConfig>(EMPTY_LLM_PROVIDER);
  const [llmShowKey, setLlmShowKey] = useState(false);

  // Load default workspace path from backend on mount
  useEffect(() => {
    settingsApi.getDefaultWorkspace().then(setDefaultWorkspace).catch(() => {});
  }, []);

  useEffect(() => {
    if (settings) {
      const merged = { ...DEFAULT_SETTINGS, ...settings };
      // If workspace_root is empty, fill with default
      if (!merged.workspace_root?.trim() && defaultWorkspace) {
        merged.workspace_root = defaultWorkspace;
      }
      setForm(merged);
      setSshServers(settings.ssh_servers ?? []);
      setLlmProviders(settings.llm_providers ?? []);
    }
  }, [settings, defaultWorkspace]);

  // Refresh gateway status on mount and whenever settings change (catches post-restart state)
  useEffect(() => {
    gatewayApi.list().then((r) => setGatewayStatus(r.channels)).catch(() => setGatewayStatus([]));
  }, [settings]);

  useEffect(() => {
    const unlisten = listen<{ channels: ChannelInfo[] }>("gateway_channels_updated", (event) => {
      setGatewayStatus(event.payload.channels ?? []);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const refreshCapabilityStatus = useCallback(async (platform: EnterprisePlatformId) => {
    try {
      const status = await enterpriseCapabilityApi.status(platform);
      setCapabilityStatus((prev) => ({ ...prev, [platform]: status }));
    } catch (e) {
      setCapabilityMsg((prev) => ({ ...prev, [platform]: t("settings.enterpriseCapabilityStatusFailed", { error: String(e) }) }));
    }
  }, [t]);

  useEffect(() => {
    (["feishu", "wecom", "dingtalk"] as EnterprisePlatformId[]).forEach((platform) => {
      refreshCapabilityStatus(platform);
    });
  }, [refreshCapabilityStatus, settings]);

  const handleGatewayConnect = async () => {
    setGatewayConnecting(true);
    setGatewayMsg(null);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(t("settings.channelTimeout"))), 20000)
    );
    try {
      const r = await Promise.race([gatewayApi.connect(), timeout]);
      setGatewayStatus(r.channels);
      setGatewayMsg(t("settings.channelConnected"));
    } catch (e) {
      setGatewayMsg(t("settings.channelFailed", { error: String(e) }));
    } finally {
      setGatewayConnecting(false);
    }
  };

  const handleEnableCapability = async (platform: EnterprisePlatformId) => {
    setCapabilityLoading((prev) => ({ ...prev, [platform]: true }));
    setCapabilityMsg((prev) => ({ ...prev, [platform]: null }));
    setCapabilityTest((prev) => ({ ...prev, [platform]: null }));
    try {
      const status = await enterpriseCapabilityApi.enable(platform);
      setCapabilityStatus((prev) => ({ ...prev, [platform]: status }));
      setCapabilityMsg((prev) => ({ ...prev, [platform]: t("settings.enterpriseCapabilityEnabled") }));
    } catch (e) {
      setCapabilityMsg((prev) => ({ ...prev, [platform]: t("settings.enterpriseCapabilityEnableFailed", { error: String(e) }) }));
    } finally {
      setCapabilityLoading((prev) => ({ ...prev, [platform]: false }));
    }
  };

  const handleTestCapability = async (platform: EnterprisePlatformId) => {
    setCapabilityTesting((prev) => ({ ...prev, [platform]: true }));
    setCapabilityMsg((prev) => ({ ...prev, [platform]: null }));
    try {
      const result = await enterpriseCapabilityApi.test(platform);
      setCapabilityStatus((prev) => ({ ...prev, [platform]: result.status }));
      setCapabilityTest((prev) => ({ ...prev, [platform]: result }));
      setCapabilityMsg((prev) => ({ ...prev, [platform]: result.success
        ? t("settings.enterpriseCapabilityTestSuccess", { count: result.tools.length })
        : t("settings.enterpriseCapabilityTestFailed", { error: result.error ?? "unknown" })
      }));
    } catch (e) {
      setCapabilityMsg((prev) => ({ ...prev, [platform]: t("settings.enterpriseCapabilityTestFailed", { error: String(e) }) }));
    } finally {
      setCapabilityTesting((prev) => ({ ...prev, [platform]: false }));
    }
  };

  const handleGatewayDisconnect = async () => {
    setGatewayDisconnecting(true);
    setGatewayMsg(null);
    try {
      await gatewayApi.disconnect();
      setGatewayStatus([]);
      setGatewayMsg(t("settings.channelDisconnected"));
    } catch (e) {
      setGatewayMsg(t("settings.channelDisconnectFailed", { error: String(e) }));
    } finally {
      setGatewayDisconnecting(false);
    }
  };

  const handleCheckRuntimes = useCallback(async () => {
    setRuntimesLoading(true);
    setSystemDependenciesLoading(true);
    setPrivilegeElevationLoading(true);
    setSystemDependencyActionError(null);
    try {
      const [items, deps, privilegeChecks] = await Promise.all([
        systemApi.checkRuntimes(),
        systemApi.checkSystemDependencies(),
        systemApi.checkPrivilegeElevation(),
      ]);
      setRuntimes(items);
      setSystemDependencies(deps);
      setPrivilegeElevationChecks(privilegeChecks);
    } catch {
      // ignore
    } finally {
      setRuntimesLoading(false);
      setSystemDependenciesLoading(false);
      setPrivilegeElevationLoading(false);
    }
  }, []);

  const handleRunDependencyAction = useCallback(async (
    item: { key: string; name: string; action: SystemDependencyItem["action"] },
  ) => {
    if (!item.action) return;
    setSystemDependencyActionKey(item.key);
    setSystemDependencyActionError(null);
    try {
      await systemApi.runSystemDependencyAction(item.key);
    } catch (e) {
      setSystemDependencyActionError(t("settings.systemDepActionFailed", {
        name: item.name,
        error: String(e),
      }));
    } finally {
      setSystemDependencyActionKey(null);
    }
  }, [t]);

  const dependencyActionLabel = useCallback((item: { action: SystemDependencyItem["action"] }) => {
    if (!item.action) return null;
    switch (item.action.kind) {
      case "install_command":
        return t("settings.systemDepActionInstall");
      case "open_url":
        return t("settings.systemDepActionDownload");
      case "open_settings":
        return t("settings.systemDepActionOpenSettings");
      default:
        return t("settings.systemDepActionOpen");
    }
  }, [t]);

  const handleSelectRuntimePath = useCallback(async (runtimeKey: string, runtimeName: string) => {
    setRuntimesSettingKey(runtimeKey);
    try {
      const exeFilter = runtimeName === "Node.js" || runtimeName === "npm"
        ? [{ name: "Executable", extensions: ["exe", "cmd", "bat", "*"] }]
        : [{ name: "Executable", extensions: ["exe", "*"] }];
      const selected = await openFileDialog({ multiple: false, filters: exeFilter });
      if (!selected) return;
      const items = await systemApi.setRuntimePath(runtimeKey, selected as string);
      setRuntimes(items);
    } catch {
      // ignore
    } finally {
      setRuntimesSettingKey(null);
    }
  }, []);

  const statusBadge = (s: ChannelInfo["status"]) => {
    if (s === "Connected") return <span style={{ color: "#28a745", fontWeight: 600 }}>● {t("common.connected")}</span>;
    if (s === "Connecting") return <span style={{ color: "#ffc107", fontWeight: 600 }}>● {t("common.connecting")}</span>;
    if (s === "Disconnected") return <span style={{ color: "var(--text-muted)" }}>● {t("common.disconnected")}</span>;
    if (typeof s === "object" && "Error" in s) return <span style={{ color: "#dc3545" }}>● {t("common.error")}: {s.Error}</span>;
    return null;
  };

  const isDirty = useMemo(() => {
    if (!settings) return false;
    const persisted = {
      ...DEFAULT_SETTINGS,
      ...settings,
      ssh_servers: settings.ssh_servers ?? [],
      llm_providers: settings.llm_providers ?? [],
    };
    const current = {
      ...form,
      ssh_servers: sshServers,
      llm_providers: llmProviders,
    };
    return JSON.stringify(current) !== JSON.stringify(persisted);
  }, [form, sshServers, llmProviders, settings]);

  const saveSettingsSnapshot = async (nextLlmProviders: LlmProviderConfig[] = llmProviders) => {
    // workspace_root is always required — fill with default if blank
    if (!(form.workspace_root ?? "").trim()) {
      if (defaultWorkspace) {
        update("workspace_root", defaultWorkspace);
      } else {
        setSaveError(t("settings.workspaceRootRequired"));
        return;
      }
    }
    const micro = Number(form.compaction_micro_percent ?? 60);
    const auto = Number(form.compaction_auto_percent ?? 80);
    const full = Number(form.compaction_full_percent ?? 95);
    if (!(micro >= 0 && micro < auto && auto < full && full < 100)) {
      setSaveError(t("settings.compactionThresholdOrderError"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await settingsApi.save({
        ...form,
        compaction_micro_percent: micro,
        compaction_auto_percent: auto,
        compaction_full_percent: full,
        auto_compact_input_tokens_threshold:
          Number(form.auto_compact_input_tokens_threshold) || 400000,
        max_tool_result_tokens: Math.max(1000, Number(form.max_tool_result_tokens) || 16000),
        summary_model: (form.summary_model ?? "").trim() || null,
        ssh_servers: sshServers,
        llm_providers: nextLlmProviders,
      });
      dispatch(settingsActions.setSettings(updated));
      dispatch(settingsActions.setConfigured(updated.is_configured ?? !!(updated.anthropic_api_key || updated.openai_api_key || updated.deepseek_api_key || updated.qwen_api_key)));
      // 立即切换语言
      if (updated.language) setLanguage(updated.language as "zh" | "en");
      (["feishu", "wecom", "dingtalk"] as EnterprisePlatformId[]).forEach((platform) => {
        refreshCapabilityStatus(platform);
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(t("settings.failedSave", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await saveSettingsSnapshot();
  };

  const saveLlmProviders = async (nextLlmProviders: LlmProviderConfig[]) => {
    setLlmProviders(nextLlmProviders);
    await saveSettingsSnapshot(nextLlmProviders);
  };

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const capabilityStatusMessage = (platform: EnterprisePlatformId, status?: EnterpriseCapabilityStatus | null) => {
    if (!status) return t("settings.enterpriseCapabilityLoading");
    if (!status.configured) {
      return platform === "dingtalk"
        ? t("settings.dingtalkMcpUrlMissing")
        : t("settings.enterpriseCapabilityStatusNeedsConfig");
    }
    if (platform === "wecom") return t("settings.wecomEnterpriseStatusReady");
    if (!status.mcp_configured) return t("settings.enterpriseCapabilityStatusReadyToEnable");
    if (!status.mcp_enabled) return t("settings.enterpriseCapabilityStatusDisabled");
    return t("settings.enterpriseCapabilityStatusActive");
  };

  const capabilityDiagnostics = (platform: EnterprisePlatformId, test?: EnterpriseCapabilityTestResult | null) => {
    if (!test) return [];
    if (test.success) {
      if (platform === "wecom") return [t("settings.wecomEnterpriseTestSuccessHint")];
      if (platform === "dingtalk") return [t("settings.dingtalkEnterpriseTestSuccessHint")];
      return [t("settings.feishuEnterpriseTestSuccessHint")];
    }
    if (platform === "wecom") return [t("settings.wecomEnterpriseTestFailedHint")];
    if (platform === "dingtalk") return [t("settings.dingtalkEnterpriseTestFailedHint")];
    return [t("settings.feishuEnterpriseTestFailedHint")];
  };

  const capabilityMissingCredentialsMessage = (platform: EnterprisePlatformId, status: EnterpriseCapabilityStatus) => {
    if (!status.missing_credentials.length) return null;
    if (platform === "wecom") return t("settings.wecomEnterpriseMissingCreds");
    if (platform === "dingtalk") return t("settings.dingtalkMcpUrlMissing");
    if (platform === "feishu") return t("settings.feishuEnterpriseMissingCreds");
    return t("settings.enterpriseCapabilityMissingCreds", { fields: status.missing_credentials.join(", ") });
  };

  const renderEnterpriseCapabilityPanel = (
    platform: EnterprisePlatformId,
    title: string,
    description: string,
    options: { showOpenTools?: boolean; showEnable?: boolean } = {}
  ) => {
    const status = capabilityStatus[platform];
    const loading = !!capabilityLoading[platform];
    const testing = !!capabilityTesting[platform];
    const test = capabilityTest[platform];
    const msg = capabilityMsg[platform];
    const diagnostics = capabilityDiagnostics(platform, test);
    const showEnable = options.showEnable !== false;
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>
          {t("settings.imCapabilityLabel")}
        </div>
        <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.6 }}>{description}</p>
            </div>
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              color: status?.enabled ? "#28a745" : status?.configured ? "#ffc107" : "#dc3545",
              background: "rgba(255,255,255,0.04)",
              whiteSpace: "nowrap",
            }}>
              {status?.enabled
                ? t("settings.enterpriseCapabilityStatusEnabled")
                : status?.configured
                  ? t("settings.enterpriseCapabilityStatusReady")
                  : t("settings.enterpriseCapabilityStatusMissing")}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.6 }}>
            {capabilityStatusMessage(platform, status)}
          </p>
          {status?.missing_credentials.length ? (
            <p style={{ fontSize: 12, color: "#dc3545", margin: "6px 0 0", lineHeight: 1.5 }}>
              {capabilityMissingCredentialsMessage(platform, status)}
            </p>
          ) : null}
          {msg && (
            <div style={{
              marginTop: 8,
              fontSize: 12,
              lineHeight: 1.5,
              padding: "6px 8px",
              borderRadius: 6,
              color: test?.success ? "#28a745" : msg.includes("失败") || msg.toLowerCase().includes("failed") ? "#dc3545" : "var(--text-primary)",
              background: test?.success ? "rgba(40,167,69,0.12)" : "rgba(255,255,255,0.04)",
            }}>
              {msg}
            </div>
          )}
          {diagnostics.length ? (
            <ul style={{ margin: "8px 0 0 18px", padding: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {diagnostics.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          ) : null}
          {test?.tools?.length ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
              {t("settings.enterpriseCapabilityToolsPreview", {
                count: test.tools.length,
                tools: test.tools.slice(0, 5).map(tool => tool.name).join(", "),
              })}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {showEnable && (
              <button className="btn btn-secondary" type="button" onClick={() => handleEnableCapability(platform)} disabled={loading || !status?.configured}>
                {loading ? t("common.loading") : t("settings.enterpriseCapabilityEnable")}
              </button>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => handleTestCapability(platform)} disabled={testing || !status?.configured}>
              {testing ? t("settings.enterpriseCapabilityTesting") : t("settings.enterpriseCapabilityTest")}
            </button>
            {options.showOpenTools && onOpenTools && (
              <button className="btn btn-secondary" type="button" onClick={onOpenTools}>
                {t("settings.enterpriseCapabilityOpenTools")}
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  return {
    theme,
    setTheme,
    onOpenTools,
    form,
    update,
    saving,
    saved,
    saveError,
    setSaveError,
    isDirty,
    handleSave,
    showKeys,
    setShowKeys,
    gatewayStatus,
    gatewayConnecting,
    gatewayDisconnecting,
    gatewayMsg,
    handleGatewayConnect,
    handleGatewayDisconnect,
    statusBadge,
    runtimes,
    runtimesLoading,
    runtimesSettingKey,
    handleCheckRuntimes,
    handleSelectRuntimePath,
    systemDependencies,
    systemDependenciesLoading,
    privilegeElevationChecks,
    privilegeElevationLoading,
    systemDependencyActionKey,
    systemDependencyActionError,
    handleRunDependencyAction,
    dependencyActionLabel,
    defaultWorkspace,
    fontScale,
    setFontScaleState,
    wechatQr,
    wechatBindState,
    wechatBindError,
    handleWechatBind,
    sshServers,
    setSshServers,
    sshEditIdx,
    setSshEditIdx,
    sshEditForm,
    setSshEditForm,
    sshShowPassword,
    setSshShowPassword,
    llmProviders,
    setLlmProviders,
    saveLlmProviders,
    llmEditIdx,
    setLlmEditIdx,
    llmEditForm,
    setLlmEditForm,
    llmShowKey,
    setLlmShowKey,
    EMPTY_LLM_PROVIDER,
    renderEnterpriseCapabilityPanel,
  };
}

export type SettingsFormContextValue = ReturnType<typeof useSettingsFormInternal>;

const SettingsFormContext = createContext<SettingsFormContextValue | null>(null);

export function SettingsFormProvider({
  children,
  theme,
  setTheme,
  onOpenTools,
}: UseSettingsFormOptions & { children: ReactNode }) {
  const value = useSettingsFormInternal({ theme, setTheme, onOpenTools });
  return <SettingsFormContext.Provider value={value}>{children}</SettingsFormContext.Provider>;
}

export function useSettingsForm(): SettingsFormContextValue {
  const ctx = useContext(SettingsFormContext);
  if (!ctx) throw new Error("useSettingsForm must be used within SettingsFormProvider");
  return ctx;
}
