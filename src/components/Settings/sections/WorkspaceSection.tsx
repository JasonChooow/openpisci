import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function WorkspaceSection() {
  const { t } = useTranslation();
  const { form, update, defaultWorkspace } = useSettingsForm();

  return (
    <>
              {/* Workspace */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  {t("settings.workspace")}
                </h2>
                <div className="form-group">
                  <label className="label">{t("settings.workspaceRoot")} <span style={{ color: "var(--color-error, #ef4444)", marginLeft: 2 }}>*</span></label>
                  <input
                    className="input"
                    value={form.workspace_root ?? ""}
                    onChange={(e) => update("workspace_root", e.target.value)}
                    placeholder={defaultWorkspace || t("settings.workspaceRootPlaceholder")}
                    style={!(form.workspace_root ?? "").trim()
                      ? { borderColor: "var(--color-warning, #f59e0b)" }
                      : undefined}
                  />
                  {!(form.workspace_root ?? "").trim() && (
                    <p style={{ fontSize: 12, color: "var(--color-warning, #f59e0b)", marginTop: 4 }}>
                      {t("settings.workspaceRootRequired")}
                    </p>
                  )}
                  {(form.workspace_root ?? "").trim() && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {form.allow_outside_workspace
                        ? t("settings.workspaceRootHelpOutside")
                        : t("settings.workspaceRootHelp")}
                    </p>
                  )}
                </div>
                <div className="form-group" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.allowOutsideWorkspace")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{t("settings.allowOutsideWorkspaceDesc")}</div>
                    {form.allow_outside_workspace && (
                      <div style={{ fontSize: 12, color: "var(--color-warning, #f59e0b)", marginTop: 6, padding: "6px 10px", background: "rgba(245,158,11,0.08)", borderRadius: 6, border: "1px solid rgba(245,158,11,0.3)" }}>
                        {t("settings.allowOutsideWorkspaceWarning")}
                      </div>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={form.allow_outside_workspace ?? false}
                    onChange={(e) => update("allow_outside_workspace", e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                </div>
              </section>
    </>
  );
}
