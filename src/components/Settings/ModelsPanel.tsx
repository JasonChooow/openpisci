import { useTranslation } from "react-i18next";
import SettingsPanelLayout from "../SettingsHub/SettingsPanelLayout";
import ModelsSection from "./sections/ModelsSection";

export default function ModelsPanel() {
  const { t } = useTranslation();

  return (
    <SettingsPanelLayout
      title={t("settingsHub.models")}
      icon="🧠"
      subtitle={t("settingsHub.modelsDesc")}
    >
      <ModelsSection />
    </SettingsPanelLayout>
  );
}
