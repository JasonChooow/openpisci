import { useTranslation } from "react-i18next";
import SettingsPanelLayout from "../SettingsHub/SettingsPanelLayout";
import SystemSection from "./sections/SystemSection";

export default function SystemPanel() {
  const { t } = useTranslation();

  return (
    <SettingsPanelLayout
      title={t("settingsHub.system")}
      icon="🖥️"
      subtitle={t("settingsHub.systemDesc")}
    >
      <SystemSection />
    </SettingsPanelLayout>
  );
}
