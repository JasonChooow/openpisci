import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import MarketFeaturedRow, { MarketLoadMore } from "../Market/MarketFeaturedRow";
import { marketSourceLabel } from "../../utils/marketSource";
import { compareExpertGroupLabels, normalizeExpertGroupLabel } from "../../utils/expertOrdering";
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
  category?: string | null;
  subcategory?: string | null;
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
  const groupedVisible = useMemo(() => {
    const groups = new Map<string, T[]>();
    for (const item of visible) {
      const parts = [item.category, item.subcategory].filter(Boolean);
      const group = parts.length > 0 ? normalizeExpertGroupLabel(parts.join(" / ")) : marketSourceLabel(item.source);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => compareExpertGroupLabels(a, b));
  }, [visible]);

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
      <div className="market-category-list">
        {groupedVisible.map(([group, groupItems]) => (
          <section key={group} className="market-category-section">
            <h3 className="market-category-title">{group}</h3>
            <div className="expert-market-grid">
              {groupItems.map((item) => renderCard(item))}
            </div>
          </section>
        ))}
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
