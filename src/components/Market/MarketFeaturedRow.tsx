import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

interface MarketFeaturedRowProps {
  title?: string;
  children: ReactNode;
}

/** Horizontal featured / hot picks row (typically 5 items). */
export default function MarketFeaturedRow({ title, children }: MarketFeaturedRowProps) {
  const { t } = useTranslation();
  return (
    <section className="market-featured" aria-label={title ?? t("market.featuredTitle")}>
      <h3 className="market-featured-title">
        <Sparkles size={14} strokeWidth={1.75} />
        {title ?? t("market.featuredTitle")}
      </h3>
      <div className="market-featured-track">
        {children}
      </div>
    </section>
  );
}

interface MarketLoadMoreProps {
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  loaded: number;
  total: number;
}

export function MarketLoadMore({ hasMore, loading, onLoadMore, loaded, total }: MarketLoadMoreProps) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="market-load-more">
      <span className="market-load-more-count">
        {t("market.showingCount", { loaded, total })}
      </span>
      {hasMore && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? t("common.loading") : t("common.loadMore")}
        </button>
      )}
    </div>
  );
}
