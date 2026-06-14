import { useTranslation } from "react-i18next";
import SettingsPanelLayout from "../SettingsHub/SettingsPanelLayout";
import WorkspaceSection from "./sections/WorkspaceSection";
import SecuritySection from "./sections/SecuritySection";
import AgentConfigSection from "./sections/AgentConfigSection";

export default function AgentPanel() {
  const { t } = useTranslation();

  return (
    <SettingsPanelLayout title={t("settingsHub.agent")} icon="🤖">
      <WorkspaceSection />
      <SecuritySection />
      <AgentConfigSection />
    </SettingsPanelLayout>
  );
}
