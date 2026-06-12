import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Download, FileText } from "lucide-react";
import { openPath, type SessionArtifact } from "../../services/tauri";
import { ideApi } from "../../services/tauri/ide";
import type { FileContent } from "../Pond/IDE/types";
import "./ArtifactPreview.css";

type PreviewKind = "web" | "image" | "pdf" | "markdown" | "text" | "unknown";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
const TEXT_EXT = [
  "txt", "log", "json", "yaml", "yml", "toml", "ini", "csv", "tsv",
  "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
  "css", "scss", "html", "xml", "sh", "bash", "sql", "rb", "php", "kt", "swift",
];

function isWebUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function extOf(value: string): string {
  const clean = value.split(/[?#]/)[0];
  const idx = clean.lastIndexOf(".");
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : "";
}

function classify(artifact: SessionArtifact): PreviewKind {
  const uri = artifact.uri || "";
  if (uri && isWebUri(uri)) return "web";
  const ext = extOf(uri || artifact.name || "");
  if (IMAGE_EXT.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (TEXT_EXT.includes(ext)) return "text";
  return "unknown";
}

export default function ArtifactPreview({ artifact }: { artifact: SessionArtifact }) {
  const { t } = useTranslation();
  const kind = classify(artifact);
  const uri = artifact.uri || "";
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if ((kind === "text" || kind === "markdown") && uri && !isWebUri(uri)) {
      setLoading(true);
      setError(null);
      ideApi
        .readFile(uri)
        .then((fc: FileContent) => {
          if (cancelled) return;
          if (fc.is_binary) {
            setText(null);
            setError(t("preview.binaryUnsupported"));
          } else {
            setText(fc.content);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(`${e}`);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setText(null);
    }
    return () => {
      cancelled = true;
    };
  }, [uri, kind, t]);

  const openExternal = () => {
    if (!uri) return;
    if (isWebUri(uri)) window.open(uri, "_blank");
    else void openPath(uri);
  };

  let body: JSX.Element;
  if (kind === "web") {
    body = <iframe className="artifact-preview-frame" src={uri} title={artifact.name} />;
  } else if (kind === "image") {
    body = (
      <div className="artifact-preview-image-wrap">
        <img className="artifact-preview-image" src={convertFileSrc(uri)} alt={artifact.name} />
      </div>
    );
  } else if (kind === "pdf") {
    body = <iframe className="artifact-preview-frame" src={convertFileSrc(uri)} title={artifact.name} />;
  } else if (kind === "markdown") {
    body = loading ? (
      <div className="artifact-preview-status">{t("common.loading")}</div>
    ) : error ? (
      <div className="artifact-preview-status artifact-preview-error">{error}</div>
    ) : (
      <div className="artifact-preview-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ""}</ReactMarkdown>
      </div>
    );
  } else if (kind === "text") {
    body = loading ? (
      <div className="artifact-preview-status">{t("common.loading")}</div>
    ) : error ? (
      <div className="artifact-preview-status artifact-preview-error">{error}</div>
    ) : (
      <pre className="artifact-preview-code">{text || ""}</pre>
    );
  } else {
    body = (
      <div className="artifact-preview-fallback">
        <FileText size={40} strokeWidth={1.2} />
        {artifact.content_summary && (
          <p className="artifact-preview-summary">{artifact.content_summary}</p>
        )}
        {uri && (
          <button type="button" className="btn btn-secondary" onClick={openExternal}>
            <ExternalLink size={14} strokeWidth={1.5} /> {t("preview.openExternal")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="artifact-preview">
      <div className="artifact-preview-toolbar">
        <span className="artifact-preview-name" title={uri || artifact.name}>
          {artifact.name}
        </span>
        {uri && (
          <button
            type="button"
            className="btn-icon"
            onClick={openExternal}
            title={isWebUri(uri) ? t("preview.openExternal") : t("preview.openInSystem")}
          >
            {isWebUri(uri) ? <ExternalLink size={15} strokeWidth={1.5} /> : <Download size={15} strokeWidth={1.5} />}
          </button>
        )}
      </div>
      <div className="artifact-preview-body">{body}</div>
    </div>
  );
}
