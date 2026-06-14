import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function SecuritySection() {
  const { t } = useTranslation();
  const { form, update } = useSettingsForm();

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        {t("settings.security")}
      </h2>
      <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.confirmShell")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.confirmShellDesc")}</div>
        </div>
        <input type="checkbox" checked={form.confirm_shell_commands ?? true} onChange={(e) => update("confirm_shell_commands", e.target.checked)} />
      </div>
      <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.confirmFileWrite")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.confirmFileWriteDesc")}</div>
        </div>
        <input type="checkbox" checked={form.confirm_file_writes ?? true} onChange={(e) => update("confirm_file_writes", e.target.checked)} />
      </div>
      <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.browserHeadless")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.browserHeadlessDesc")}</div>
        </div>
        <input type="checkbox" checked={form.browser_headless ?? true} onChange={(e) => update("browser_headless", e.target.checked)} />
      </div>
    </section>
  );
}
