import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Trash2, UserPlus } from "lucide-react";
import { koiApi, type KoiWithStats } from "../../services/tauri";
import type { TeamExpertSnapshot, TeamTemplate } from "../../types/pisciAsset";
import {
  getTeamMembers,
  newEmptyUserTeam,
  normalizeTeamTemplate,
  snapshotFromKoi,
  syncRolesFromMembers,
} from "../../utils/teamStorage";

export type TeamEditorProps = {
  open: boolean;
  team: TeamTemplate | null;
  onClose: () => void;
  onSave: (team: TeamTemplate) => void;
};

export default function TeamEditor({ open, team, onClose, onSave }: TeamEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TeamTemplate>(() => newEmptyUserTeam());
  const [kois, setKois] = useState<KoiWithStats[]>([]);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(team ? normalizeTeamTemplate({ ...team, members: getTeamMembers(team).map((m) => ({ ...m })) }) : newEmptyUserTeam());
    koiApi.list().then(setKois).catch(() => setKois([]));
    setPickOpen(false);
  }, [open, team]);

  const members = draft.members ?? [];

  const updateMember = (memberId: string, patch: Partial<TeamExpertSnapshot>) => {
    setDraft((prev) => {
      const nextMembers = (prev.members ?? []).map((m) =>
        m.member_id === memberId ? { ...m, ...patch } : m,
      );
      return normalizeTeamTemplate({
        ...prev,
        members: nextMembers,
        roles: syncRolesFromMembers(nextMembers),
      });
    });
  };

  const removeMember = (memberId: string) => {
    setDraft((prev) => {
      const nextMembers = (prev.members ?? []).filter((m) => m.member_id !== memberId);
      return normalizeTeamTemplate({
        ...prev,
        members: nextMembers,
        roles: syncRolesFromMembers(nextMembers),
      });
    });
  };

  const addFromKoi = (koi: KoiWithStats) => {
    setDraft((prev) => {
      const nextMembers = [...(prev.members ?? []), snapshotFromKoi(koi)];
      return normalizeTeamTemplate({
        ...prev,
        members: nextMembers,
        roles: syncRolesFromMembers(nextMembers),
      });
    });
    setPickOpen(false);
  };

  const handleSave = () => {
    if (!draft.name.trim()) return;
    onSave(normalizeTeamTemplate(draft));
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="team-editor-overlay" onClick={onClose} role="presentation">
      <div className="team-editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="team-editor-header">
          <h2>{team ? t("expert.teamEdit") : t("expert.teamCreate")}</h2>
          <button type="button" className="team-editor-close" onClick={onClose} aria-label={t("common.close")}>×</button>
        </div>

        <label className="team-editor-field">
          <span>{t("expert.teamName")}</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("expert.teamNamePlaceholder")}
          />
        </label>

        <label className="team-editor-field">
          <span>{t("expert.teamDesc")}</span>
          <textarea
            className="input"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            placeholder={t("expert.teamDescPlaceholder")}
          />
        </label>

        <div className="team-editor-members-head">
          <span>{t("expert.teamMembers")}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPickOpen((v) => !v)}>
            <UserPlus size={14} /> {t("expert.addExpert")}
          </button>
        </div>

        {pickOpen && (
          <div className="team-editor-koi-pick">
            {kois.length === 0 ? (
              <p className="team-editor-muted">{t("expert.noKoiForTeam")}</p>
            ) : kois.map((koi) => (
              <button key={koi.id} type="button" className="team-editor-koi-option" onClick={() => addFromKoi(koi)}>
                <span className="team-member-icon" style={{ background: `${koi.color}22`, color: koi.color }}>{koi.icon}</span>
                <span>{koi.name}</span>
                <span className="team-editor-muted">{koi.role}</span>
              </button>
            ))}
          </div>
        )}

        <div className="team-editor-member-list">
          {members.length === 0 ? (
            <p className="team-editor-muted">{t("expert.teamMembersEmpty")}</p>
          ) : members.map((m) => (
            <div key={m.member_id} className="team-editor-member">
              <div className="team-editor-member-top">
                <span className="team-member-icon" style={{ background: `${m.color}22`, color: m.color }}>{m.icon}</span>
                <input
                  className="input team-editor-role"
                  value={m.role}
                  onChange={(e) => updateMember(m.member_id, { role: e.target.value })}
                  placeholder={t("expert.memberRole")}
                />
                <button type="button" className="team-editor-remove" onClick={() => removeMember(m.member_id)} aria-label={t("common.delete")}>
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                className="input"
                value={m.name}
                onChange={(e) => updateMember(m.member_id, { name: e.target.value })}
                placeholder={t("expert.memberName")}
              />
              {m.source_id && (
                <div className="team-member-source">
                  {t("expert.memberSource", { id: m.source_id, version: m.source_version ?? "?" })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="team-editor-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={!draft.name.trim()} onClick={handleSave}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TeamMemberRow({ member }: { member: TeamExpertSnapshot }) {
  return (
    <div className="team-member-chip">
      <span className="team-member-icon" style={{ background: `${member.color}22`, color: member.color }}>
        {member.icon}
      </span>
      <span className="team-member-name">{member.name}</span>
      <span className="team-member-role">{member.role}</span>
    </div>
  );
}
