import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { marketplaceApi, type MarketSkill } from "../../services/tauri/platform";
import { getCloudBaseUrl } from "../../config/cloud";
import { marketSourceLabel } from "../../utils/marketSource";
import MarketFeaturedRow, { MarketLoadMore } from "../Market/MarketFeaturedRow";
import {
  MARKET_PAGE_SIZE,
  splitFeaturedCatalog,
  useLazyList,
} from "../../utils/marketLazyList";

interface OpenpisciMarketPanelProps {
  onInstalled: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function OpenpisciMarketPanel({
  onInstalled,
  onError,
  onSuccess,
}: OpenpisciMarketPanelProps) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<MarketSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [installing, setInstalling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const cloudBaseUrl = await getCloudBaseUrl();
      const index = await marketplaceApi.fetchAggregated(cloudBaseUrl);
      setSkills(index.skills ?? []);
    } catch (e) {
      onError(t("skills.openpisciLoadFailed", { error: String(e) }));
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const s of skills) {
      for (const tag of s.tags ?? []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [skills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (tagFilter && !(s.tags ?? []).includes(tagFilter)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q)
        || s.id.toLowerCase().includes(q)
      );
    });
  }, [skills, query, tagFilter]);

  const showFeatured = !query.trim() && !tagFilter;
  const { featured, rest } = useMemo(() => {
    if (!showFeatured) return { featured: [] as MarketSkill[], rest: filtered };
    return splitFeaturedCatalog(filtered);
  }, [filtered, showFeatured]);

  const { visible, hasMore, loadMore, total, visibleCount } = useLazyList(rest, MARKET_PAGE_SIZE);

  const handleInstall = async (skill: MarketSkill) => {
    setInstalling(skill.id);
    try {
      const installed = await marketplaceApi.installSkill(skill.download_url);
      onSuccess(t("skills.installSuccess", { name: installed.name }));
      onInstalled();
    } catch (e) {
      onError(t("skills.installFailed", { error: String(e) }));
    } finally {
      setInstalling(null);
    }
  };

  const renderCard = (s: MarketSkill, compact = false) => (
    <div
      key={`${s.source ?? "github"}:${s.id}`}
      className={compact ? "market-featured-card" : "expert-market-card"}
    >
      {compact ? (
        <h4 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600 }}>{s.name}</h4>
      ) : (
        <h3>
          {s.name}{" "}
          <span className={`market-source-badge ${s.source ?? "github"}`}>
            {marketSourceLabel(s.source)}
          </span>
        </h3>
      )}
      <p style={compact ? { fontSize: 11, margin: "0 0 8px", color: "var(--text-secondary)", lineHeight: 1.35 } : undefined}>
        {s.description}
      </p>
      {!compact && <code className="team-card-id">{s.id}</code>}
      {!compact && (s.tags ?? []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {(s.tags ?? []).slice(0, 4).map((tag) => (
            <span key={tag} style={{ fontSize: 10, padding: "1px 6px", background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border)" }}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={installing === s.id}
        onClick={() => void handleInstall(s)}
      >
        <Download size={14} />
        {installing === s.id ? t("skills.installing") : t("skills.installBtn")}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, fontSize: 14 }}>
          {t("skills.openpisciSearch")}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.openpisciSearchPlaceholder")}
          />
          {allTags.length > 0 && (
            <select
              className="input"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{ width: "auto", minWidth: 120 }}
            >
              <option value="">{t("skills.openpisciAllTags")}</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          {t("skills.openpisciHint")}
        </p>
      </div>

      {loading && skills.length === 0 && (
        <div className="expert-empty">{t("common.loading")}</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state" style={{ padding: "28px 16px" }}>
          <div className="empty-state-title">{t("skills.openpisciEmpty")}</div>
          <div className="empty-state-desc">{t("skills.openpisciEmptyDesc")}</div>
        </div>
      )}

      {showFeatured && featured.length > 0 && (
        <MarketFeaturedRow title={t("market.featuredTitle")}>
          {featured.map((s) => renderCard(s, true))}
        </MarketFeaturedRow>
      )}

      {visible.length > 0 && (
        <>
          <div className="expert-market-grid">
            {visible.map((s) => renderCard(s))}
          </div>
          <MarketLoadMore
            hasMore={hasMore}
            loaded={visibleCount}
            total={total}
            onLoadMore={loadMore}
          />
        </>
      )}
    </div>
  );
}
