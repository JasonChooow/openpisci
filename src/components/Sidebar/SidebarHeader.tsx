import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Filter,
} from "lucide-react";
import { brand } from "../../brand";
import TaskSearchPanel from "./TaskSearchPanel";
import type { TaskDateFilter } from "./taskFilters";

const ICON = 16;
const ICON_COLLAPSED = 11;
const DATE_FILTERS: TaskDateFilter[] = ["all", "today", "last7", "last30"];

export type SidebarHeaderProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  dateFilter: TaskDateFilter;
  onDateFilterChange: (f: TaskDateFilter) => void;
  onNewAssistantTask: () => void;
  onSelectChat: (id: string) => void;
};

export default function SidebarHeader({
  collapsed,
  onToggleCollapsed,
  dateFilter,
  onDateFilterChange,
  onNewAssistantTask,
  onSelectChat,
}: SidebarHeaderProps) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchOpen(false);
    setFilterOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  if (collapsed) {
    return (
      <div className="sidebar-header sidebar-header-collapsed">
        <button
          type="button"
          className="sidebar-icon-btn sidebar-icon-btn-sm"
          title={t("sidebar.expand")}
          onClick={onToggleCollapsed}
        >
          <PanelLeftOpen size={ICON_COLLAPSED} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="sidebar-icon-btn sidebar-icon-btn-sm sidebar-icon-btn-accent"
          title={t("sidebar.newMenu")}
          onClick={onNewAssistantTask}
        >
          <Plus size={ICON_COLLAPSED} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-header">
      <div className="sidebar-brand">
        <img src={brand.logoPath} className="logo" alt={brand.displayNameZh} />
        <span className="app-name">{brand.productName}</span>
      </div>
      <div className="sidebar-header-actions">
        <div className="sidebar-search-anchor" ref={searchRef}>
          <button
            type="button"
            className={`sidebar-icon-btn${searchOpen ? " active" : ""}`}
            title={t("sidebar.searchTasks")}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search size={ICON} strokeWidth={1.5} />
          </button>
          {searchOpen && (
            <TaskSearchPanel
              onSelectChat={(id) => {
                onSelectChat(id);
                setSearchOpen(false);
              }}
            />
          )}
        </div>
        <div className="sidebar-filter-anchor" ref={filterRef}>
          <button
            type="button"
            className={`sidebar-icon-btn${dateFilter !== "all" ? " active" : ""}`}
            title={t("sidebar.filterTasks")}
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
          >
            <Filter size={ICON} strokeWidth={1.5} />
          </button>
          {filterOpen && (
            <div className="sidebar-filter-menu" role="listbox" aria-label={t("sidebar.filterTasks")}>
              {DATE_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={dateFilter === id}
                  className={`sidebar-filter-item${dateFilter === id ? " active" : ""}`}
                  onClick={() => {
                    onDateFilterChange(id);
                    setFilterOpen(false);
                  }}
                >
                  {t(`sidebar.filter.${id}`)}
                  {dateFilter === id && <span className="sidebar-filter-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="sidebar-icon-btn" title={t("sidebar.collapse")} onClick={onToggleCollapsed}>
          <PanelLeftClose size={ICON} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
