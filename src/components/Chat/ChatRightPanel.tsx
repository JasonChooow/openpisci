import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Download, ExternalLink, GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openPath, type SessionArtifact } from "../../services/tauri";
import ArtifactPreview from "./ArtifactPreview";

interface ChatRightPanelProps {
  artifact: SessionArtifact | null;
  onClose: () => void;
}

function isWebUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const PANEL_WIDTH_KEY = "9xbot-preview-panel-width";
const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 900;

function clampPanelWidth(width: number): number {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function readInitialPanelWidth(): number {
  if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  return Number.isFinite(saved) ? clampPanelWidth(saved) : DEFAULT_PANEL_WIDTH;
}

export default function ChatRightPanel({ artifact, onClose }: ChatRightPanelProps) {
  const { t } = useTranslation();
  const uri = artifact?.uri || "";
  const title = artifact?.name ?? t("preview.preview");
  const [panelWidth, setPanelWidth] = useState(readInitialPanelWidth);
  const [fullscreen, setFullscreen] = useState(false);
  const resizeRef = useRef({ startX: 0, startWidth: DEFAULT_PANEL_WIDTH });

  useEffect(() => {
    if (!fullscreen) {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    }
  }, [panelWidth, fullscreen]);

  const openExternal = () => {
    if (!uri) return;
    if (isWebUri(uri)) window.open(uri, "_blank");
    else void openPath(uri);
  };

  const startResize = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (fullscreen) return;
    resizeRef.current = { startX: event.clientX, startWidth: panelWidth };
    document.body.classList.add("chat-preview-resizing");

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = resizeRef.current.startWidth + (resizeRef.current.startX - moveEvent.clientX);
      setPanelWidth(clampPanelWidth(nextWidth));
    };
    const onUp = () => {
      document.body.classList.remove("chat-preview-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <aside
      className={`chat-right-panel${fullscreen ? " fullscreen" : ""}`}
      style={fullscreen ? undefined : { width: panelWidth }}
    >
      {!fullscreen && (
        <button
          type="button"
          className="chat-right-panel-resize"
          onMouseDown={startResize}
          title={t("preview.resizePanel", { defaultValue: "拖拽调整预览区宽度" })}
          aria-label={t("preview.resizePanel", { defaultValue: "拖拽调整预览区宽度" })}
        >
          <GripVertical size={14} strokeWidth={1.5} />
        </button>
      )}
      <div className="chat-right-panel-header">
        <span className="chat-right-panel-title" title={title}>
          {title}
        </span>
        <div className="chat-right-panel-header-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setFullscreen((value) => !value)}
            title={
              fullscreen
                ? t("preview.exitFullscreen", { defaultValue: "退出全屏" })
                : t("preview.fullscreen", { defaultValue: "全屏预览" })
            }
          >
            {fullscreen ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
          </button>
          {artifact && uri && (
            <button
              type="button"
              className="btn-icon"
              onClick={openExternal}
              title={isWebUri(uri) ? t("preview.openExternal") : t("preview.openInSystem")}
            >
              {isWebUri(uri) ? <ExternalLink size={16} strokeWidth={1.5} /> : <Download size={16} strokeWidth={1.5} />}
            </button>
          )}
          <button type="button" className="btn-icon" onClick={onClose} title={t("common.close")}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="chat-right-panel-body">
        {artifact ? (
          <ArtifactPreview artifact={artifact} hideToolbar />
        ) : (
          <div className="chat-right-panel-empty">{t("preview.preview")}</div>
        )}
      </div>
    </aside>
  );
}
