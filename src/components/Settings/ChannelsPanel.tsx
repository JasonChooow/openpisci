import { useTranslation } from "react-i18next";
import SettingsPanelLayout from "../SettingsHub/SettingsPanelLayout";
import ChannelsSection from "./sections/ChannelsSection";

type ChannelsPanelProps = {
  onOpenAssistant?: () => void;
};

export default function ChannelsPanel({ onOpenAssistant }: ChannelsPanelProps) {
  const { t } = useTranslation();

  return (
    <SettingsPanelLayout
      title={t("settingsHub.channels")}
      icon="💬"
      subtitle={t("settingsHub.channelsDesc")}
      actions={onOpenAssistant ? (
        <button type="button" className="btn-header" onClick={onOpenAssistant}>
          {t("settingsHub.openAssistant")} →
        </button>
      ) : undefined}
    >
      <ChannelsSection />
    </SettingsPanelLayout>
  );
}
