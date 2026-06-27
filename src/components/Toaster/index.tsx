/**
 * Toaster — Main-window toast host.
 *
 * Listens for backend `piscis_toast` events (emitted by `app_control.notify_user`
 * and by heartbeat safety nets for `EscalateToHuman` states) and stacks them in
 * the top-right of the main window.
 *
 * Levels:
 *   info     — default, soft neutral
 *   warning  — amber
 *   error    — red
 *   critical — red + persistent (duration_ms=0) until the user dismisses
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import i18n from "../../i18n";
import { store } from "../../store";
import "./Toaster.css";

type ToastLevel = "info" | "warning" | "error" | "critical";

interface ToastPayload {
  id: string;
  title?: string;
  message: string;
  level?: ToastLevel;
  pool_id?: string;
  pool_name?: string;
  duration_ms?: number;
  source?: string;
  ts?: number;
}

interface Toast {
  id: string;
  title: string;
  message: string;
  level: ToastLevel;
  teamTaskLabel?: string;
  durationMs: number;
}

const LEVEL_ICONS: Record<ToastLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  critical: "🚨",
};

function normalizeLevel(raw?: string): ToastLevel {
  switch (raw) {
    case "warning":
    case "warn":
      return "warning";
    case "error":
      return "error";
    case "critical":
      return "critical";
    default:
      return "info";
  }
}

function resolveTeamTaskName(poolId?: string, poolName?: string): string | undefined {
  const fromPayload = poolName?.trim();
  if (fromPayload) return fromPayload;
  if (!poolId) return undefined;

  const state = store.getState();
  const pool = state.pool.sessions.find((p) => p.id === poolId);
  if (pool?.name?.trim()) return pool.name.trim();

  const session = state.sessions.sessions.find((s) => s.pool_session_id === poolId);
  if (session?.title?.trim()) return session.title.trim();

  return undefined;
}

function buildToastFromPayload(p: ToastPayload): Omit<Toast, "id" | "durationMs"> {
  const t = i18n.t.bind(i18n);
  const level = normalizeLevel(p.level);
  const teamName = resolveTeamTaskName(p.pool_id, p.pool_name);

  let title = p.title?.trim() || t("app.defaultToastTitle");
  let teamTaskLabel: string | undefined;

  if (p.source === "heartbeat_auto" && teamName) {
    title = t("app.toastHumanDecision", { name: teamName });
  } else if (teamName) {
    teamTaskLabel = t("app.toastTeamTask", { name: teamName });
  } else if (p.pool_id) {
    teamTaskLabel = p.pool_id;
  }

  return {
    title,
    message: p.message,
    level,
    teamTaskLabel,
  };
}

export default function Toaster() {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<ToastPayload>("piscis_toast", (event) => {
      const p = event.payload;
      if (!p || !p.message) return;
      const level = normalizeLevel(p.level);
      const defaultDuration =
        level === "critical" ? 0 :
        level === "error"    ? 12000 :
        level === "warning"  ? 8000  : 5000;
      const durationMs =
        typeof p.duration_ms === "number" ? p.duration_ms : defaultDuration;

      const toast: Toast = {
        id: p.id || `toast_${Date.now()}_${Math.random()}`,
        durationMs,
        ...buildToastFromPayload(p),
      };

      setToasts((prev) => {
        const filtered = prev.filter((item) => item.id !== toast.id);
        const trimmed = filtered.slice(-4);
        return [...trimmed, toast];
      });

      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== toast.id));
        }, durationMs);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="piscis-toaster" role="region" aria-label="9X bot notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`piscis-toast piscis-toast-${toast.level}`}
          role={toast.level === "critical" || toast.level === "error" ? "alert" : "status"}
        >
          <div className="piscis-toast-icon">{LEVEL_ICONS[toast.level]}</div>
          <div className="piscis-toast-body">
            <div className="piscis-toast-title">{toast.title}</div>
            <div className="piscis-toast-message">{toast.message}</div>
            {toast.teamTaskLabel && (
              <div className="piscis-toast-meta">{toast.teamTaskLabel}</div>
            )}
          </div>
          <button
            className="piscis-toast-close"
            onClick={() => dismiss(toast.id)}
            aria-label={t("app.toastDismiss")}
            title={t("app.toastDismiss")}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
