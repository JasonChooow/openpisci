import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface UsageTransaction {
  id: string | number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  createdAt: string;
}

export interface TransactionHistoryProps {
  items: UsageTransaction[];
  total: number;
  page: number;
  pageSize: number;
  currency?: string;
  isLoading?: boolean;
  error?: string | null;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
}

export function TransactionHistory({
  items,
  total,
  page,
  pageSize,
  currency = "CNY",
  isLoading = false,
  error = null,
  onPageChange,
  onRetry,
}: TransactionHistoryProps) {
  const { t, i18n } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const number = new Intl.NumberFormat(i18n.language);
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency });
  const dateTime = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="usage-card usage-wide-card" aria-labelledby="usage-transactions-title">
      <div className="usage-card-heading">
        <span className="usage-card-icon" aria-hidden="true"><ReceiptText size={20} /></span>
        <div><h2 id="usage-transactions-title">{t("usage.transactionsTitle")}</h2><p>{t("usage.transactionsDescription")}</p></div>
      </div>
      {isLoading ? (
        <div className="usage-state" role="status">{t("usage.loadingTransactions")}</div>
      ) : error ? (
        <div className="usage-state usage-state-error" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" className="usage-link-button" onClick={onRetry}>{t("common.refresh")}</button>}
        </div>
      ) : items.length === 0 ? (
        <div className="usage-state">{t("usage.noTransactions")}</div>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table" aria-label={t("usage.transactionsTitle")}>
            <thead><tr><th scope="col">{t("usage.time")}</th><th scope="col">{t("usage.model")}</th><th scope="col">{t("usage.inputOutput")}</th><th scope="col">{t("usage.cost")}</th></tr></thead>
            <tbody>
              {items.map((item) => {
                const parsedDate = new Date(item.createdAt);
                const displayDate = Number.isNaN(parsedDate.getTime()) ? item.createdAt : dateTime.format(parsedDate);
                return (
                  <tr key={item.id}>
                    <td><time dateTime={item.createdAt}>{displayDate}</time></td>
                    <th scope="row"><span className="usage-model-name">{item.model}</span></th>
                    <td>{number.format(item.promptTokens)} / {number.format(item.completionTokens)}</td>
                    <td>{money.format(item.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav className="usage-pagination" aria-label={t("usage.paginationLabel")}>
        <button type="button" className="usage-page-button" aria-label={t("usage.previousPage")} disabled={isLoading || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}><ChevronLeft size={16} /></button>
        <span aria-live="polite">{t("usage.pageStatus", { page: currentPage, total: totalPages })}</span>
        <button type="button" className="usage-page-button" aria-label={t("usage.nextPage")} disabled={isLoading || currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}><ChevronRight size={16} /></button>
      </nav>
    </section>
  );
}

export default TransactionHistory;
