import { useTranslation } from "react-i18next";
import SettingsPanelLayout from "../SettingsHub/SettingsPanelLayout";
import AllowMultipleSection from "./sections/AllowMultipleSection";
import InterfaceSection from "./sections/InterfaceSection";

export default function GeneralPanel() {
  const { t } = useTranslation();

  return (
    <SettingsPanelLayout title={t("settingsHub.general")} icon="⚙️">
      <InterfaceSection />
      <AllowMultipleSection />
    </SettingsPanelLayout>
  );
}
