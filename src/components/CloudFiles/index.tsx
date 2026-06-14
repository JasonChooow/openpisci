import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Cloud, Folder, File, Link2, Unlink } from "lucide-react";
import { cloudApi, extrasApi, type CloudConnector, type WebDavEntry } from "../../services/tauri";
import "./CloudFiles.css";

export default function CloudFiles({ visible = true }: { visible?: boolean }) {
  const { t } = useTranslation();
  const [connectors, setConnectors] = useState<CloudConnector[]>([]);
  const [loading, setLoading] = useState(false);
  const [webdavOpen, setWebdavOpen] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPass, setWebdavPass] = useState("");
  const [webdavSaving, setWebdavSaving] = useState(false);
  const [webdavError, setWebdavError] = useState("");
  const [entries, setEntries] = useState<WebDavEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const refreshConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const list = await extrasApi.listCloudConnectors();
      setConnectors(list);
      const cfg = await cloudApi.getWebDavConfig();
      setWebdavUrl(cfg.url);
      setWebdavUser(cfg.username);
      if (cfg.connected) {
        setBrowsing(true);
        const files = await cloudApi.listWebDavFiles("");
        setEntries(files);
        setCurrentPath("");
      }
    } catch {
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void refreshConnectors();
  }, [visible, refreshConnectors]);

  const webdav = connectors.find((c) => c.id === "webdav");

  const saveWebDav = async () => {
    setWebdavSaving(true);
    setWebdavError("");
    try {
      await cloudApi.saveWebDavConfig(webdavUrl, webdavUser, webdavPass || undefined);
      setWebdavPass("");
      setWebdavOpen(false);
      setBrowsing(true);
      const files = await cloudApi.listWebDavFiles("");
      setEntries(files);
      setCurrentPath("");
      await refreshConnectors();
    } catch (e) {
      setWebdavError(String(e));
    } finally {
      setWebdavSaving(false);
    }
  };

  const disconnectWebDav = async () => {
    await cloudApi.disconnectWebDav();
    setBrowsing(false);
    setEntries([]);
    setCurrentPath("");
    setWebdavUrl("");
    setWebdavUser("");
    await refreshConnectors();
  };

  const openEntry = async (entry: WebDavEntry) => {
    if (!entry.is_dir) return;
    setLoading(true);
    try {
      const files = await cloudApi.listWebDavFiles(entry.path);
      setEntries(files);
      setCurrentPath(entry.path);
    } catch (e) {
      setWebdavError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const goUp = async () => {
    if (!currentPath) return;
    const parent = currentPath.replace(/\/[^/]+\/?$/, "");
    setLoading(true);
    try {
      const files = await cloudApi.listWebDavFiles(parent);
      setEntries(files);
      setCurrentPath(parent);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cloud-files">
      <div className="feature-topbar">
        <h1 className="feature-topbar-title">
          <Cloud size={20} strokeWidth={1.5} />
          {t("nav.cloudFiles")}
        </h1>
      </div>
      <div className="cloud-files-body">
        <p className="cloud-files-intro">{t("cloud.intro")}</p>

        {loading && connectors.length === 0 ? (
          <div className="cloud-files-empty">{t("common.loading")}</div>
        ) : (
          <div className="cloud-files-grid">
            {connectors.map((c) => (
              <div key={c.id} className="cloud-connector-card">
                <div className="cloud-connector-icon"><Cloud size={22} strokeWidth={1.4} /></div>
                <div className="cloud-connector-main">
                  <span className="cloud-connector-name">{c.name}</span>
                  <span className="cloud-connector-status">
                    {c.connected ? t("cloud.connected") : t("cloud.notConnected")}
                  </span>
                </div>
                {c.id === "webdav" && c.available ? (
                  c.connected ? (
                    <button type="button" className="cloud-connector-btn" onClick={() => void disconnectWebDav()}>
                      <Unlink size={14} strokeWidth={1.5} /> {t("cloud.disconnect")}
                    </button>
                  ) : (
                    <button type="button" className="cloud-connector-btn" onClick={() => setWebdavOpen(true)}>
                      <Link2 size={14} strokeWidth={1.5} /> {t("cloud.connect")}
                    </button>
                  )
                ) : (
                  <button type="button" className="cloud-connector-btn" disabled title={t("cloud.comingSoon")}>
                    <Link2 size={14} strokeWidth={1.5} /> {t("cloud.comingSoon")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {webdavOpen && (
          <div className="cloud-webdav-form">
            <h3>{t("cloud.webdavTitle")}</h3>
            <input className="cloud-webdav-input" value={webdavUrl} onChange={(e) => setWebdavUrl(e.target.value)} placeholder={t("cloud.webdavUrl")} />
            <input className="cloud-webdav-input" value={webdavUser} onChange={(e) => setWebdavUser(e.target.value)} placeholder={t("cloud.webdavUser")} />
            <input className="cloud-webdav-input" type="password" value={webdavPass} onChange={(e) => setWebdavPass(e.target.value)} placeholder={t("cloud.webdavPass")} />
            {webdavError && <div className="cloud-webdav-error">{webdavError}</div>}
            <div className="cloud-webdav-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setWebdavOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn btn-primary" onClick={() => void saveWebDav()} disabled={webdavSaving || !webdavUrl.trim()}>
                {webdavSaving ? t("common.loading") : t("cloud.connect")}
              </button>
            </div>
          </div>
        )}

        {browsing && webdav?.connected && (
          <div className="cloud-browser">
            <div className="cloud-browser-bar">
              {currentPath && (
                <button type="button" className="cloud-browser-up" onClick={() => void goUp()}>
                  <ChevronLeft size={15} strokeWidth={1.5} /> {t("cloud.goUp")}
                </button>
              )}
              <span className="cloud-browser-path">{currentPath || t("cloud.webdavRoot")}</span>
            </div>
            <div className="cloud-browser-list">
              {entries.length === 0 ? (
                <div className="cloud-files-empty">{t("cloud.emptyDir")}</div>
              ) : (
                entries.map((e) => (
                  <button
                    key={e.path}
                    type="button"
                    className={`cloud-browser-item ${e.is_dir ? "is-dir" : ""}`}
                    onClick={() => void openEntry(e)}
                    disabled={!e.is_dir}
                  >
                    {e.is_dir ? <Folder size={16} strokeWidth={1.5} /> : <File size={16} strokeWidth={1.5} />}
                    <span>{e.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
