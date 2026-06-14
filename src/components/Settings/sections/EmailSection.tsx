import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function EmailSection() {
  const { t } = useTranslation();
  const { form, update, showKeys } = useSettingsForm();

  return (
    <>
              {/* ── Email ─────────────────────────────────────────────────────── */}
              <section className="settings-section">
                <h3 className="settings-section-title">{t("settings.emailSection")}</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  {t("settings.emailSectionDesc")}
                </p>
      
                <div style={{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.email_enabled ? 16 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.emailEnabled")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.emailEnabledDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.email_enabled} onChange={(e) => update("email_enabled", e.target.checked)} />
                  </div>
      
                  {form.email_enabled && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.smtpHost")}</label>
                          <input className="input" value={form.smtp_host} onChange={(e) => update("smtp_host", e.target.value)} placeholder="smtp.gmail.com" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
                          <label className="label">{t("settings.smtpPort")}</label>
                          <input className="input" type="number" value={form.smtp_port} onChange={(e) => update("smtp_port", parseInt(e.target.value) || 587)} placeholder="587" />
                        </div>
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.smtpUsername")}</label>
                        <input className="input" value={form.smtp_username} onChange={(e) => update("smtp_username", e.target.value)} placeholder="you@gmail.com" />
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.smtpPassword")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.smtp_password} onChange={(e) => update("smtp_password", e.target.value)} placeholder={t("settings.smtpPasswordPlaceholder")} />
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("settings.smtpPasswordHelp")}</p>
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.smtpFromName")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                        <input className="input" value={form.smtp_from_name} onChange={(e) => update("smtp_from_name", e.target.value)} placeholder="Piscis Agent" />
                      </div>
      
                      <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0" }} />
      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.imapHost")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                          <input className="input" value={form.imap_host} onChange={(e) => update("imap_host", e.target.value)} placeholder="imap.gmail.com" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
                          <label className="label">{t("settings.imapPort")}</label>
                          <input className="input" type="number" value={form.imap_port} onChange={(e) => update("imap_port", parseInt(e.target.value) || 993)} placeholder="993" />
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{t("settings.imapHelp")}</p>
                    </>
                  )}
                </div>
              </section>
    </>
  );
}
