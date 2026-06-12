import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Link2 } from "lucide-react";
import { extrasApi, type CloudConnector } from "../../services/tauri";
import "./CloudFiles.css";

export default function CloudFiles({ visible = true }: { visible?: boolean }) {
  const { t } = useTranslation();
  const [connectors, setConnectors] = useState<CloudConnector[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    extrasApi
      .listCloudConnectors()
      .then((list) => { if (!cancelled) setConnectors(list); })
      .catch(() => { if (!cancelled) setConnectors([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  return (
    <div className="cloud-files">
      <div className="feature-topbar">
        <h1 className="feature-topbar-title">
          <Cloud size={20} strokeWidth={1.5} />
          {t("nav.cloudFiles")}
        </h1>
      </div>
      <div className="cloud-files-body">
        <p className="cloud-files-intro">{t("cloud.intro")}</p>
        {loading && connectors.length === 0 ? (
          <div className="cloud-files-empty">{t("common.loading")}</div>
        ) : (
          <div className="cloud-files-grid">
            {connectors.map((c) => (
              <div key={c.id} className="cloud-connector-card">
                <div className="cloud-connector-icon"><Cloud size={22} strokeWidth={1.4} /></div>
                <div className="cloud-connector-main">
                  <span className="cloud-connector-name">{c.name}</span>
                  <span className="cloud-connector-status">
                    {c.connected ? t("cloud.connected") : t("cloud.notConnected")}
                  </span>
                </div>
                <button
                  type="button"
                  className="cloud-connector-btn"
                  disabled={!c.available}
                  title={c.available ? t("cloud.connect") : t("cloud.comingSoon")}
                >
                  <Link2 size={14} strokeWidth={1.5} />
                  {c.available ? t("cloud.connect") : t("cloud.comingSoon")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
