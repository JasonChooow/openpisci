import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SlidersHorizontal,
  Wrench,
  Zap,
  Lightbulb,
  ScrollText,
  Info,
  FlaskConical,
} from "lucide-react";
import "./SettingsHub.css";

const Settings = lazy(() => import("../Settings"));
const Tools = lazy(() => import("../Tools"));
const Skills = lazy(() => import("../Skills"));
const Memory = lazy(() => import("../Memory"));
const AuditLog = lazy(() => import("../AuditLog"));
const About = lazy(() => import("../About"));
const DebugPanel = lazy(() => import("../Debug"));

export type SettingsSubTab =
  | "general"
  | "tools"
  | "skills"
  | "memory"
  | "audit"
  | "about"
  | "debug";

export type SettingsHubProps = {
  theme: "violet" | "gold";
  setTheme: (t: "violet" | "gold") => void;
  activeSubTab: SettingsSubTab;
  onSubTabChange: (t: SettingsSubTab) => void;
  onNavigateToChat: () => void;
};

const ICON_SIZE = 17;

export default function SettingsHub({
  theme,
  setTheme,
  activeSubTab,
  onSubTabChange,
  onNavigateToChat,
}: SettingsHubProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState<Set<SettingsSubTab>>(() => new Set([activeSubTab]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeSubTab)) return prev;
      const next = new Set(prev);
      next.add(activeSubTab);
      return next;
    });
  }, [activeSubTab]);

  const items: { id: SettingsSubTab; label: string; icon: JSX.Element }[] = [
    { id: "general", label: t("settingsHub.general"), icon: <SlidersHorizontal size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "tools", label: t("nav.tools"), icon: <Wrench size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "skills", label: t("nav.skills"), icon: <Zap size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "memory", label: t("nav.memory"), icon: <Lightbulb size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "audit", label: t("nav.audit"), icon: <ScrollText size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "about", label: t("nav.about"), icon: <Info size={ICON_SIZE} strokeWidth={1.5} /> },
    { id: "debug", label: t("nav.debug"), icon: <FlaskConical size={ICON_SIZE} strokeWidth={1.5} /> },
  ];

  return (
    <div className="settings-hub">
      <nav className="settings-hub-nav">
        <div className="settings-hub-nav-title">{t("nav.settings")}</div>
        {items.map((item) => (
          <button
            key={item.id}
            className={`settings-hub-nav-item${activeSubTab === item.id ? " active" : ""}`}
            onClick={() => onSubTabChange(item.id)}
          >
            <span className="settings-hub-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-hub-content">
        <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /></div>}>
          {mounted.has("general") && (
            <div className="settings-hub-panel" hidden={activeSubTab !== "general"}>
              <Settings theme={theme} setTheme={setTheme} onOpenTools={() => onSubTabChange("tools")} />
            </div>
          )}
          {mounted.has("tools") && (
            <div className="settings-hub-panel" hidden={activeSubTab !== "tools"}><Tools /></div>
          )}
          {mounted.has("skills") && (
            <div className="settings-hub-panel" hidden={activeSubTab !== "skills"}>
              <Skills onNavigateTab={onNavigateToChat} />
            </div>
          )}
          {mounted.has("memory") && (
            <div className="settings-hub-panel" hidden={activeSubTab !== "memory"}><Memory /></div>
          )}
          {mounted.has("audit") && (
            <div className="settings-hub-panel" hidden={activeSubTab !== "audit"}><AuditLog /></div>
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
  );
}
