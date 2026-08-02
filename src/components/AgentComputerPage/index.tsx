import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  ExternalLink,
  Link2,
  Loader2,
  MonitorCloud,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { agentosApi } from "../../services/tauri/platform";
import "./AgentComputerPage.css";

type Phase = "loading" | "bind" | "ready";

export default function AgentComputerPage() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [account, setAccount] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handoff = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      const result = await agentosApi.handoff();
      if (!mounted.current) return;
      setFrameUrl(result.url);
      setAccount(result.externalUsername ?? "");
      setPhase("ready");
    } catch (e) {
      if (!mounted.current) return;
      const message = String(e);
      if (message.includes("REBIND_REQUIRED")) {
        setError(t("agentComputer.rebindRequired"));
      } else if (message.includes("NOT_BOUND")) {
        setError(null);
      } else {
        setError(message);
      }
      setPhase("bind");
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await agentosApi.status();
        if (!mounted.current) return;
        if (status.bound) {
          await handoff();
        } else {
          setPhase("bind");
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(String(e));
        setPhase("bind");
      }
    })();
  }, [handoff]);

  const submitBind = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const status = await agentosApi.bind(username.trim(), password);
      if (status.bound) {
        setPassword("");
        setAccount(status.externalUsername ?? username.trim());
        await handoff();
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const unbind = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await agentosApi.unbind();
      if (!mounted.current) return;
      setFrameUrl(null);
      setAccount("");
      setPhase("bind");
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const openExternalUrl = () => {
    if (frameUrl) openExternal(frameUrl).catch(() => {});
  };

  if (phase === "bind") {
    return (
      <div className="agent-pc agent-pc-center">
        <div className="agent-pc-bind-card">
          <div className="agent-pc-bind-icon">
            <MonitorCloud size={30} strokeWidth={1.4} />
          </div>
          <h2 className="agent-pc-bind-title">{t("agentComputer.bindTitle")}</h2>
          <p className="agent-pc-bind-desc">{t("agentComputer.bindDesc")}</p>
          <form className="agent-pc-bind-form" onSubmit={submitBind}>
            <input
              type="text"
              autoComplete="username"
              placeholder={t("agentComputer.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t("agentComputer.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <div className="agent-pc-error">{error}</div>}
            <button type="submit" disabled={busy || !username.trim() || !password}>
              {busy ? (
                <Loader2 size={15} className="agent-pc-spin" />
              ) : (
                <Link2 size={15} />
              )}
              {t("agentComputer.bindButton")}
            </button>
          </form>
          <p className="agent-pc-bind-note">
            <ShieldCheck size={13} />
            {t("agentComputer.bindNote")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-pc">
      <div className="agent-pc-bar">
        <div className="agent-pc-bar-left">
          <MonitorCloud size={16} strokeWidth={1.6} />
          <span className="agent-pc-bar-title">{t("nav.agentComputer")}</span>
          {account && <span className="agent-pc-bar-account">{account}</span>}
        </div>
        <div className="agent-pc-bar-actions">
          <button type="button" onClick={() => void handoff()} title={t("agentComputer.refresh")}>
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={openExternalUrl} title={t("agentComputer.openExternal")}>
            <ExternalLink size={14} />
          </button>
          <button type="button" onClick={() => void unbind()} title={t("agentComputer.unbind")}>
            <Unlink size={14} />
          </button>
        </div>
      </div>
      {phase === "loading" || !frameUrl ? (
        <div className="agent-pc-center agent-pc-loading">
          <Loader2 size={26} className="agent-pc-spin" />
          <span>{t("agentComputer.entering")}</span>
        </div>
      ) : (
        <iframe
          key={frameUrl}
          className="agent-pc-frame"
          src={frameUrl}
          title={t("nav.agentComputer")}
        />
      )}
    </div>
  );
}
