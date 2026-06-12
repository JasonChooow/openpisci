import { useTranslation } from "react-i18next";
import IDE from "../Pond/IDE";
import "./ProWindow.css";

/**
 * Standalone "professional features" window: hosts the light IDE + Git
 * workspace for a single project directory. Rendered when the app is loaded
 * with `?proview=ide&project=<dir>&session=<id>` (a separate Tauri webview
 * opened via `open_pro_window`). Does not require the Redux store — the IDE
 * talks to the backend directly through `ideApi`.
 */
export default function ProWindow() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const projectDir = params.get("project");
  const sessionId = params.get("session");

  return (
    <div className="pro-window">
      <header className="pro-window-bar">
        <span className="pro-window-title">{t("pro.title")}</span>
        {projectDir && <span className="pro-window-path" title={projectDir}>{projectDir}</span>}
      </header>
      <div className="pro-window-body">
        {projectDir ? (
          <IDE projectDir={projectDir} poolSessionId={sessionId} />
        ) : (
          <div className="pro-window-empty">{t("pro.noProject")}</div>
        )}
      </div>
    </div>
  );
}
