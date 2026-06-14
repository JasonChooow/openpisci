import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RefreshCw, FolderOpen } from "lucide-react";
import type { RootState } from "../../store";
import { artifactsApi, type SessionArtifact } from "../../services/tauri";
import { classifyMainChatSession, isInternalSession } from "../../utils/session";
import { parseUtcTimestamp } from "../../utils/parseTimestamp";
import RoundedSearch from "../ui/RoundedSearch";
import ArtifactPreview from "../Chat/ArtifactPreview";
import "./MyFiles.css";

type AggregatedArtifact = SessionArtifact & {
  sourceTitle: string;
};

function artifactIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "image": return "IMG";
    case "link":
    case "url": return "URL";
    case "report": return "RPT";
    case "document": return "DOC";
    default: return "FILE";
  }
}

export default function MyFiles({ visible = true }: { visible?: boolean }) {
  const { t } = useTranslation();
  const sessions = useSelector((s: RootState) => s.sessions.sessions);
  const poolSessions = useSelector((s: RootState) => s.pool.sessions);

  const [items, setItems] = useState<AggregatedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<AggregatedArtifact | null>(null);

  const sources = useMemo(() => {
    const map = new Map<string, string>();
    sessions
      .filter((s) => !isInternalSession(s) && classifyMainChatSession(s) === "chat")
      .forEach((s) => map.set(s.id, s.title?.trim() || t("chat.newChat")));
    poolSessions.forEach((p) => map.set(p.id, p.name?.trim() || p.id));
    return map;
  }, [sessions, poolSessions, t]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const artifacts = await artifactsApi.listAll(500);
      const merged: AggregatedArtifact[] = artifacts.map((a) => ({
        ...a,
        sourceTitle: sources.get(a.session_id) || a.session_id,
      }));
      setItems(merged);
    } catch {
      // Fallback when running in web preview or older backend without list_all_artifacts.
      const ids = Array.from(sources.keys());
      if (ids.length === 0) {
        setItems([]);
        return;
      }
      const results = await Promise.allSettled(ids.map((id) => artifactsApi.list(id, 200)));
      const merged: AggregatedArtifact[] = [];
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          const title = sources.get(ids[i]) || ids[i];
          res.value.forEach((a) => merged.push({ ...a, sourceTitle: title }));
        }
      });
      merged.sort(
        (a, b) => parseUtcTimestamp(b.created_at) - parseUtcTimestamp(a.created_at),
      );
      setItems(merged);
    } finally {
      setLoading(false);
    }
  }, [sources]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const types = useMemo(() => {
    const set = new Set<string>();
    items.forEach((a) => set.add(a.artifact_type));
    return ["all", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (typeFilter !== "all" && a.artifact_type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.uri || "").toLowerCase().includes(q) ||
        a.sourceTitle.toLowerCase().includes(q)
      );
    });
  }, [items, query, typeFilter]);

  return (
    <div className="myfiles">
      <div className="feature-topbar">
        <h1 className="feature-topbar-title">
          <FolderOpen size={20} strokeWidth={1.5} />
          {t("nav.myFiles")}
        </h1>
        <button
          type="button"
          className="btn-icon"
          onClick={() => void refresh()}
          title={t("common.refresh")}
          disabled={loading}
        >
          <RefreshCw size={16} strokeWidth={1.5} className={loading ? "spin" : ""} />
        </button>
      </div>

      {selected ? (
        <div className="myfiles-preview">
          <button type="button" className="artifacts-back" onClick={() => setSelected(null)}>
            <ChevronLeft size={15} strokeWidth={1.5} /> {t("preview.backToList")}
          </button>
          <div className="myfiles-preview-host">
            <ArtifactPreview artifact={selected} />
          </div>
        </div>
      ) : (
        <div className="myfiles-body">
          <div className="myfiles-controls">
            <RoundedSearch value={query} onChange={setQuery} placeholder={t("myFiles.search")} size="sm" />
            <div className="myfiles-types">
              {types.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  className={`myfiles-type-chip ${typeFilter === tp ? "active" : ""}`}
                  onClick={() => setTypeFilter(tp)}
                >
                  {tp === "all" ? t("myFiles.allTypes") : tp}
                </button>
              ))}
            </div>
          </div>

          {loading && items.length === 0 ? (
            <div className="myfiles-empty">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="myfiles-empty">{t("myFiles.empty")}</div>
          ) : (
            <div className="myfiles-grid">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="myfiles-card"
                  onClick={() => setSelected(a)}
                  title={a.uri || a.name}
                >
                  <span className="myfiles-card-icon">{artifactIcon(a.artifact_type)}</span>
                  <span className="myfiles-card-name">{a.name}</span>
                  <span className="myfiles-card-source">{a.sourceTitle}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
