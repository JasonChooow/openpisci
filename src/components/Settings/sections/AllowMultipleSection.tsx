import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function AllowMultipleSection() {
  const { t } = useTranslation();
  const { form, update } = useSettingsForm();

  return (
    <section style={{ marginBottom: 32 }}>
      <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.allowMultipleInstances")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {t("settings.allowMultipleInstancesDesc")}
          </div>
        </div>
        <input
          type="checkbox"
          checked={form.allow_multiple_instances ?? false}
          onChange={(e) => update("allow_multiple_instances", e.target.checked)}
        />
      </div>
    </section>
  );
}
