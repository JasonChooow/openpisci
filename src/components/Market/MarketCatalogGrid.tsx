import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import MarketFeaturedRow, { MarketLoadMore } from "../Market/MarketFeaturedRow";
import { marketSourceLabel } from "../../utils/marketSource";
import {
  MARKET_PAGE_SIZE,
  splitFeaturedCatalog,
  useLazyList,
} from "../../utils/marketLazyList";

export interface MarketCatalogItem {
  id: string;
  name: string;
  description: string;
  source?: string;
  featured?: boolean;
}

interface MarketCatalogGridProps<T extends MarketCatalogItem> {
  items: T[];
  loading: boolean;
  emptyLabel: string;
  installLabel: string;
  installedLabel?: string;
  isInstalled?: (item: T) => boolean;
  onInstall: (item: T) => void;
  showFeatured?: boolean;
}

export default function MarketCatalogGrid<T extends MarketCatalogItem>({
  items,
  loading,
  emptyLabel,
  installLabel,
  installedLabel,
  isInstalled,
  onInstall,
  showFeatured = true,
}: MarketCatalogGridProps<T>) {
  const { t } = useTranslation();

  const { featured, rest } = useMemo(
    () => (showFeatured ? splitFeaturedCatalog(items) : { featured: [] as T[], rest: items }),
    [items, showFeatured],
  );

  const { visible, hasMore, loadMore, total, visibleCount } = useLazyList(rest, MARKET_PAGE_SIZE);

  const renderCard = (item: T, compact = false) => {
    const installed = isInstalled?.(item) ?? false;
    return (
      <div key={`${item.source ?? "github"}:${item.id}`} className={compact ? "market-featured-card" : "expert-market-card"}>
        {compact ? (
          <h4 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600 }}>{item.name}</h4>
        ) : (
          <h3>
            {item.name}{" "}
            <span className={`market-source-badge ${item.source ?? "github"}`}>
              {marketSourceLabel(item.source)}
            </span>
          </h3>
        )}
        <p style={compact ? { fontSize: 11, margin: "0 0 8px", color: "var(--text-secondary)", lineHeight: 1.35 } : undefined}>
          {item.description}
        </p>
        {!compact && <code className="team-card-id">{item.id}</code>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={installed}
          onClick={() => void onInstall(item)}
        >
          <Download size={14} />
          {installed && installedLabel ? installedLabel : installLabel}
        </button>
      </div>
    );
  };

  if (loading && items.length === 0) {
    return <div className="expert-empty">{t("common.loading")}</div>;
  }

  if (items.length === 0) {
    return <div className="expert-empty">{emptyLabel}</div>;
  }

  return (
    <>
      {showFeatured && featured.length > 0 && (
        <MarketFeaturedRow title={t("market.featuredTitle")}>
          {featured.map((item) => renderCard(item, true))}
        </MarketFeaturedRow>
      )}
      <div className="expert-market-grid">
        {visible.map((item) => renderCard(item))}
      </div>
      <MarketLoadMore
        hasMore={hasMore}
        loaded={visibleCount}
        total={total}
        onLoadMore={loadMore}
      />
    </>
  );
}
