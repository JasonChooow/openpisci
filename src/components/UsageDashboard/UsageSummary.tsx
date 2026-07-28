import { CalendarDays, CalendarRange } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface UsagePeriodSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface UsageSummaryProps {
  daily: UsagePeriodSummary | null;
  monthly: UsagePeriodSummary | null;
  currency?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function UsageSummary({
  daily,
  monthly,
  currency = "CNY",
  isLoading = false,
  error = null,
  onRetry,
}: UsageSummaryProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency });

  if (isLoading) {
    return <section className="usage-card usage-wide-card usage-state" role="status">{t("usage.loadingSummary")}</section>;
  }

  if (error) {
    return (
      <section className="usage-card usage-wide-card usage-state usage-state-error" role="alert">
        <span>{error}</span>
        {onRetry && <button type="button" className="usage-link-button" onClick={onRetry}>{t("common.refresh")}</button>}
      </section>
    );
  }

  if (!daily && !monthly) {
    return <section className="usage-card usage-wide-card usage-state">{t("usage.noSummary")}</section>;
  }

  const periods = [
    { key: "daily", title: t("usage.today"), icon: CalendarDays, value: daily },
    { key: "monthly", title: t("usage.thisMonth"), icon: CalendarRange, value: monthly },
  ] as const;

  return (
    <section className="usage-summary" aria-labelledby="usage-summary-title">
      <h2 id="usage-summary-title" className="usage-section-title">{t("usage.summaryTitle")}</h2>
      <div className="usage-summary-grid">
        {periods.map(({ key, title, icon: Icon, value }) => (
          <article className="usage-card usage-summary-card" key={key}>
            <div className="usage-card-heading usage-card-heading-compact">
              <span className="usage-card-icon" aria-hidden="true"><Icon size={18} /></span>
              <h3>{title}</h3>
            </div>
            {value ? (
              <dl className="usage-metrics">
                <div className="usage-metric-primary"><dt>{t("usage.totalTokens")}</dt><dd>{number.format(value.totalTokens)}</dd></div>
                <div><dt>{t("usage.promptTokens")}</dt><dd>{number.format(value.promptTokens)}</dd></div>
                <div><dt>{t("usage.completionTokens")}</dt><dd>{number.format(value.completionTokens)}</dd></div>
                <div><dt>{t("usage.requestCount")}</dt><dd>{number.format(value.requestCount)}</dd></div>
                <div><dt>{t("usage.totalCost")}</dt><dd>{money.format(value.totalCost)}</dd></div>
              </dl>
            ) : <p className="usage-empty-inline">{t("common.noData")}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export default UsageSummary;
