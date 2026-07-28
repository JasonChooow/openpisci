import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ModelUsageItem {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface ModelBreakdownProps {
  models: ModelUsageItem[];
  currency?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ModelBreakdown({
  models,
  currency = "CNY",
  isLoading = false,
  error = null,
  onRetry,
}: ModelBreakdownProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency });

  return (
    <section className="usage-card usage-wide-card" aria-labelledby="usage-models-title">
      <div className="usage-card-heading">
        <span className="usage-card-icon" aria-hidden="true"><Boxes size={20} /></span>
        <div><h2 id="usage-models-title">{t("usage.modelsTitle")}</h2><p>{t("usage.modelsDescription")}</p></div>
      </div>
      {isLoading ? (
        <div className="usage-state" role="status">{t("usage.loadingModels")}</div>
      ) : error ? (
        <div className="usage-state usage-state-error" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" className="usage-link-button" onClick={onRetry}>{t("common.refresh")}</button>}
        </div>
      ) : models.length === 0 ? (
        <div className="usage-state">{t("usage.noModels")}</div>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table" aria-label={t("usage.modelsTitle")}>
            <thead><tr><th scope="col">{t("usage.model")}</th><th scope="col">{t("usage.inputOutput")}</th><th scope="col">{t("usage.requestCount")}</th><th scope="col">{t("usage.totalCost")}</th></tr></thead>
            <tbody>
              {models.map((item) => (
                <tr key={item.model}>
                  <th scope="row"><span className="usage-model-name">{item.model}</span></th>
                  <td>{number.format(item.promptTokens)} / {number.format(item.completionTokens)}</td>
                  <td>{number.format(item.requestCount)}</td>
                  <td>{money.format(item.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default ModelBreakdown;
