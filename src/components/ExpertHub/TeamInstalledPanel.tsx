import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { TeamTemplate } from "../../types/pisciAsset";
import {
  forkTeamTemplate,
  getTeamMembers,
  loadInstalledTeams,
  normalizeTeamTemplate,
  saveInstalledTeams,
} from "../../utils/teamStorage";
import TeamEditor, { TeamMemberRow } from "./TeamEditor";

export type TeamInstalledPanelProps = {
  builtinTeams: TeamTemplate[];
  installedTeams: TeamTemplate[];
  onInstalledChange: (teams: TeamTemplate[]) => void;
};

export default function TeamInstalledPanel({
  builtinTeams,
  installedTeams,
  onInstalledChange,
}: TeamInstalledPanelProps) {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamTemplate | null>(null);

  const allTeams = useMemo(() => {
    const builtins = builtinTeams.map((team) => normalizeTeamTemplate(team, "builtin"));
    const userOrMarket = installedTeams.filter((team) => !builtins.some((b) => b.id === team.id));
    return [...builtins, ...userOrMarket];
  }, [builtinTeams, installedTeams]);

  const openCreate = () => {
    setEditingTeam(null);
    setEditorOpen(true);
  };

  const openEdit = (team: TeamTemplate) => {
    if (team.origin === "builtin") return;
    setEditingTeam(team);
    setEditorOpen(true);
  };

  const handleSave = useCallback(
    (team: TeamTemplate) => {
      const next = [...installedTeams.filter((x) => x.id !== team.id), team];
      onInstalledChange(next);
      saveInstalledTeams(next);
    },
    [installedTeams, onInstalledChange],
  );

  const handleDelete = (team: TeamTemplate) => {
    if (team.origin === "builtin") return;
    const next = installedTeams.filter((x) => x.id !== team.id);
    onInstalledChange(next);
    saveInstalledTeams(next);
  };

  const handleFork = (team: TeamTemplate) => {
    const forked = forkTeamTemplate(team);
    const next = [...installedTeams, forked];
    onInstalledChange(next);
    saveInstalledTeams(next);
    setEditingTeam(forked);
    setEditorOpen(true);
  };

  return (
    <>
      <div className="team-installed-toolbar">
        <p className="team-installed-hint">{t("expert.teamCopyModelHint")}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} /> {t("expert.teamCreate")}
        </button>
      </div>

      {allTeams.length === 0 ? (
        <div className="expert-empty">{t("expert.marketEmpty")}</div>
      ) : (
        <div className="team-installed-grid">
          {allTeams.map((team) => {
            const members = getTeamMembers(team);
            const originLabel =
              team.origin === "builtin"
                ? t("expert.originBuiltin")
                : team.origin === "market"
                  ? t("expert.originMarket")
                  : t("expert.originUser");

            return (
              <article key={team.id} className="team-installed-card">
                <header className="team-installed-card-head">
                  <div>
                    <h3>{team.name}</h3>
                    <span className="team-origin-badge">{originLabel}</span>
                  </div>
                  <div className="team-installed-card-actions">
                    {team.origin === "builtin" ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleFork(team)} title={t("expert.teamFork")}>
                        <Copy size={14} />
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(team)} title={t("expert.teamEdit")}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(team)} title={t("common.delete")}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </header>
                <p className="team-installed-desc">{team.description}</p>
                <div className="team-member-list">
                  {members.map((m) => (
                    <TeamMemberRow key={m.member_id} member={m} />
                  ))}
                </div>
                <footer className="team-installed-meta">
                  <code>{team.id}</code>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <TeamEditor
        open={editorOpen}
        team={editingTeam}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}

export { loadInstalledTeams, saveInstalledTeams };
