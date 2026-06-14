import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  skillsApi,
  type ClawHubSkill,
  type SkillCatalogItem,
} from "../../services/tauri";
import MarketFeaturedRow, { MarketLoadMore } from "../Market/MarketFeaturedRow";
import {
  MARKET_FEATURED_COUNT,
  MARKET_PAGE_SIZE,
  pickRegistryFeatured,
  useLazyList,
} from "../../utils/marketLazyList";

export interface RegistrySkillApi {
  search: (query: string, limit?: number, offset?: number) => Promise<import("../../services/tauri").ClawHubSearchResult>;
  install: (slug: string, version?: string) => Promise<SkillCatalogItem>;
}

interface RegistrySkillPanelProps {
  api: RegistrySkillApi;
  searchTitleKey: string;
  searchPlaceholderKey: string;
  hintKey: string;
  emptyTitleKey: string;
  emptyDescKey: string;
  noResultsKey: string;
  searchFailedKey: string;
  /** Registry supports sort=stars hot list (ClawHub / SkillHub). */
  supportsHotPicks?: boolean;
  onInstalled: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const REGISTRY_FETCH_SIZE = 30;

function enrichCompat(items: ClawHubSkill[], setItems: (fn: (prev: ClawHubSkill[]) => ClawHubSkill[]) => void) {
  items.forEach(async (skill) => {
    if (!skill.skill_url) return;
    try {
      const compat = await skillsApi.checkCompat(skill.skill_url);
      setItems((prev) => {
        const next = [...prev];
        const i = next.findIndex((s) => s.slug === skill.slug);
        if (i < 0) return prev;
        next[i] = {
          ...next[i],
          compatible: compat.compatible,
          compat_issues: compat.issues,
        };
        return next;
      });
    } catch {
      /* optional */
    }
  });
}

export default function RegistrySkillPanel({
  api,
  searchTitleKey,
  searchPlaceholderKey,
  hintKey,
  emptyTitleKey,
  emptyDescKey,
  noResultsKey,
  searchFailedKey,
  supportsHotPicks = true,
  onInstalled,
  onError,
  onSuccess,
}: RegistrySkillPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [browseMode, setBrowseMode] = useState(true);
  const [allItems, setAllItems] = useState<ClawHubSkill[]>([]);
  const [featuredItems, setFeaturedItems] = useState<ClawHubSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const listItems = useMemo(() => {
    if (!browseMode || !supportsHotPicks || featuredItems.length === 0) return allItems;
    const featuredSlugs = new Set(featuredItems.map((s) => s.slug));
    return allItems.filter((s) => !featuredSlugs.has(s.slug));
  }, [allItems, browseMode, featuredItems, supportsHotPicks]);

  const { visible, hasMore, loadMore, total, visibleCount } = useLazyList(listItems, MARKET_PAGE_SIZE);

  const fetchBrowse = useCallback(async (offset: number, append: boolean) => {
    const result = await api.search("", REGISTRY_FETCH_SIZE, offset);
    if (result.items.length === 0) {
      setHasMoreServer(false);
      if (!append) setAllItems([]);
      return;
    }
    setHasMoreServer(result.items.length >= REGISTRY_FETCH_SIZE);
    setServerOffset(offset + result.items.length);
    setAllItems((prev) => {
      const merged = append ? [...prev] : [];
      const slugs = new Set(merged.map((s) => s.slug));
      for (const item of result.items) {
        if (!slugs.has(item.slug)) {
          merged.push(item);
          slugs.add(item.slug);
        }
      }
      if (supportsHotPicks && !append) {
        const { featured, rest } = pickRegistryFeatured(merged, MARKET_FEATURED_COUNT);
        setFeaturedItems(featured);
        enrichCompat([...featured, ...rest], setAllItems);
        return merged;
      }
      enrichCompat(result.items, setAllItems);
      return merged;
    });
  }, [api, supportsHotPicks]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPanelError(null);
    void fetchBrowse(0, false)
      .catch((e) => {
        if (!cancelled) setPanelError(t(searchFailedKey, { error: String(e) }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [fetchBrowse, searchFailedKey, t]);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    setLoading(true);
    setPanelError(null);
    setBrowseMode(q === "");
    setFeaturedItems([]);
    setServerOffset(0);
    setHasMoreServer(false);
    try {
      const result = await api.search(q, REGISTRY_FETCH_SIZE, 0);
      if (result.items.length === 0) {
        setPanelError(t(noResultsKey));
        setAllItems([]);
        return;
      }
      setAllItems(result.items);
      setHasMoreServer(q === "" && result.items.length >= REGISTRY_FETCH_SIZE);
      setServerOffset(result.items.length);
      if (q === "" && supportsHotPicks) {
        const { featured } = pickRegistryFeatured(result.items, MARKET_FEATURED_COUNT);
        setFeaturedItems(featured);
      }
      enrichCompat(result.items, setAllItems);
    } catch (e) {
      setPanelError(t(searchFailedKey, { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [api, query, supportsHotPicks, t, noResultsKey, searchFailedKey]);

  const handleLoadMore = useCallback(async () => {
    if (hasMore) {
      loadMore();
      return;
    }
    if (!hasMoreServer || !browseMode) return;
    setLoadingMore(true);
    try {
      await fetchBrowse(serverOffset, true);
    } catch (e) {
      onError(t(searchFailedKey, { error: String(e) }));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadMore, hasMoreServer, browseMode, fetchBrowse, serverOffset, onError, searchFailedKey, t]);

  const handleInstall = async (skill: ClawHubSkill) => {
    if (skill.compatible === false) {
      onError(t("skills.installFailed", { error: skill.compat_issues.join("; ") }));
      return;
    }
    setInstalling(skill.slug);
    try {
      const version = skill.version?.trim();
      const installed = await api.install(
        skill.slug,
        version && version !== "latest" ? version : undefined,
      );
      onSuccess(t("skills.installSuccess", { name: installed.name }));
      onInstalled();
    } catch (e) {
      onError(t("skills.installFailed", { error: String(e) }));
    } finally {
      setInstalling(null);
    }
  };

  const renderSkillCard = (skill: ClawHubSkill, compact = false) => {
    const isInstalling = installing === skill.slug;
    const incompatible = skill.compatible === false;
    return (
      <div
        key={skill.slug}
        className={compact ? "market-featured-card" : "card"}
        style={compact ? undefined : {
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: incompatible ? 0.75 : 1,
          border: incompatible ? "1px solid rgba(220,53,69,0.4)" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: compact ? "stretch" : "flex-start", flexDirection: compact ? "column" : "row", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {compact ? (
              <h4>{skill.name}</h4>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {skill.name}
                </span>
                {skill.version && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {/^\d/.test(skill.version) ? `v${skill.version}` : skill.version}
                  </span>
                )}
                {skill.compatible === true && (
                  <span style={{ fontSize: 10, color: "#28a745", background: "rgba(40,167,69,0.12)", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                    ✓ {t("skills.compatOk")}
                  </span>
                )}
                {incompatible && (
                  <span style={{ fontSize: 10, color: "#ff6b6b", background: "rgba(220,53,69,0.12)", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                    ✗ {t("skills.compatFail")}
                  </span>
                )}
              </div>
            )}
            <p style={{ fontSize: compact ? 11 : 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
              {skill.description || t("skills.noDescription")}
            </p>
            {!compact && incompatible && skill.compat_issues.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#ff6b6b" }}>
                {skill.compat_issues.map((issue, i) => (
                  <div key={i}>⚠ {issue}</div>
                ))}
              </div>
            )}
          </div>
          <button
            className={`btn ${incompatible ? "btn-secondary" : "btn-primary"}`}
            onClick={() => void handleInstall(skill)}
            disabled={isInstalling || incompatible}
            style={{ flexShrink: 0, fontSize: 12, padding: compact ? "4px 10px" : "4px 12px", alignSelf: compact ? "flex-start" : undefined }}
          >
            {isInstalling ? t("skills.installing") : incompatible ? t("skills.compatFail") : t("skills.installBtn")}
          </button>
        </div>
        {!compact && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
            {skill.stars > 0 && <span>⭐ {skill.stars}</span>}
            {skill.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ padding: "1px 6px", background: "var(--bg-tertiary)", borderRadius: 10, border: "1px solid var(--border)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const showEmpty = initialLoaded && !loading && allItems.length === 0 && !panelError;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, fontSize: 14 }}>
          {t(searchTitleKey)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(searchPlaceholderKey)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            disabled={loading}
          />
          <button
            className="btn btn-primary"
            onClick={() => void handleSearch()}
            disabled={loading}
            style={{ flexShrink: 0 }}
          >
            {loading ? t("common.loading") : t("common.search")}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          {t(hintKey)}
        </p>
      </div>

      {panelError && (
        <div style={{ padding: "8px 14px", background: "rgba(220,53,69,0.1)", borderLeft: "3px solid #dc3545", color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>
          {panelError}
        </div>
      )}

      {loading && allItems.length === 0 && (
        <div className="expert-empty">{t("common.loading")}</div>
      )}

      {showEmpty && (
        <div className="empty-state" style={{ padding: "28px 16px" }}>
          <div className="empty-state-title">{t(emptyTitleKey)}</div>
          <div className="empty-state-desc">{t(emptyDescKey)}</div>
        </div>
      )}

      {browseMode && supportsHotPicks && featuredItems.length > 0 && (
        <MarketFeaturedRow title={t("market.hotPicksTitle")}>
          {featuredItems.map((skill) => renderSkillCard(skill, true))}
        </MarketFeaturedRow>
      )}

      {!loading || allItems.length > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {visible.map((skill) => renderSkillCard(skill))}
          </div>
          <MarketLoadMore
            hasMore={hasMore || hasMoreServer}
            loading={loadingMore}
            onLoadMore={() => void handleLoadMore()}
            loaded={visibleCount}
            total={total}
          />
        </>
      ) : null}
    </div>
  );
}
