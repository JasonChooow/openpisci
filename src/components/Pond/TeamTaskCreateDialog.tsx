import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { extrasApi, koiApi, poolApi, sessionsApi, type TeamTemplate, type KoiWithStats } from "../../services/tauri";
import { orgSpecFromTeamTemplate } from "../../utils/teamTemplate";
import { instantiateTeamMembers } from "../../utils/instantiateTeam";
import { getTeamMembers } from "../../utils/teamStorage";
import { joinProjectPath } from "../../utils/projectPath";
import { poolActions, koiActions, RootState, sessionsActions } from "../../store";
import { getInstalledTeams } from "../ExpertHub";
import "./ChatPool/ChatPool.css";
import "./Collab/Collab.css";

type TaskMode = "adhoc" | "template";

export type TeamTaskCreateResult = {
  chatSessionId: string;
  poolSessionId: string;
};

export type TeamTaskCreateDialogProps = {
  open: boolean;
  defaultWorkspace?: string;
  onClose: () => void;
  onCreated: (result: TeamTaskCreateResult) => void;
};

export default function TeamTaskCreateDialog({
  open,
  defaultWorkspace = "",
  onClose,
  onCreated,
}: TeamTaskCreateDialogProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const kois = useSelector((s: RootState) => s.koi.kois);

  const [name, setName] = useState("");
  const [projectDir, setProjectDir] = useState("");
  const [projectDirTouched, setProjectDirTouched] = useState(false);
  const [taskTimeoutSecs, setTaskTimeoutSecs] = useState(0);
  const [mode, setMode] = useState<TaskMode>("template");
  const [selectedKoiIds, setSelectedKoiIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[]>([]);
  const [installedTeams, setInstalledTeams] = useState<TeamTemplate[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setProjectDir(defaultWorkspace.trim());
    setProjectDirTouched(false);
    setTaskTimeoutSecs(0);
    setMode("template");
    setSelectedKoiIds([]);
    setSelectedTemplateId("");
    setError("");
    setInstalledTeams(getInstalledTeams());
    extrasApi.listTeamTemplates().then(setTeamTemplates).catch(() => setTeamTemplates([]));
    if (kois.length === 0) {
      koiApi.list().then((list) => dispatch(koiActions.setKois(list))).catch(() => {});
    }
  }, [open, defaultWorkspace, dispatch, kois.length]);

  useEffect(() => {
    if (!open || projectDirTouched) return;
    const trimmed = name.trim();
    if (!trimmed || !defaultWorkspace.trim()) {
      setProjectDir(defaultWorkspace.trim());
      return;
    }
    setProjectDir(joinProjectPath(defaultWorkspace, trimmed));
  }, [open, name, defaultWorkspace, projectDirTouched]);

  const templateOptions = useMemo(() => {
    const merged = [...teamTemplates];
    for (const installed of installedTeams) {
      if (!merged.some((tpl) => tpl.id === installed.id)) merged.push(installed);
    }
    return merged.map((tpl) => ({ id: tpl.id, label: tpl.name, template: tpl }));
  }, [teamTemplates, installedTeams]);

  const applyTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      const tpl = teamTemplates.find((item) => item.id === templateId);
      if (tpl) {
        setName((prev) => prev.trim() || tpl.name);
      }
    },
    [teamTemplates],
  );

  const toggleKoi = (koiId: string) => {
    setSelectedKoiIds((prev) =>
      prev.includes(koiId) ? prev.filter((id) => id !== koiId) : [...prev, koiId],
    );
  };

  const browseProjectDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        multiple: false,
        title: t("pool.selectProjectDir"),
      });
      if (dir && typeof dir === "string") {
        setProjectDir(dir);
        setProjectDirTouched(true);
      }
    } catch {
      // dialog unavailable
    }
  };

  const canSubmit =
    name.trim().length > 0 &&
    projectDir.trim().length > 0 &&
    (mode === "adhoc" ? selectedKoiIds.length > 0 : Boolean(selectedTemplateId));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError("");
    try {
      let orgSpec: string | undefined;
      let koiIds: string[] = mode === "adhoc" ? selectedKoiIds : [];
      if (mode === "template") {
        const tpl =
          teamTemplates.find((item) => item.id === selectedTemplateId) ??
          installedTeams.find((item) => item.id === selectedTemplateId);
        if (tpl) {
          orgSpec = orgSpecFromTeamTemplate(tpl);
          if (getTeamMembers(tpl).length > 0) {
            koiIds = await instantiateTeamMembers(tpl);
          }
        }
      }

      const bundle = await poolApi.createTeamTaskBundle({
        name: name.trim(),
        projectDir: projectDir.trim(),
        taskTimeoutSecs,
        mode,
        koiIds,
        orgSpec,
      });

      dispatch(poolActions.addPoolSession(bundle.pool_session));
      const { sessions: fresh } = await sessionsApi.list(200);
      dispatch(sessionsActions.setSessions(fresh));
      onCreated({
        chatSessionId: bundle.chat_session_id,
        poolSessionId: bundle.pool_session_id,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="koi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="team-task-create-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-task-create-title"
      >
        <div className="team-task-create-header">
          <span id="team-task-create-title">{t("team.create.title")}</span>
          <button type="button" className="member-picker-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        <input
          className="chatpool-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("pool.sessionPlaceholder")}
          autoFocus
        />

        <div className="collab-project-dir-row">
          <input
            className="chatpool-input"
            value={projectDir}
            onChange={(e) => {
              setProjectDir(e.target.value);
              setProjectDirTouched(true);
            }}
            placeholder={t("pool.selectProjectDir")}
          />
          <button type="button" className="chatpool-btn chatpool-btn-secondary" onClick={browseProjectDir}>
            {t("pool.selectProjectDirBrowse")}
          </button>
        </div>

        <label className="team-task-create-field-label" htmlFor="team-task-timeout">
          {t("team.create.timeoutLabel")}
        </label>
        <input
          id="team-task-timeout"
          className="chatpool-input"
          type="number"
          min={0}
          max={7200}
          value={taskTimeoutSecs}
          onChange={(e) => {
            const v = Number(e.target.value);
            setTaskTimeoutSecs(Number.isFinite(v) ? Math.max(0, Math.min(7200, v)) : 0);
          }}
          placeholder={t("pool.taskTimeoutPlaceholder")}
        />
        <div className="chatpool-field-hint">{t("pool.taskTimeoutHelp")}</div>

        <div className="team-task-create-mode">
          <label className="team-task-create-radio">
            <input
              type="radio"
              name="team-task-mode"
              checked={mode === "adhoc"}
              onChange={() => setMode("adhoc")}
            />
            {t("team.create.modeAdhoc")}
          </label>
          <label className="team-task-create-radio">
            <input
              type="radio"
              name="team-task-mode"
              checked={mode === "template"}
              onChange={() => setMode("template")}
            />
            {t("team.create.modeTemplate")}
          </label>
        </div>

        {mode === "adhoc" ? (
          <div className="team-task-koi-multi">
            <div className="team-task-koi-multi-label">{t("team.create.selectExperts")}</div>
            {kois.length === 0 ? (
              <div className="chatpool-empty-hint">{t("team.create.noExperts")}</div>
            ) : (
              <div className="team-task-koi-chips">
                {kois.map((koi: KoiWithStats) => (
                  <button
                    key={koi.id}
                    type="button"
                    className={`collab-template-chip ${selectedKoiIds.includes(koi.id) ? "active" : ""}`}
                    onClick={() => toggleKoi(koi.id)}
                  >
                    {koi.icon} {koi.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {templateOptions.length > 0 && (
              <div className="collab-template-row">
                <span className="collab-template-label">{t("pool.teamTemplateLabel")}</span>
                <div className="collab-template-chips">
                  {templateOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`collab-template-chip ${selectedTemplateId === opt.id ? "active" : ""}`}
                      onClick={() => applyTemplate(opt.id)}
                      title={opt.template.description}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {templateOptions.length === 0 && (
              <div className="chatpool-empty-hint">{t("team.create.noTemplates")}</div>
            )}
          </>
        )}

        {error && <div className="chatpool-participant-error">{error}</div>}

        <div className="chatpool-new-actions">
          <button type="button" className="chatpool-btn chatpool-btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="chatpool-btn chatpool-btn-primary"
            onClick={handleSubmit}
            disabled={creating || !canSubmit}
          >
            {creating ? t("common.creating") : t("common.create")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
