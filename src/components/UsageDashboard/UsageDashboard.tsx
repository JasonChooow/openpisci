import { useTranslation } from "react-i18next";
import BalanceCard, { type BalanceCardProps } from "./BalanceCard";
import ModelBreakdown, { type ModelBreakdownProps } from "./ModelBreakdown";
import TransactionHistory, { type TransactionHistoryProps } from "./TransactionHistory";
import UsageSummary, { type UsageSummaryProps } from "./UsageSummary";
import "./UsageDashboard.css";

export interface UsageDashboardProps {
  balance: BalanceCardProps;
  summary: UsageSummaryProps;
  models: ModelBreakdownProps;
  transactions: TransactionHistoryProps;
}

export function UsageDashboard({ balance, summary, models, transactions }: UsageDashboardProps) {
  const { t } = useTranslation();

  return (
    <div className="usage-dashboard">
      <header className="usage-dashboard-header">
        <div>
          <h1>{t("usage.title")}</h1>
          <p>{t("usage.description")}</p>
        </div>
      </header>
      <div className="usage-dashboard-grid">
        <BalanceCard {...balance} />
        <UsageSummary {...summary} />
        <ModelBreakdown {...models} />
        <TransactionHistory {...transactions} />
      </div>
    </div>
  );
}

export default UsageDashboard;

export type { BalanceCardProps } from "./BalanceCard";
export type { ModelBreakdownProps, ModelUsageItem } from "./ModelBreakdown";
export type { TransactionHistoryProps, UsageTransaction } from "./TransactionHistory";
export type { UsagePeriodSummary, UsageSummaryProps } from "./UsageSummary";
