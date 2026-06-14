import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function SshSection() {
  const { t } = useTranslation();
  const { sshServers, setSshServers, sshEditIdx, setSshEditIdx, sshEditForm, setSshEditForm, sshShowPassword, setSshShowPassword } = useSettingsForm();

  return (
    <>
              {/* ── SSH Servers ───────────────────────────────────────────────── */}
              <section className="settings-section">
                <h3 className="settings-section-title">{t("settings.sshSection")}</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  {t("settings.sshSectionDesc")}
                </p>
      
                {/* Server list */}
                {sshServers.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {sshServers.map((srv, idx) => (
                      <div key={srv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                        <span style={{ fontSize: 16 }}>🖥️</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                            {srv.label || srv.id}
                            <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11, marginLeft: 8 }}>
                              [{srv.id}]
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {srv.username}@{srv.host}:{srv.port}
                            {" · "}
                            {srv.password ? t("settings.sshAuthPassword") : srv.private_key ? t("settings.sshAuthKey") : t("settings.sshAuthNone")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn" style={{ fontSize: 11, padding: "3px 10px", border: "1px solid var(--border)" }}
                            onClick={() => { setSshEditIdx(idx); setSshEditForm({ ...srv, password: "", private_key: "" }); setSshShowPassword(false); }}>
                            {t("common.edit")}
                          </button>
                          <button className="btn" style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #dc3545", color: "#dc3545" }}
                            onClick={() => setSshServers(prev => prev.filter((_, i) => i !== idx))}>
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
      
                {/* Add / Edit form */}
                {sshEditIdx !== null ? (
                  <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                    <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>
                      {sshEditIdx === -1 ? t("settings.sshAddServer") : t("settings.sshEditServer")}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">{t("settings.sshId")} *</label>
                        <input className="input" value={sshEditForm.id} onChange={e => setSshEditForm(f => ({ ...f, id: e.target.value }))} placeholder="prod" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">{t("settings.sshLabel")}</label>
                        <input className="input" value={sshEditForm.label} onChange={e => setSshEditForm(f => ({ ...f, label: e.target.value }))} placeholder={t("settings.sshLabelPlaceholder")} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">{t("settings.sshHost")} *</label>
                        <input className="input" value={sshEditForm.host} onChange={e => setSshEditForm(f => ({ ...f, host: e.target.value }))} placeholder="192.168.1.100" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">{t("settings.sshPort")}</label>
                        <input className="input" type="number" value={sshEditForm.port} onChange={e => setSshEditForm(f => ({ ...f, port: parseInt(e.target.value) || 22 }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">{t("settings.sshUsername")} *</label>
                        <input className="input" value={sshEditForm.username} onChange={e => setSshEditForm(f => ({ ...f, username: e.target.value }))} placeholder="root" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label">
                          {t("settings.sshPassword")}
                          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{t("settings.sshPasswordHint")}</span>
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input className="input" style={{ flex: 1 }} type={sshShowPassword ? "text" : "password"} value={sshEditForm.password} onChange={e => setSshEditForm(f => ({ ...f, password: e.target.value }))} placeholder={sshEditIdx !== -1 ? t("settings.sshPasswordKeep") : ""} />
                          <button className="btn" style={{ padding: "0 10px", border: "1px solid var(--border)" }} onClick={() => setSshShowPassword(v => !v)}>
                            {sshShowPassword ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                      <label className="label">
                        {t("settings.sshPrivateKey")}
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{t("settings.sshPrivateKeyHint")}</span>
                      </label>
                      <textarea className="input" rows={3} style={{ fontFamily: "monospace", fontSize: 11 }} value={sshEditForm.private_key} onChange={e => setSshEditForm(f => ({ ...f, private_key: e.target.value }))} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----" />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12 }}
                        onClick={() => {
                          if (!sshEditForm.id.trim() || !sshEditForm.host.trim() || !sshEditForm.username.trim()) return;
                          if (sshEditIdx === -1) {
                            setSshServers(prev => [...prev, sshEditForm]);
                          } else {
                            setSshServers(prev => prev.map((s, i) => i === sshEditIdx ? sshEditForm : s));
                          }
                          setSshEditIdx(null);
                        }}>
                        {t("common.save")}
                      </button>
                      <button className="btn" style={{ fontSize: 12, border: "1px solid var(--border)" }} onClick={() => setSshEditIdx(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn" style={{ fontSize: 12, padding: "6px 14px", border: "1px solid var(--border)" }}
                    onClick={() => { setSshEditIdx(-1); setSshEditForm({ id: "", label: "", host: "", port: 22, username: "", password: "", private_key: "" }); setSshShowPassword(false); }}>
                    + {t("settings.sshAddServer")}
                  </button>
                )}
              </section>
    </>
  );
}
