import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Eye } from "lucide-react";
import { ToolStep, PlanTodoItem } from "../../store";
import { openPath, type SessionArtifact } from "../../services/tauri";
import ArtifactPreview from "./ArtifactPreview";
import { uriToNativePath } from "../../utils/linkify";

const TOOL_ICONS: Record<string, string> = {
  shell: "💻", powershell: "💻", powershell_query: "💻",
  file_read: "📄", file_write: "📝",
  web_search: "🔍",
  web_fetch: "📰",
  browser: "🌐",
  screen_capture: "📸",
  uia: "🖱️",
  wmi: "🔧",
  com: "📋",
  office: "📊",
  plan_todo: "🗂️",
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? "⚙️";
}

function toolSummary(name: string, input: unknown): string {
  const i = input as Record<string, unknown>;
  if (!i) return name;
  if (name === "browser") {
    const parts = [i["action"]];
    if (i["url"]) parts.push(String(i["url"]).slice(0, 60));
    else if (i["selector"]) parts.push(String(i["selector"]).slice(0, 40));
    return parts.filter(Boolean).join(" → ");
  }
  if (name === "shell" || name === "powershell") return String(i["command"] ?? "").slice(0, 80);
  if (name === "file_read" || name === "file_write") return String(i["path"] ?? "").slice(0, 80);
  if (name === "web_search") return String(i["query"] ?? "").slice(0, 80);
  if (name === "web_fetch") return String(i["url"] ?? "").slice(0, 80);
  if (name === "screen_capture") return String(i["mode"] ?? "fullscreen");
  return Object.entries(i).slice(0, 2).map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(" ");
}

function planStatusLabel(t: ReturnType<typeof useTranslation>["t"], status: PlanTodoItem["status"]): string {
  switch (status) {
    case "pending":
      return t("chat.planPending");
    case "in_progress":
      return t("chat.planInProgress");
    case "completed":
      return t("chat.planCompleted");
    case "cancelled":
      return t("chat.planCancelled");
    default:
      return status;
  }
}

export function PlanPanel({ items }: { items: PlanTodoItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="plan-panel">
      {items.map((item, index) => (
        <div key={item.id} className={`plan-item plan-${item.status}`}>
          <div className="plan-item-left">
            <span className="plan-item-index">{index + 1}</span>
            <span className="plan-item-content">{item.content}</span>
          </div>
          <div className="plan-item-right">
            <span className="plan-item-id">{item.id}</span>
            <span className={`plan-item-status plan-status-${item.status}`}>
              {item.status === "in_progress" && <span className="step-spinner" style={{ width: 10, height: 10, marginRight: 4 }} />}
              {planStatusLabel(t, item.status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function artifactIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "image":
      return "IMG";
    case "link":
    case "url":
      return "URL";
    case "report":
      return "RPT";
    case "document":
      return "DOC";
    default:
      return "FILE";
  }
}

function formatArtifactTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isWebUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toOpenableLocalPath(value: string): string {
  return value.startsWith("file://") ? uriToNativePath(value) : value;
}

export function ArtifactsPanel({
  artifacts,
  onPreview,
}: {
  artifacts: SessionArtifact[];
  onPreview?: (artifact: SessionArtifact) => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = !onPreview && selectedId ? artifacts.find((a) => a.id === selectedId) ?? null : null;

  if (selected) {
    return (
      <div className="artifacts-panel artifacts-panel-preview">
        <button type="button" className="artifacts-back" onClick={() => setSelectedId(null)}>
          <ChevronLeft size={15} strokeWidth={1.5} /> {t("preview.backToList")}
        </button>
        <div className="artifacts-preview-host">
          <ArtifactPreview artifact={selected} />
        </div>
      </div>
    );
  }

  return (
    <div className="artifacts-panel">
      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="artifact-card artifact-card-clickable"
          role="button"
          tabIndex={0}
          onClick={() => (onPreview ? onPreview(artifact) : setSelectedId(artifact.id))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (onPreview) onPreview(artifact);
              else setSelectedId(artifact.id);
            }
          }}
        >
          <div className="artifact-icon" aria-hidden="true">{artifactIcon(artifact.artifact_type)}</div>
          <div className="artifact-main">
            <div className="artifact-title-row">
              <span className="artifact-title">{artifact.name}</span>
              <span className="artifact-type">{artifact.artifact_type}</span>
            </div>
            {artifact.content_summary && (
              <div className="artifact-summary">{artifact.content_summary}</div>
            )}
            {artifact.uri && (
              isWebUri(artifact.uri) ? (
                <a className="artifact-uri" href={artifact.uri} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {artifact.uri}
                </a>
              ) : (
                <button className="artifact-uri artifact-uri-button" onClick={(e) => { e.stopPropagation(); openPath(toOpenableLocalPath(artifact.uri!)); }}>
                  {artifact.uri}
                </button>
              )
            )}
            <div className="artifact-meta">
              {artifact.source_tool && <span>{artifact.source_tool}</span>}
              <span>{formatArtifactTime(artifact.created_at)}</span>
              <span className="artifact-preview-hint"><Eye size={12} strokeWidth={1.5} /> {t("preview.preview")}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FishProgressBadge({ progress }: { progress: NonNullable<ToolStep["fishProgress"]> }) {
  const { t } = useTranslation();
  const statusLabel: Record<string, string> = {
    thinking: t("chat.fishProgressThinking"),
    thinking_text: t("chat.fishProgressThinking"),
    tool_call: t("chat.fishProgressToolCall"),
    tool_done: t("chat.fishProgressToolDone"),
    done: t("chat.fishProgressDone"),
  };
  const label = statusLabel[progress.status] ?? progress.status;
  const isRunning = progress.status !== "done";
  const showThinking = isRunning && progress.thinkingText;

  return (
    <div className="fish-progress-badge">
      <span className="fish-progress-icon">🐠</span>
      <span className="fish-progress-name">{progress.fishName}</span>
      {progress.iteration > 0 && (
        <span className="fish-progress-iter">{t("chat.fishProgressStep", { n: progress.iteration })}</span>
      )}
      {progress.toolName && (
        <span className="fish-progress-tool">{progress.toolName}</span>
      )}
      <span className={`fish-progress-status ${isRunning ? "fish-status-running" : "fish-status-done"}`}>
        {isRunning && <span className="step-spinner" style={{ width: 10, height: 10, marginRight: 4 }} />}
        {label}
      </span>
      {showThinking && (
        <span className="fish-progress-thinking">{progress.thinkingText}</span>
      )}
    </div>
  );
}

export function ToolStepCard({ step, onToggle }: { step: ToolStep; onToggle: () => void }) {
  const { t } = useTranslation();
  const maxResultLen = 400;
  const result = step.result ?? "";
  const truncated = result.length > maxResultLen;
  const [showFull, setShowFull] = useState(false);

  const statusClass = !step.completed
    ? "step-running"
    : step.isError
    ? "step-error"
    : "step-ok";

  const statusIcon = !step.completed ? (
    <span className="step-spinner" aria-label="running" />
  ) : step.isError ? (
    <span className="step-status-icon">✕</span>
  ) : (
    <span className="step-status-icon">✓</span>
  );

  return (
    <div className={`tool-step-card ${statusClass}`}>
      <button className="tool-step-header" onClick={onToggle} aria-expanded={step.expanded}>
        <span className="tool-step-icon">{toolIcon(step.name)}</span>
        <span className="tool-step-name">{step.name}</span>
        <span className="tool-step-summary">{toolSummary(step.name, step.input)}</span>
        <span className={`tool-step-status ${statusClass}`}>{statusIcon}</span>
        <span className="tool-step-chevron">{step.expanded ? "▲" : "▼"}</span>
      </button>

      {step.fishProgress && step.fishProgress.status !== "done" && (
        <FishProgressBadge progress={step.fishProgress} />
      )}

      {step.expanded && (
        <div className="tool-step-body">
          {step.fishProgress && (
            <div className="tool-step-section">
              <span className="tool-step-section-label">🐠 {t("chat.fishProgressSection")}</span>
              <FishProgressBadge progress={step.fishProgress} />
            </div>
          )}
          <div className="tool-step-section">
            <span className="tool-step-section-label">{t("chat.toolStepInput")}</span>
            <pre className="tool-step-pre">
              {typeof step.input === "string"
                ? step.input
                : JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          {step.completed && (
            <div className="tool-step-section">
              <span className={`tool-step-section-label ${step.isError ? "label-error" : ""}`}>
                {step.isError ? t("chat.toolStepError") : t("chat.toolStepOutput")}
              </span>
              <pre className={`tool-step-pre ${step.isError ? "pre-error" : ""}`}>
                {showFull || !truncated ? result : result.slice(0, maxResultLen) + "…"}
              </pre>
              {truncated && (
                <button
                  className="tool-step-show-more"
                  onClick={(e) => { e.stopPropagation(); setShowFull(!showFull); }}
                >
                  {showFull
                    ? t("chat.toolStepCollapse")
                    : t("chat.toolStepExpand", { count: result.length })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
