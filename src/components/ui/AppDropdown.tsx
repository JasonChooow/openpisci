import { useEffect, useMemo, useRef, useState } from "react";
import "./AppDropdown.css";

export type AppMenuItem = {
  id: string;
  label: string;
  icon?: string;
  selected?: boolean;
  action?: boolean;
  /** Non-interactive row (e.g. current path). */
  disabled?: boolean;
  /** Checkbox-style toggle row; keeps menu open unless closeOnSelect is true. */
  toggle?: boolean;
  /** Visual separator row. */
  divider?: boolean;
  /** Non-selectable section heading. */
  section?: boolean;
  /** Additional text used by search. */
  searchText?: string;
  /** Override dropdown close-on-select for this row. */
  keepOpen?: boolean;
};

export type AppDropdownProps = {
  menuId: string;
  triggerLabel: string;
  triggerTitle?: string;
  items: AppMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  disabled?: boolean;
  icon?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  closeOnSelect?: boolean;
  variant?: "default" | "wide" | "toolbar" | "form" | "compact";
  /** Panel opens above trigger (composer) or below (toolbars). */
  placement?: "above" | "below";
};

export default function AppDropdown({
  menuId,
  icon,
  triggerLabel,
  triggerTitle,
  items,
  open,
  onOpenChange,
  onSelect,
  disabled = false,
  searchPlaceholder,
  emptyLabel,
  closeOnSelect = true,
  variant = "default",
  placement = "below",
}: AppDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (searchPlaceholder || items.length >= 6) {
      searchRef.current?.focus();
    }
  }, [open, searchPlaceholder, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (item.divider || item.section) return false;
      const haystack = `${item.label} ${item.searchText ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const showSearch = items.length >= 6 || Boolean(searchPlaceholder);
  const panelPlacementClass =
    placement === "above" ? "app-dropdown-panel-above" : "app-dropdown-panel-below";

  return (
    <div
      ref={rootRef}
      className={`app-dropdown app-dropdown-${variant}${open ? " app-dropdown-open" : ""}`}
      data-menu={menuId}
    >
      <button
        type="button"
        className="app-dropdown-trigger select-control"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
      >
        {icon && (
          <span className="app-dropdown-trigger-icon" aria-hidden>
            {icon}
          </span>
        )}
        <span className="app-dropdown-trigger-label" title={triggerTitle ?? triggerLabel}>
          {triggerLabel}
        </span>
      </button>
      {open && (
        <div className={`app-dropdown-panel ${panelPlacementClass}`} role="listbox">
          {showSearch && (
            <div className="app-dropdown-header">
              <input
                ref={searchRef}
                type="search"
                className="app-dropdown-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="app-dropdown-list">
            {filtered.length === 0 ? (
              <div className="app-dropdown-empty">{emptyLabel ?? "—"}</div>
            ) : (
              filtered.map((item) => {
                if (item.divider) {
                  return <div key={item.id} className="app-dropdown-divider" role="separator" />;
                }
                if (item.section) {
                  return <div key={item.id} className="app-dropdown-section" role="presentation">{item.label}</div>;
                }
                const rowClass = `app-dropdown-item${item.selected ? " selected" : ""}${item.action ? " action" : ""}${item.disabled ? " info" : ""}${item.toggle ? " toggle" : ""}`;
                if (item.disabled) {
                  return (
                    <div key={item.id} role="presentation" className={rowClass} title={item.label}>
                      {item.icon && (
                        <span className="app-dropdown-item-icon" aria-hidden>
                          {item.icon}
                        </span>
                      )}
                      <span className="app-dropdown-item-label">{item.label}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    role={item.toggle ? "menuitemcheckbox" : "option"}
                    aria-selected={item.selected}
                    aria-checked={item.toggle ? item.selected : undefined}
                    className={rowClass}
                    onClick={() => {
                      onSelect(item.id);
                      const shouldClose = item.keepOpen === true
                        ? false
                        : item.keepOpen === false
                          ? true
                          : item.toggle
                            ? false
                            : closeOnSelect;
                      if (shouldClose) onOpenChange(false);
                    }}
                  >
                    {item.icon && !item.toggle && (
                      <span className="app-dropdown-item-icon" aria-hidden>
                        {item.icon}
                      </span>
                    )}
                    <span className="app-dropdown-item-label">{item.label}</span>
                    {item.toggle ? (
                      <input
                        type="checkbox"
                        className="app-dropdown-item-checkbox"
                        readOnly
                        tabIndex={-1}
                        checked={Boolean(item.selected)}
                        aria-hidden
                      />
                    ) : (
                      item.selected && <span className="app-dropdown-item-check">✓</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
