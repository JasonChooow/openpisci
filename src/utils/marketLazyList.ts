import { useCallback, useEffect, useState } from "react";

function listHeadKey<T>(items: T[]): string {
  if (items.length === 0) return "";
  const first = items[0] as { id?: string; slug?: string };
  return first.id ?? first.slug ?? String(items.length);
}

/** Client-side paginated slice of an in-memory list. Resets when the list head changes (filter/sort). */
export function useLazyList<T>(items: T[], pageSize = 24) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const headKey = listHeadKey(items);

  // Reset page when the filtered list changes, but not when items are appended (server load-more).
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [headKey, pageSize]);

  const total = items.length;
  const loadedCount = Math.min(visibleCount, total);
  const visible = items.slice(0, loadedCount);
  const hasMore = loadedCount < total;
  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + pageSize, total));
  }, [pageSize, total]);

  return { visible, hasMore, loadMore, total, visibleCount: loadedCount };
}

export const MARKET_PAGE_SIZE = 24;
export const MARKET_FEATURED_COUNT = 5;

export interface MarketFeaturedItem {
  id: string;
  featured?: boolean;
}

/** Pick up to `count` featured items; fills from catalog order when none marked. */
export function splitFeaturedCatalog<T extends MarketFeaturedItem>(
  items: T[],
  count = MARKET_FEATURED_COUNT,
): { featured: T[]; rest: T[] } {
  const featuredIds = new Set<string>();
  const featured: T[] = [];

  for (const item of items) {
    if (item.featured && featured.length < count) {
      featured.push(item);
      featuredIds.add(item.id);
    }
  }

  if (featured.length < count) {
    for (const item of items) {
      if (featuredIds.has(item.id)) continue;
      featured.push(item);
      featuredIds.add(item.id);
      if (featured.length >= count) break;
    }
  }

  const rest = items.filter((item) => !featuredIds.has(item.id));
  return { featured, rest };
}

export interface RegistryFeaturedItem {
  slug: string;
  stars: number;
}

/** Top-N by stars for ClawHub-compatible registries (browse / hot list). */
export function pickRegistryFeatured<T extends RegistryFeaturedItem>(
  items: T[],
  count = MARKET_FEATURED_COUNT,
): { featured: T[]; rest: T[] } {
  if (items.length === 0) return { featured: [], rest: [] };
  const sorted = [...items].sort((a, b) => b.stars - a.stars || a.slug.localeCompare(b.slug));
  const featured = sorted.slice(0, count);
  const featuredSlugs = new Set(featured.map((s) => s.slug));
  const rest = items.filter((s) => !featuredSlugs.has(s.slug));
  return { featured, rest };
}
