import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SlidersHorizontal,
  Brain,
  Bot,
  MessageSquare,
  Wrench,
  Cpu,
  Lightbulb,
  ScrollText,
  Archive,
} from "lucide-react";
import { SettingsFormProvider } from "./useSettingsForm";
import SettingsSaveBar from "./SettingsSaveBar";
import "./SettingsHub.css";

const GeneralPanel = lazy(() => import("../Settings/GeneralPanel"));
const ModelsPanel = lazy(() => import("../Settings/ModelsPanel"));
const AgentPanel = lazy(() => import("../Settings/AgentPanel"));
const ChannelsPanel = lazy(() => import("../Settings/ChannelsPanel"));
const Tools = lazy(() => import("../Tools"));
const SystemPanel = lazy(() => import("../Settings/SystemPanel"));
const Memory = lazy(() => import("../Memory"));
const AuditLog = lazy(() => import("../AuditLog"));
const ArchivedTasks = lazy(() => import("../Settings/ArchivedTasks"));
const About = lazy(() => import("../About"));
const DebugPanel = lazy(() => import("../Debug"));

import type { SettingsSubTab, ToolsSubTab } from "./types";

export type { SettingsSubTab, ToolsSubTab, OpenSettingsOptions } from "./types";

export type SettingsHubProps = {
  theme: "violet" | "gold" | "minimal";
  setTheme: (t: "violet" | "gold" | "minimal") => void;
  activeSubTab: SettingsSubTab;
  onSubTabChange: (t: SettingsSubTab) => void;
  toolsSubTab?: ToolsSubTab;
  onOpenAssistant?: () => void;
};

const ICON_SIZE = 17;

type NavItem = {
  id: SettingsSubTab;
  label: string;
  icon: JSX.Element;
  group?: "pref" | "agent" | "connect" | "data" | "other";
};

export default function SettingsHub({
  theme,
  setTheme,
  activeSubTab,
  onSubTabChange,
  toolsSubTab = "builtin",
  onOpenAssistant,
}: SettingsHubProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState<Set<SettingsSubTab>>(() => new Set([activeSubTab]));
  const [localToolsSubTab, setLocalToolsSubTab] = useState<ToolsSubTab>(toolsSubTab);

  useEffect(() => {
    setLocalToolsSubTab(toolsSubTab);
  }, [toolsSubTab]);

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeSubTab)) return prev;
      const next = new Set(prev);
      next.add(activeSubTab);
      return next;
    });
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab === "about" || activeSubTab === "debug") {
      onSubTabChange("general");
    }
  }, [activeSubTab, onSubTabChange]);

  const items: NavItem[] = [
    { id: "general", label: t("settingsHub.general"), icon: <SlidersHorizontal size={ICON_SIZE} strokeWidth={1.5} />, group: "pref" },
    { id: "models", label: t("settingsHub.models"), icon: <Brain size={ICON_SIZE} strokeWidth={1.5} />, group: "agent" },
    { id: "agent", label: t("settingsHub.agent"), icon: <Bot size={ICON_SIZE} strokeWidth={1.5} />, group: "agent" },
    { id: "channels", label: t("settingsHub.channels"), icon: <MessageSquare size={ICON_SIZE} strokeWidth={1.5} />, group: "connect" },
    { id: "tools", label: t("nav.tools"), icon: <Wrench size={ICON_SIZE} strokeWidth={1.5} />, group: "connect" },
    { id: "system", label: t("settingsHub.system"), icon: <Cpu size={ICON_SIZE} strokeWidth={1.5} />, group: "connect" },
    { id: "memory", label: t("nav.memory"), icon: <Lightbulb size={ICON_SIZE} strokeWidth={1.5} />, group: "data" },
    { id: "audit", label: t("nav.audit"), icon: <ScrollText size={ICON_SIZE} strokeWidth={1.5} />, group: "data" },
    { id: "archive", label: t("settingsHub.archive"), icon: <Archive size={ICON_SIZE} strokeWidth={1.5} />, group: "data" },
  ];

  const openToolsMcp = () => {
    setLocalToolsSubTab("mcp");
    onSubTabChange("tools");
  };

  return (
    <SettingsFormProvider
      theme={theme}
      setTheme={setTheme}
      onOpenTools={openToolsMcp}
    >
      <div className="settings-hub">
        <nav className="settings-hub-nav">
          <div className="settings-hub-nav-title">{t("nav.settings")}</div>
          {items.map((item, idx) => {
            const prev = items[idx - 1];
            const showDivider = prev && prev.group !== item.group;
            return (
              <div key={item.id}>
                {showDivider && <div className="settings-hub-nav-divider" />}
                <button
                  className={`settings-hub-nav-item${activeSubTab === item.id ? " active" : ""}`}
                  onClick={() => onSubTabChange(item.id)}
                >
                  <span className="settings-hub-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
        <div className="settings-hub-main">
          <SettingsSaveBar />
          <div className="settings-hub-content">
            <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /></div>}>
              {mounted.has("general") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "general"}><GeneralPanel /></div>
              )}
              {mounted.has("models") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "models"}><ModelsPanel /></div>
              )}
              {mounted.has("agent") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "agent"}><AgentPanel /></div>
              )}
              {mounted.has("channels") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "channels"}>
                  <ChannelsPanel onOpenAssistant={onOpenAssistant} />
                </div>
              )}
              {mounted.has("tools") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "tools"}>
                  <Tools initialTab={localToolsSubTab} onOpenSettingsTab={onSubTabChange} />
                </div>
              )}
              {mounted.has("system") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "system"}><SystemPanel /></div>
              )}
              {mounted.has("memory") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "memory"}><Memory /></div>
              )}
              {mounted.has("audit") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "audit"}><AuditLog /></div>
              )}
              {mounted.has("archive") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "archive"}><ArchivedTasks /></div>
              )}
              {mounted.has("about") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "about"}><About /></div>
              )}
              {mounted.has("debug") && (
                <div className="settings-hub-panel" hidden={activeSubTab !== "debug"}><DebugPanel /></div>
              )}
            </Suspense>
          </div>
        </div>
      </div>
    </SettingsFormProvider>
  );
}
