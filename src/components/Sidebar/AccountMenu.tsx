import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { extrasApi } from "../../services/tauri";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  HelpCircle,
  RefreshCw,
  LogOut,
  Bell,
  Minimize2,
} from "lucide-react";
import "./Sidebar.css";

export type AccountMenuProps = {
  colorMode: "light" | "dark";
  onToggleColorMode: () => void;
  onOpenSettings: () => void;
  onHelp: () => void;
  onMinimalMode: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
};

export default function AccountMenu({
  colorMode,
  onToggleColorMode,
  onOpenSettings,
  onHelp,
  onMinimalMode,
  unreadCount = 0,
  onOpenNotifications,
}: AccountMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const runCheckUpdate = async () => {
    setChecking(true);
    setUpdateMsg(t("account.checking"));
    try {
      const info = await extrasApi.checkUpdate();
      setUpdateMsg(
        info.update_available
          ? t("account.updateAvailable", { version: info.latest_version })
          : t("account.upToDate", { version: info.current_version }),
      );
    } catch {
      setUpdateMsg(t("account.updateFailed"));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!open && !notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, notifOpen]);

  const close = () => setOpen(false);

  return (
    <div className="account-bar" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((v) => !v)}
        title={t("account.title")}
      >
        <span className="account-avatar">{t("account.initial")}</span>
        <span className="account-meta">
          <span className="account-name">{t("account.guestName")}</span>
          <span className="account-status">{t("account.signedOut")}</span>
        </span>
      </button>

      <button
        type="button"
        className="account-bell"
        title={t("account.notifications")}
        onClick={() => {
          setOpen(false);
          setNotifOpen((v) => !v);
          onOpenNotifications?.();
        }}
      >
        <Bell size={16} strokeWidth={1.5} />
        {unreadCount > 0 && <span className="account-bell-dot" />}
      </button>

      {notifOpen && (
        <div className="account-notif" role="menu">
          <div className="account-notif-header">{t("account.notifications")}</div>
          <div className="account-notif-empty">
            <Bell size={22} strokeWidth={1.3} />
            <span>{t("account.noNotifications")}</span>
          </div>
        </div>
      )}

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-header">
            <span className="account-avatar account-avatar-lg">{t("account.initial")}</span>
            <div className="account-menu-id">
              <span className="account-name">{t("account.guestName")}</span>
              <span className="account-status">{t("account.signedOut")}</span>
            </div>
          </div>
          <div className="account-menu-divider" />
          <button className="account-menu-item" role="menuitem" onClick={() => { close(); onOpenSettings(); }}>
            <SettingsIcon size={16} strokeWidth={1.5} />
            <span>{t("nav.settings")}</span>
          </button>
          <button className="account-menu-item" role="menuitem" onClick={() => { onToggleColorMode(); }}>
            {colorMode === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            <span>{t("account.appearance")}</span>
            <span className="account-menu-trailing">
              {colorMode === "dark" ? t("nav.colorModeDark") : t("nav.colorModeLight")}
            </span>
          </button>
          <button className="account-menu-item" role="menuitem" onClick={() => { close(); onHelp(); }}>
            <HelpCircle size={16} strokeWidth={1.5} />
            <span>{t("account.help")}</span>
          </button>
          <button className="account-menu-item" role="menuitem" onClick={() => void runCheckUpdate()} disabled={checking}>
            <RefreshCw size={16} strokeWidth={1.5} className={checking ? "spin" : ""} />
            <span>{t("account.checkUpdate")}</span>
            {updateMsg && <span className="account-menu-trailing">{updateMsg}</span>}
          </button>
          <button className="account-menu-item" role="menuitem" onClick={() => { close(); onMinimalMode(); }}>
            <Minimize2 size={16} strokeWidth={1.5} />
            <span>{t("nav.minimalMode")}</span>
          </button>
          <div className="account-menu-divider" />
          <button className="account-menu-item account-menu-item-muted" role="menuitem" disabled title={t("account.logoutHint")}>
            <LogOut size={16} strokeWidth={1.5} />
            <span>{t("account.logout")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
