import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { ArrowLeft, ArrowRight, RotateCw, Home, ExternalLink } from "lucide-react";
import { getCloudBaseUrl, setCloudBaseUrl, normalizeUrl } from "../../config/cloud";
import "./CloudBrowser.css";

type CloudBrowserProps = {
  visible?: boolean;
  targetUrl?: string | null;
  requestKey?: number;
  mobilePreview?: boolean;
};

export default function CloudBrowser({ visible = true, targetUrl = null, requestKey = 0, mobilePreview = false }: CloudBrowserProps) {
  const { t } = useTranslation();
  const defaultHomeUrl = getCloudBaseUrl();
  const startUrl = normalizeUrl(targetUrl || defaultHomeUrl) || defaultHomeUrl;

  // History stack for in-app back/forward (iframe cross-origin history is not accessible).
  const [history, setHistory] = useState<string[]>([startUrl]);
  const [cursor, setCursor] = useState(0);
  const [address, setAddress] = useState(startUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  const blockedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [maybeBlocked, setMaybeBlocked] = useState(false);

  const current = history[cursor] ?? startUrl;

  const resetToUrl = useCallback((rawUrl: string) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    setHistory([url]);
    setCursor(0);
    setAddress(url);
    setReloadKey((key) => key + 1);
  }, []);

  const navigate = useCallback(
    (rawUrl: string) => {
      const url = normalizeUrl(rawUrl);
      if (!url) return;
      setHistory((prev) => {
        const next = prev.slice(0, cursor + 1);
        next.push(url);
        return next;
      });
      setCursor((c) => c + 1);
      setAddress(url);
    },
    [cursor],
  );

  const goBack = () => {
    if (cursor > 0) {
      const c = cursor - 1;
      setCursor(c);
      setAddress(history[c]);
    }
  };

  const goForward = () => {
    if (cursor < history.length - 1) {
      const c = cursor + 1;
      setCursor(c);
      setAddress(history[c]);
    }
  };

  const goHome = () => {
    resetToUrl(targetUrl || getCloudBaseUrl());
  };

  const reload = () => setReloadKey((k) => k + 1);

  const submitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(address);
    if (!url) return;
    // Persist as the new default cloud base when it looks like a homepage edit.
    if (!targetUrl && cursor === 0) setCloudBaseUrl(url);
    navigate(url);
  };

  useEffect(() => {
    if (!visible) return;
    resetToUrl(targetUrl || getCloudBaseUrl());
  }, [requestKey, targetUrl, visible, resetToUrl]);

  // Detect likely X-Frame-Options / CSP blocking: if the iframe never fires
  // onLoad within a few seconds, surface the "open externally" fallback.
  useEffect(() => {
    loadedRef.current = false;
    setMaybeBlocked(false);
    if (blockedTimer.current) clearTimeout(blockedTimer.current);
    blockedTimer.current = setTimeout(() => {
      if (!loadedRef.current) setMaybeBlocked(true);
    }, 4000);
    return () => {
      if (blockedTimer.current) clearTimeout(blockedTimer.current);
    };
  }, [current, reloadKey]);

  if (!visible) return null;

  return (
    <div className={`cloud-browser${mobilePreview ? " cloud-browser-mobile-preview" : ""}`}>
      <div className="cloud-browser-bar">
        <button type="button" className="cloud-browser-btn" onClick={goBack} disabled={cursor <= 0} title={t("browser.back")}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <button type="button" className="cloud-browser-btn" onClick={goForward} disabled={cursor >= history.length - 1} title={t("browser.forward")}>
          <ArrowRight size={16} strokeWidth={1.5} />
        </button>
        <button type="button" className="cloud-browser-btn" onClick={reload} title={t("browser.reload")}>
          <RotateCw size={15} strokeWidth={1.5} />
        </button>
        <button type="button" className="cloud-browser-btn" onClick={goHome} title={t("browser.home")}>
          <Home size={16} strokeWidth={1.5} />
        </button>
        <form onSubmit={submitAddress} style={{ flex: 1, display: "flex" }}>
          <input
            className="cloud-browser-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            placeholder={t("browser.addressPlaceholder")}
          />
        </form>
        <button type="button" className="cloud-browser-btn" onClick={() => openExternal(current).catch(() => {})} title={t("browser.openExternal")}>
          <ExternalLink size={15} strokeWidth={1.5} />
        </button>
      </div>
      <div className="cloud-browser-stage">
        <div className="cloud-browser-viewport">
          <iframe
            key={`${current}::${reloadKey}`}
            className="cloud-browser-frame"
            src={current}
            title={t("nav.browser")}
            onLoad={() => {
              loadedRef.current = true;
              setMaybeBlocked(false);
            }}
            referrerPolicy="no-referrer-when-downgrade"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
          {maybeBlocked && (
            <div className="cloud-browser-blocked">
              <p>{t("browser.blockedHint")}</p>
              <button type="button" className="btn btn-primary" onClick={() => openExternal(current).catch(() => {})}>
                <ExternalLink size={14} strokeWidth={1.5} /> {t("browser.openExternal")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
