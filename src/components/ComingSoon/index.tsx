import type { ReactNode } from "react";
import "./ComingSoon.css";

export type ComingSoonProps = {
  icon: ReactNode;
  title: string;
  description: string;
  hint?: string;
};

export default function ComingSoon({ icon, title, description, hint }: ComingSoonProps) {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="page-body coming-soon">
        <div className="coming-soon-card">
          <div className="coming-soon-icon">{icon}</div>
          <h2 className="coming-soon-title">{title}</h2>
          <p className="coming-soon-desc">{description}</p>
          {hint && <p className="coming-soon-hint">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
