import { useTranslation } from "react-i18next";
import { useSettingsForm } from "./useSettingsForm";
import "./SettingsHub.css";

export default function SettingsSaveBar() {
  const { t } = useTranslation();
  const { saving, saved, saveError, setSaveError, isDirty, handleSave } = useSettingsForm();

  return (
    <div className="settings-save-bar">
      {saveError && (
        <div className="settings-save-error">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} aria-label={t("common.close")}>✕</button>
        </div>
      )}
      <div className="settings-save-row">
        {isDirty && !saved && (
          <span className="settings-save-dirty">{t("settingsHub.unsavedChanges")}</span>
        )}
        <button
          type="button"
          className="btn-header btn-header-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saved ? t("settings.saved") : saving ? t("settings.saving") : t("settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}
