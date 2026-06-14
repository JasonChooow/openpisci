import type { ReactNode } from "react";

type SettingsPanelLayoutProps = {
  title: string;
  icon?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function SettingsPanelLayout({
  title,
  icon,
  subtitle,
  children,
  actions,
}: SettingsPanelLayoutProps) {
  return (
    <div className="page settings-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {icon ? `${icon} ` : ""}{title}
          </h1>
          {subtitle && (
            <p className="settings-panel-subtitle">{subtitle}</p>
          )}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      <div className="page-body settings-panel-body">{children}</div>
    </div>
  );
}
