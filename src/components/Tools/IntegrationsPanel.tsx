import { useTranslation } from "react-i18next";
import EmailSection from "../Settings/sections/EmailSection";
import SshSection from "../Settings/sections/SshSection";

export default function IntegrationsPanel() {
  const { t } = useTranslation();

  return (
    <section className="tools-section">
      <div className="section-header">
        <p className="section-desc">{t("tools.integrationsDesc")}</p>
      </div>
      <EmailSection />
      <SshSection />
    </section>
  );
}
