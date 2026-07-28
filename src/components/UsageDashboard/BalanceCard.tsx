import { Gift, WalletCards } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface BalanceCardProps {
  balance: number | null;
  currency?: string;
  isLoading?: boolean;
  error?: string | null;
  isClaiming?: boolean;
  claimDisabled?: boolean;
  hasClaimedToday?: boolean;
  claimError?: string | null;
  onClaimDaily: () => void | Promise<void>;
  onRetry?: () => void;
}

export function BalanceCard({
  balance,
  currency = "CNY",
  isLoading = false,
  error = null,
  isClaiming = false,
  claimDisabled = false,
  hasClaimedToday = false,
  claimError = null,
  onClaimDaily,
  onRetry,
}: BalanceCardProps) {
  const { t, i18n } = useTranslation();
  const formattedBalance = balance === null
    ? "—"
    : new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(balance);
  const isDisabled = isLoading || Boolean(error) || isClaiming || claimDisabled || hasClaimedToday;

  return (
    <section className="usage-card usage-balance-card" aria-labelledby="usage-balance-title">
      <div className="usage-card-heading">
        <span className="usage-card-icon" aria-hidden="true"><WalletCards size={20} /></span>
        <div>
          <h2 id="usage-balance-title">{t("usage.balanceTitle")}</h2>
          <p>{t("usage.balanceDescription")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="usage-state" role="status">{t("usage.loadingBalance")}</div>
      ) : error ? (
        <div className="usage-state usage-state-error" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" className="usage-link-button" onClick={onRetry}>{t("common.refresh")}</button>}
        </div>
      ) : (
        <div className="usage-balance-value" data-testid="current-balance">{formattedBalance}</div>
      )}

      <button
        type="button"
        className="usage-primary-button"
        disabled={isDisabled}
        onClick={onClaimDaily}
      >
        <Gift size={16} aria-hidden="true" />
        {isClaiming
          ? t("usage.claiming")
          : hasClaimedToday
            ? t("usage.claimedToday")
            : t("usage.claimDaily")}
      </button>
      {claimError && <p className="usage-inline-error" role="alert">{claimError}</p>}
    </section>
  );
}

export default BalanceCard;
