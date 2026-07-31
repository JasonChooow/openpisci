import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import hljs from "highlight.js";
import { ExternalLink, Download, FileText } from "lucide-react";
import { openPath, type SessionArtifact } from "../../services/tauri";
import { ideApi } from "../../services/tauri/ide";
import type { FileContent } from "../Pond/IDE/types";
import { uriToNativePath } from "../../utils/linkify";
import "highlight.js/styles/github-dark.min.css";
import "./ArtifactPreview.css";

type PreviewKind = "web" | "image" | "pdf" | "markdown" | "code" | "html" | "unknown";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
const CODE_EXT = [
  "txt", "log", "json", "yaml", "yml", "toml", "ini", "csv", "tsv",
  "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
  "css", "scss", "xml", "sh", "bash", "sql", "rb", "php", "kt", "swift",
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
  const ext = extOf(uri || artifact.name || "");
  if (ext === "html" || ext === "htm") return "html";
  if (uri && isWebUri(uri)) return "web";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (CODE_EXT.includes(ext)) return "code";
  return "unknown";
}

function highlightCode(text: string, ext: string): string {
  const lang = ext && hljs.getLanguage(ext) ? ext : undefined;
  if (lang) {
    return hljs.highlight(text, { language: lang }).value;
  }
  return hljs.highlightAuto(text).value;
}

export default function ArtifactPreview({
  artifact,
  hideToolbar = false,
}: {
  artifact: SessionArtifact;
  hideToolbar?: boolean;
}) {
  const { t } = useTranslation();
  const kind = classify(artifact);
  const uri = artifact.uri || "";
  const localUri = uri && !isWebUri(uri) && uri.startsWith("file://") ? uriToNativePath(uri) : uri;
  const ext = extOf(uri || artifact.name || "");
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsFileContent = kind === "markdown" || kind === "code" || kind === "html";

  useEffect(() => {
    let cancelled = false;
    if (needsFileContent && localUri && !isWebUri(localUri)) {
      setLoading(true);
      setError(null);
      ideApi
        .readFile(localUri)
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
      setError(null);
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [localUri, kind, needsFileContent, t]);

  const highlightedCode = useMemo(() => {
    if (kind !== "code" || !text) return null;
    try {
      return highlightCode(text, ext);
    } catch {
      return null;
    }
  }, [kind, text, ext]);

  const openExternal = () => {
    if (!uri) return;
    if (isWebUri(uri)) window.open(uri, "_blank");
    else void openPath(localUri);
  };

  let body: JSX.Element;
  if (kind === "web") {
    body = <iframe className="artifact-preview-frame" src={uri} title={artifact.name} />;
  } else if (kind === "image") {
    body = (
      <div className="artifact-preview-image-wrap">
        <img className="artifact-preview-image" src={convertFileSrc(localUri)} alt={artifact.name} />
      </div>
    );
  } else if (kind === "pdf") {
    body = <iframe className="artifact-preview-frame" src={convertFileSrc(localUri)} title={artifact.name} />;
  } else if (kind === "html") {
    body = loading ? (
      <div className="artifact-preview-status">{t("common.loading")}</div>
    ) : error ? (
      <div className="artifact-preview-status artifact-preview-error">{error}</div>
    ) : (
      <iframe
        className="artifact-preview-frame"
        sandbox=""
        srcDoc={text || ""}
        title={artifact.name}
      />
    );
  } else if (kind === "markdown") {
    body = loading ? (
      <div className="artifact-preview-status">{t("common.loading")}</div>
    ) : error ? (
      <div className="artifact-preview-status artifact-preview-error">{error}</div>
    ) : (
      <div className="artifact-preview-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {text || ""}
        </ReactMarkdown>
      </div>
    );
  } else if (kind === "code") {
    body = loading ? (
      <div className="artifact-preview-status">{t("common.loading")}</div>
    ) : error ? (
      <div className="artifact-preview-status artifact-preview-error">{error}</div>
    ) : highlightedCode ? (
      <pre className="artifact-preview-code">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
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
        {uri && isWebUri(uri) ? (
          <a className="btn btn-secondary artifact-preview-link" href={uri} target="_blank" rel="noreferrer">
            <ExternalLink size={14} strokeWidth={1.5} /> {t("preview.openExternal")}
          </a>
        ) : uri ? (
          <button type="button" className="btn btn-secondary" onClick={openExternal}>
            <ExternalLink size={14} strokeWidth={1.5} /> {t("preview.openInSystem")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="artifact-preview">
      {!hideToolbar && (
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
      )}
      <div className="artifact-preview-body">{body}</div>
    </div>
  );
}
