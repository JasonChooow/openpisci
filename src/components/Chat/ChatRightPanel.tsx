import { Download, ExternalLink, X } from "lucide-react";
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

export default function ChatRightPanel({ artifact, onClose }: ChatRightPanelProps) {
  const { t } = useTranslation();
  const uri = artifact?.uri || "";
  const title = artifact?.name ?? t("preview.preview");

  const openExternal = () => {
    if (!uri) return;
    if (isWebUri(uri)) window.open(uri, "_blank");
    else void openPath(uri);
  };

  return (
    <aside className="chat-right-panel">
      <div className="chat-right-panel-header">
        <span className="chat-right-panel-title" title={title}>
          {title}
        </span>
        <div className="chat-right-panel-header-actions">
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
