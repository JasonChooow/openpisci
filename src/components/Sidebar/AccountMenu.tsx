import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { extrasApi, cloudAccountApi, type AccountInfo } from "../../services/tauri";
import { getCloudBaseUrl, setCloudBaseUrl, normalizeUrl } from "../../config/cloud";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  HelpCircle,
  RefreshCw,
  LogIn,
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
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUrl, setLoginUrl] = useState(getCloudBaseUrl());
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cloudAccountApi.status().then(setAccount).catch(() => setAccount(null));
  }, []);

  const signedIn = !!account?.signed_in;
  const displayName = account?.name || t("account.guestName");
  const displayStatus = signedIn ? t("account.signedIn") : t("account.signedOut");

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const base = normalizeUrl(loginUrl);
    if (!base || !loginUser || !loginPass) return;
    setLoggingIn(true);
    setLoginError("");
    try {
      const info = await cloudAccountApi.signIn(base, loginUser, loginPass);
      setCloudBaseUrl(base);
      setAccount(info);
      setLoginOpen(false);
      setLoginPass("");
      void cloudAccountApi.syncLlm().catch(() => {});
    } catch (err) {
      setLoginError(typeof err === "string" ? err : t("account.loginFailed"));
    } finally {
      setLoggingIn(false);
    }
  };

  const doLogout = async () => {
    try {
      const info = await cloudAccountApi.signOut();
      setAccount(info);
      void cloudAccountApi.syncLlm().catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const runCheckUpdate = async () => {
    setChecking(true);
    setUpdateMsg(t("account.checking"));
    setReleaseUrl(null);
    try {
      const info = await extrasApi.checkUpdate();
      setReleaseUrl(info.release_url ?? null);
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
        <span className="account-avatar">
          <img src="/in-app-icon.png" alt="" />
        </span>
        <span className="account-meta">
          <span className="account-name">{displayName}</span>
          <span className="account-status">{displayStatus}</span>
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
            <span className="account-avatar account-avatar-lg">
              <img src="/in-app-icon.png" alt="" />
            </span>
            <div className="account-menu-id">
              <span className="account-name">{displayName}</span>
              <span className="account-status">{displayStatus}</span>
              {signedIn && typeof account?.balance === "number" && (
                <span className="account-status">{t("account.balance")}: {account.balance}</span>
              )}
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
            {updateMsg && !releaseUrl && <span className="account-menu-trailing">{updateMsg}</span>}
          </button>
          {updateMsg && releaseUrl && (
            <button
              type="button"
              className="account-menu-item account-menu-link-row"
              role="menuitem"
              onClick={() => void openExternal(releaseUrl)}
            >
              <span>{updateMsg}</span>
            </button>
          )}
          <button className="account-menu-item" role="menuitem" onClick={() => { close(); onMinimalMode(); }}>
            <Minimize2 size={16} strokeWidth={1.5} />
            <span>{t("nav.minimalMode")}</span>
          </button>
          <div className="account-menu-divider" />
          {signedIn ? (
            <button className="account-menu-item" role="menuitem" onClick={() => { close(); void doLogout(); }}>
              <LogOut size={16} strokeWidth={1.5} />
              <span>{t("account.logout")}</span>
            </button>
          ) : (
            <button className="account-menu-item" role="menuitem" onClick={() => { close(); setLoginError(""); setLoginUrl(getCloudBaseUrl()); setLoginOpen(true); }}>
              <LogIn size={16} strokeWidth={1.5} />
              <span>{t("account.login")}</span>
            </button>
          )}
        </div>
      )}

      {loginOpen && (
        <div className="account-login-overlay" onMouseDown={() => setLoginOpen(false)}>
          <form className="account-login-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submitLogin}>
            <div className="account-login-title">{t("account.loginTitle")}</div>
            <p className="account-login-desc">{t("account.loginDesc")}</p>
            <label className="account-login-field">
              <span>{t("account.cloudUrl")}</span>
              <input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} spellCheck={false} placeholder="https://…" />
            </label>
            <label className="account-login-field">
              <span>{t("account.username")}</span>
              <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} autoComplete="username" />
            </label>
            <label className="account-login-field">
              <span>{t("account.password")}</span>
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} autoComplete="current-password" />
            </label>
            {loginError && <div className="account-login-error">{loginError}</div>}
            <div className="account-login-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setLoginOpen(false)} disabled={loggingIn}>
                {t("account.cancel")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={loggingIn || !loginUser || !loginPass}>
                {loggingIn ? t("account.loggingIn") : t("account.loginSubmit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
