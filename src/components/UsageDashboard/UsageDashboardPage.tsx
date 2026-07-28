/**
 * Connected container that wires data-fetching hooks into the presentational
 * UsageDashboard component. Registered as a lazy-loaded tab panel in App.tsx.
 */
import UsageDashboard from "./UsageDashboard";
import { useBalance } from "../../hooks/useBalance";
import { useUsageSummary } from "../../hooks/useUsageSummary";
import { useUsageByModel } from "../../hooks/useUsageByModel";
import { useTransactions } from "../../hooks/useTransactions";

export function UsageDashboardPage() {
  const balance = useBalance();
  const summary = useUsageSummary();
  const byModel = useUsageByModel("monthly");
  const transactions = useTransactions({ pageSize: 20 });

  return (
    <UsageDashboard
      balance={{
        balance: balance.balance,
        currency: balance.currency,
        isLoading: balance.isLoading,
        error: balance.error,
        isClaiming: balance.isClaiming,
        hasClaimedToday: balance.hasClaimedToday,
        claimError: balance.claimError,
        onClaimDaily: () => { void balance.claimDaily(); },
        onRetry: balance.refetch,
      }}
      summary={{
        daily: summary.daily
          ? {
              promptTokens: summary.daily.promptTokens,
              completionTokens: summary.daily.completionTokens,
              totalTokens: summary.daily.totalTokens,
              totalCost: summary.daily.totalCost,
              requestCount: summary.daily.requestCount,
            }
          : null,
        monthly: summary.monthly
          ? {
              promptTokens: summary.monthly.promptTokens,
              completionTokens: summary.monthly.completionTokens,
              totalTokens: summary.monthly.totalTokens,
              totalCost: summary.monthly.totalCost,
              requestCount: summary.monthly.requestCount,
            }
          : null,
        isLoading: summary.isLoading,
        error: summary.error,
        currency: "CNY",
      }}
      models={{
        models: byModel.models.map((m) => ({
          model: m.model,
          promptTokens: m.promptTokens,
          completionTokens: m.completionTokens,
          totalCost: m.totalCost,
          requestCount: m.requestCount,
        })),
        isLoading: byModel.isLoading,
        error: byModel.error,
        currency: "CNY",
      }}
      transactions={{
        items: transactions.items.map((item) => ({
          id: item.id,
          model: item.model,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          cost: item.cost,
          createdAt: item.createdAt,
        })),
        total: transactions.total,
        page: transactions.page,
        pageSize: transactions.pageSize,
        isLoading: transactions.isLoading,
        error: transactions.error,
        currency: "CNY",
        onPageChange: transactions.setPage,
      }}
    />
  );
}

export default UsageDashboardPage;
