import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Store } from "lucide-react";
import KoiManager from "../Pond/KoiManager";
import { marketplaceApi, type MarketExpert, type MarketTeam } from "../../services/tauri/platform";
import { extrasApi } from "../../services/tauri";
import { getCloudBaseUrl } from "../../config/cloud";
import type { TeamTemplate } from "../../types/pisciAsset";
import { loadInstalledTeams, saveInstalledTeams, teamFromMarketPackage, normalizeTeamTemplate } from "../../utils/teamStorage";
import TeamInstalledPanel from "./TeamInstalledPanel";
import "./ExpertHub.css";

const Skills = lazy(() => import("../Skills"));

function sourceLabel(source?: string): string {
  switch (source) {
    case "cloud":
      return "云市场";
    case "clawhub":
      return "ClawHub";
    case "github":
    default:
      return "官方";
  }
}

export type MarketLevelTab = "experts" | "teams" | "skills";
export type MarketScopeTab = "market" | "installed";

export type ExpertHubProps = {
  levelTab?: MarketLevelTab;
  scopeTab?: MarketScopeTab;
  onLevelTabChange?: (tab: MarketLevelTab) => void;
  onScopeTabChange?: (tab: MarketScopeTab) => void;
  onNavigateToChat?: () => void;
};

export function getInstalledTeams(): TeamTemplate[] {
  return loadInstalledTeams();
}

export default function ExpertHub({
  levelTab: levelTabProp,
  scopeTab: scopeTabProp,
  onLevelTabChange,
  onScopeTabChange,
  onNavigateToChat,
}: ExpertHubProps = {}) {
  const { t } = useTranslation();
  const [levelTabInternal, setLevelTabInternal] = useState<MarketLevelTab>("experts");
  const [scopeTabInternal, setScopeTabInternal] = useState<MarketScopeTab>("market");
  const levelTab = levelTabProp ?? levelTabInternal;
  const scopeTab = scopeTabProp ?? scopeTabInternal;

  const setLevelTab = (tab: MarketLevelTab) => {
    if (onLevelTabChange) onLevelTabChange(tab);
    else setLevelTabInternal(tab);
  };

  const setScopeTab = (tab: MarketScopeTab) => {
    if (onScopeTabChange) onScopeTabChange(tab);
    else setScopeTabInternal(tab);
  };

  const [marketExperts, setMarketExperts] = useState<MarketExpert[]>([]);
  const [marketTeams, setMarketTeams] = useState<MarketTeam[]>([]);
  const [installedTeams, setInstalledTeams] = useState<TeamTemplate[]>(() => loadInstalledTeams());
  const [builtinTeams, setBuiltinTeams] = useState<TeamTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [skillsMounted, setSkillsMounted] = useState(levelTab === "skills");

  const refreshMarket = useCallback(async () => {
    setLoading(true);
    try {
      // Aggregate official GitHub registry + the cloud marketplace.
      const index = await marketplaceApi.fetchAggregated(getCloudBaseUrl());
      setMarketExperts(index.experts);
      setMarketTeams(index.teams);
    } catch {
      setMarketExperts([]);
      setMarketTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    extrasApi.listTeamTemplates().then((list) => {
      setBuiltinTeams(list.map((team) => normalizeTeamTemplate(team, "builtin")));
    }).catch(() => setBuiltinTeams([]));
  }, []);

  useEffect(() => {
    if (scopeTab === "market" && levelTab !== "skills") void refreshMarket();
  }, [scopeTab, levelTab, refreshMarket]);

  useEffect(() => {
    if (levelTab === "skills") setSkillsMounted(true);
  }, [levelTab]);

  const installedIds = useMemo(() => new Set(installedTeams.map((team) => team.id)), [installedTeams]);

  const installTeam = async (team: MarketTeam) => {
    try {
      const detail = await marketplaceApi.fetchTeamPackage(team.download_url);
      const tpl = teamFromMarketPackage(detail);
      const next = [...installedTeams.filter((x) => x.id !== tpl.id), tpl];
      setInstalledTeams(next);
      saveInstalledTeams(next);
      setScopeTab("installed");
      setLevelTab("teams");
    } catch (e) {
      console.error("Install team error:", e);
    }
  };

  const installExpert = async (expert: MarketExpert) => {
    try {
      await marketplaceApi.installExpert(expert.download_url);
    } catch (e) {
      console.error("Install expert error:", e);
    }
  };

  return (
    <div className="expert-hub">
      <div className="feature-topbar">
        <h1 className="feature-topbar-title">
          <Store size={20} strokeWidth={1.5} />
          {t("expert.title")}
        </h1>
      </div>
      <div className="expert-hub-body">
        <nav className="market-nav" aria-label={t("expert.title")}>
          <div className="market-nav-row">
            <div className="market-nav-primary" role="tablist">
              <button type="button" role="tab" aria-selected={levelTab === "experts"} className={levelTab === "experts" ? "active" : ""} onClick={() => setLevelTab("experts")}>
                {t("expert.experts")}
              </button>
              <button type="button" role="tab" aria-selected={levelTab === "teams"} className={levelTab === "teams" ? "active" : ""} onClick={() => setLevelTab("teams")}>
                {t("expert.teams")}
              </button>
              <button type="button" role="tab" aria-selected={levelTab === "skills"} className={levelTab === "skills" ? "active" : ""} onClick={() => setLevelTab("skills")}>
                {t("expert.skills")}
              </button>
            </div>
            <div className="market-nav-segment" role="tablist" aria-label={t("expert.scopeLabel")}>
              <button type="button" role="tab" aria-selected={scopeTab === "market"} className={scopeTab === "market" ? "active" : ""} onClick={() => setScopeTab("market")}>
                {t("expert.market")}
              </button>
              <button type="button" role="tab" aria-selected={scopeTab === "installed"} className={scopeTab === "installed" ? "active" : ""} onClick={() => setScopeTab("installed")}>
                {t("expert.installed")}
              </button>
            </div>
          </div>
        </nav>

        {levelTab === "experts" && scopeTab === "installed" && (
          <KoiManager />
        )}

        {levelTab === "teams" && scopeTab === "installed" && (
          <TeamInstalledPanel
            builtinTeams={builtinTeams}
            installedTeams={installedTeams}
            onInstalledChange={setInstalledTeams}
          />
        )}

        {levelTab === "skills" && skillsMounted && (
          <Suspense fallback={<div className="expert-empty">{t("common.loading")}</div>}>
            <Skills embedded hubScope={scopeTab} onNavigateTab={onNavigateToChat} />
          </Suspense>
        )}

        {scopeTab === "market" && levelTab === "experts" && (
          <>
            {loading && <div className="expert-empty">{t("common.loading")}</div>}
            {!loading && (
              <div className="expert-market-grid">
                {marketExperts.length === 0 ? (
                  <div className="expert-empty">{t("expert.marketEmpty")}</div>
                ) : marketExperts.map((e) => (
                  <div key={`${e.source ?? "github"}:${e.id}`} className="expert-market-card">
                    <h3>{e.name} <span className={`market-source-badge ${e.source ?? "github"}`}>{sourceLabel(e.source)}</span></h3>
                    <p>{e.description}</p>
                    <code className="team-card-id">{e.id}</code>
                    <button type="button" className="btn btn-primary" onClick={() => void installExpert(e)}>
                      <Download size={14} /> {t("expert.install")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {scopeTab === "market" && levelTab === "teams" && (
          <>
            {loading && <div className="expert-empty">{t("common.loading")}</div>}
            {!loading && (
              <div className="expert-market-grid">
                {marketTeams.length === 0 ? (
                  <div className="expert-empty">{t("expert.marketEmpty")}</div>
                ) : marketTeams.map((team) => {
                  const already = installedIds.has(team.id);
                  return (
                    <div key={`${team.source ?? "github"}:${team.id}`} className="expert-market-card">
                      <h3>{team.name} <span className={`market-source-badge ${team.source ?? "github"}`}>{sourceLabel(team.source)}</span></h3>
                      <p>{team.description}</p>
                      <code className="team-card-id">{team.id}</code>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={already}
                        onClick={() => void installTeam(team)}
                      >
                        <Download size={14} /> {already ? t("expert.installed") : t("expert.install")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { orgSpecFromTeamTemplate } from "../../utils/teamTemplate";
