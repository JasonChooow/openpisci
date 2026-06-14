import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import type { KoiWithStats, PoolSession } from "../../services/tauri";
import { poolApi } from "../../services/tauri";
import { ideApi, onFileChanged } from "../../services/tauri/ide";
import type { FileNode } from "./IDE/types";
import { RootState } from "../../store";
import PoolMemberPicker from "./PoolMemberPicker";
import "../Chat/Chat.css";
import "./IDE/IDE.css";

const STATUS_COLORS: Record<string, string> = {
  idle: "#6b7280",
  busy: "#22c55e",
  offline: "#6b7280",
};

function absProjectPath(projectDir: string, relativePath: string): string {
  const root = projectDir.replace(/[/\\]+$/, "");
  const rel = relativePath.replace(/^[/\\]+/, "");
  if (!rel) return root;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${rel}`;
}

function FileTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onPreviewFile,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onPreviewFile: (absPath: string, name: string) => void;
}) {
  const isDir = node.is_dir;
  const isOpen = expanded.has(node.path);

  const handleClick = () => {
    if (isDir) onToggle(node.path);
  };

  const handleDoubleClick = () => {
    if (isDir) return;
    onPreviewFile(node.path, node.name);
  };

  return (
    <>
      <div
        className={`file-tree-item${isDir ? " dir" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={node.path}
        role="treeitem"
        aria-expanded={isDir ? isOpen : undefined}
      >
        <span className="icon" aria-hidden>
          {isDir ? (isOpen ? "📂" : "📁") : "📄"}
        </span>
        <span className="name">{node.name}</span>
      </div>
      {isDir && isOpen && node.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onPreviewFile={onPreviewFile}
        />
      ))}
    </>
  );
}

export function TeamProjectFilesPanel({
  projectDir,
  onPreviewFile,
}: {
  projectDir: string | null;
  onPreviewFile: (absPath: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const loadTree = useCallback(async () => {
    if (!projectDir) {
      setNodes([]);
      return;
    }
    setLoading(true);
    try {
      const tree = await ideApi.listFiles(projectDir, 8);
      setNodes(tree);
    } catch (e) {
      console.error("[TeamProjectFilesPanel] listFiles:", e);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [projectDir]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!projectDir) return;
    let unlisten: (() => void) | undefined;
    void onFileChanged((ev) => {
      if (ev.project_dir.replace(/[/\\]+$/, "") === projectDir.replace(/[/\\]+$/, "")) {
        void loadTree();
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [projectDir, loadTree]);

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handlePreview = useCallback(
    (relativePath: string, name: string) => {
      if (!projectDir) return;
      onPreviewFile(absProjectPath(projectDir, relativePath), name);
    },
    [projectDir, onPreviewFile],
  );

  if (!projectDir) {
    return <div className="chatpool-empty-hint">{t("ide.noProjectDir")}</div>;
  }

  return (
    <div className="team-project-files-panel">
      <div className="team-project-files-head">
        <span className="team-project-files-hint">{t("team.filesPreviewHint")}</span>
        <button
          type="button"
          className="team-project-files-refresh"
          onClick={() => void loadTree()}
          title={t("ide.refresh")}
          aria-label={t("ide.refresh")}
        >
          <RefreshCw size={14} strokeWidth={1.5} />
        </button>
      </div>
      {loading && nodes.length === 0 ? (
        <div className="team-project-files-empty">
          <span className="team-project-files-empty-text">{t("common.loading")}</span>
        </div>
      ) : nodes.length === 0 ? (
        <div className="team-project-files-empty">
          <FolderOpen size={28} strokeWidth={1.25} className="team-project-files-empty-icon" aria-hidden />
          <p className="team-project-files-empty-title">{t("team.filesEmpty")}</p>
          <p className="team-project-files-empty-sub">{t("team.filesEmptyHint")}</p>
        </div>
      ) : (
        <div className="file-tree-root team-project-file-tree" role="tree">
          {nodes.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggleDir}
              onPreviewFile={handlePreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MembersPanel({
  sessionId,
  activeSession,
  onNavigateToSchoolKoi,
}: {
  sessionId: string;
  activeSession: PoolSession | undefined;
  onNavigateToSchoolKoi?: () => void;
}) {
  const { t } = useTranslation();
  const kois = useSelector((s: RootState) => s.koi.kois);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberError, setMemberError] = useState("");

  const poolMembers = useMemo(() => {
    const ids = new Set(activeSession?.member_koi_ids ?? []);
    return kois.filter((k) => ids.has(k.id));
  }, [kois, activeSession]);

  const handleRemoveMember = useCallback(async (koiId: string) => {
    setMemberError("");
    try {
      await poolApi.removeMember(sessionId, koiId);
    } catch (e) {
      setMemberError(String(e));
    }
  }, [sessionId]);

  return (
    <>
      <div className="team-members-panel">
        <div className="team-members-toolbar">
          <span className="team-members-title">{t("pool.participants")}</span>
          <button
            type="button"
            className="collab-icon-btn"
            title={t("pool.memberPickerTitle")}
            onClick={() => setMemberPickerOpen(true)}
          >
            +
          </button>
        </div>
        <div className="chatpool-orgspec-body chatpool-participants-body">
          <div className="chatpool-participant">
            <span className="chatpool-participant-icon">🐋</span>
            <span className="chatpool-participant-name">小诺</span>
            <span className="chatpool-participant-badge" title={t("pool.actAsPiscisRole")}>
              {t("pool.mainAgent")}
            </span>
          </div>
          {poolMembers.map((koi) => (
            <MemberRow key={koi.id} koi={koi} onRemove={() => handleRemoveMember(koi.id)} t={t} />
          ))}
          {poolMembers.length === 0 && (
            <div className="chatpool-empty-hint">{t("pool.noMembersHint")}</div>
          )}
          {memberError && <div className="chatpool-participant-error">{memberError}</div>}
        </div>
      </div>

      {memberPickerOpen && (
        <PoolMemberPicker
          poolId={sessionId}
          memberKoiIds={activeSession?.member_koi_ids ?? []}
          onClose={() => setMemberPickerOpen(false)}
          onManageKois={() => {
            setMemberPickerOpen(false);
            onNavigateToSchoolKoi?.();
          }}
        />
      )}
    </>
  );
}

function MemberRow({
  koi,
  onRemove,
  t,
}: {
  koi: KoiWithStats;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="chatpool-participant">
      <span className="chatpool-participant-icon">{koi.icon}</span>
      <span className="chatpool-participant-name" style={{ color: koi.color }}>
        {koi.name}
      </span>
      <span
        className="chatpool-participant-dot"
        style={{ background: STATUS_COLORS[koi.status] || "#6b7280" }}
      />
      {koi.active_todo_count > 0 && (
        <span className="chatpool-participant-todos">{koi.active_todo_count}</span>
      )}
      <button
        type="button"
        className="chatpool-participant-remove"
        title={t("pool.removeMember")}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

export function OrgSpecPanel({
  sessionId,
  activeSession,
  onSaved,
}: {
  sessionId: string;
  activeSession: PoolSession | undefined;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [orgSpecDraft, setOrgSpecDraft] = useState("");
  const [sessionTaskTimeoutSecs, setSessionTaskTimeoutSecs] = useState(0);
  const [orgSpecSaving, setOrgSpecSaving] = useState(false);

  useEffect(() => {
    if (activeSession) {
      setOrgSpecDraft(activeSession.org_spec || "");
      setSessionTaskTimeoutSecs(activeSession.task_timeout_secs ?? 0);
    }
  }, [activeSession]);

  const handleSaveOrgSpec = async () => {
    setOrgSpecSaving(true);
    try {
      await poolApi.updateOrgSpec(sessionId, orgSpecDraft);
      await poolApi.updateConfig(sessionId, sessionTaskTimeoutSecs);
      onSaved?.();
    } catch (e) {
      console.error("[OrgSpecPanel] save error:", e);
    } finally {
      setOrgSpecSaving(false);
    }
  };

  const unchanged =
    orgSpecDraft === (activeSession?.org_spec || "") &&
    sessionTaskTimeoutSecs === (activeSession?.task_timeout_secs ?? 0);

  return (
    <div className="team-orgspec-panel">
      <label className="koi-form-label">{t("pool.taskTimeoutField")}</label>
      <input
        className="chatpool-input"
        type="number"
        min={0}
        max={7200}
        value={sessionTaskTimeoutSecs}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSessionTaskTimeoutSecs(Number.isFinite(v) ? Math.max(0, Math.min(7200, v)) : 0);
        }}
      />
      <div className="chatpool-field-hint">{t("pool.taskTimeoutHelp")}</div>
      <textarea
        className="chatpool-orgspec-editor"
        value={orgSpecDraft}
        onChange={(e) => setOrgSpecDraft(e.target.value)}
        placeholder={t("pool.orgSpecPlaceholder")}
        rows={10}
      />
      <button
        type="button"
        className="chatpool-btn chatpool-btn-primary"
        onClick={handleSaveOrgSpec}
        disabled={orgSpecSaving || unchanged}
        style={{ alignSelf: "flex-end", marginTop: 6 }}
      >
        {orgSpecSaving ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}
