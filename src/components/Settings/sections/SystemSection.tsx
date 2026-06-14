import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { localizedDependencyRemediation, localizedPrivilegeElevationRemediation } from "../../../utils/systemDependencies";

export default function SystemSection() {
  const { t } = useTranslation();
  const { runtimes, runtimesLoading, runtimesSettingKey, handleCheckRuntimes, handleSelectRuntimePath, systemDependencies, systemDependenciesLoading, privilegeElevationChecks, privilegeElevationLoading, systemDependencyActionKey, systemDependencyActionError, handleRunDependencyAction, dependencyActionLabel } = useSettingsForm();

  return (
    <>
              {/* ── Runtime Environment ───────────────────────────────────────── */}
              <section className="settings-section">
                <h3 className="settings-section-title">{t("settings.runtimeSection")}</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  {t("settings.runtimeSectionDesc")}
                </p>
      
                <button
                  className="btn"
                  onClick={handleCheckRuntimes}
                  disabled={runtimesLoading}
                  style={{ marginBottom: 16, border: "1px solid var(--border)", fontSize: 13 }}
                >
                  {runtimesLoading ? t("common.loading") : t("settings.checkRuntimes")}
                </button>
      
                {runtimes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {runtimes.map((item) => {
                      // Keys must match what the backend uses in runtime_paths HashMap
                      const runtimeKey = item.name === "Node.js" ? "node"
                        : item.name === "npm" ? "npm"
                        : item.name === "Python" ? "python"
                        : item.name === "pip" ? "pip"
                        : item.name === "Git" ? "git"
                        : item.name.toLowerCase();
                      const isSetting = runtimesSettingKey === runtimeKey;
                      return (
                        <div
                          key={item.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            background: "var(--bg-secondary)",
                          }}
                        >
                          <span style={{ fontSize: 16, flexShrink: 0 }}>
                            {item.available ? "✅" : "❌"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                                {item.name}
                              </span>
                              {item.available && item.version && (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  {item.version}
                                </span>
                              )}
                              {!item.available && (
                                <span style={{ fontSize: 11, color: "#dc3545" }}>
                                  {t("settings.runtimeNotFound")}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              {item.hint}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                              className="btn"
                              onClick={() => handleSelectRuntimePath(runtimeKey, item.name)}
                              disabled={isSetting}
                              title={t("settings.runtimeSelectPath")}
                              style={{ fontSize: 11, padding: "3px 10px", border: "1px solid var(--border)" }}
                            >
                              {isSetting ? "…" : t("settings.runtimeSelectPath")}
                            </button>
                            {!item.available && (
                              <button
                                className="btn btn-primary"
                                onClick={() => openUrl(item.download_url).catch(() => window.open(item.download_url, "_blank"))}
                                style={{ fontSize: 11, padding: "3px 10px" }}
                              >
                                {t("settings.runtimeDownload")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
      
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                    {t("settings.systemDepsTitle")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("settings.systemDepsDesc")}
                  </div>
                  {systemDependencyActionError && (
                    <div style={{ fontSize: 12, color: "#dc3545", marginBottom: 12 }}>
                      {systemDependencyActionError}
                    </div>
                  )}
      
                  {systemDependenciesLoading && systemDependencies.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("common.loading")}</div>
                  ) : systemDependencies.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {systemDependencies.map((item) => {
                        const icon = item.status === "ok" ? "✅" : item.status === "missing" ? "❌" : "⚠️";
                        const badgeBg = item.status === "ok"
                          ? "rgba(40, 167, 69, 0.12)"
                          : item.status === "missing"
                            ? "rgba(220, 53, 69, 0.12)"
                            : "rgba(255, 193, 7, 0.12)";
                        const badgeColor = item.status === "ok"
                          ? "#28a745"
                          : item.status === "missing"
                            ? "#dc3545"
                            : "#b8860b";
                        const statusLabel = item.status === "ok"
                          ? t("settings.dependencyStatusOk")
                          : item.status === "missing"
                            ? t("settings.dependencyStatusMissing")
                            : t("settings.dependencyStatusWarning");
                        return (
                          <div
                            key={item.key}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "10px 14px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-secondary)",
                            }}
                          >
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                                  {item.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    background: badgeBg,
                                    color: badgeColor,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {statusLabel}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  {item.required ? t("settings.dependencyRequired") : t("settings.dependencyRecommended")}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  {item.feature}
                                </span>
                              </div>
                              {item.details && (
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                  {item.details}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                                {item.hint}
                              </div>
                              {localizedDependencyRemediation(t, item) && !item.available && (
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                                  {localizedDependencyRemediation(t, item)}
                                </div>
                              )}
                              {!item.available && item.action && (
                                <div style={{ marginTop: 8 }}>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => handleRunDependencyAction(item)}
                                    disabled={systemDependencyActionKey === item.key}
                                    style={{ fontSize: 11, padding: "3px 10px" }}
                                  >
                                    {systemDependencyActionKey === item.key
                                      ? t("common.loading")
                                      : dependencyActionLabel(item)}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {t("settings.systemDepsHint")}
                    </div>
                  )}
                </div>
      
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                    {t("settings.privElevationTitle")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("settings.privElevationDesc")}
                  </div>
      
                  {privilegeElevationLoading && privilegeElevationChecks.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("common.loading")}</div>
                  ) : privilegeElevationChecks.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {privilegeElevationChecks.map((item) => {
                        const icon = item.status === "ok" ? "✅" : item.status === "missing" ? "❌" : "⚠️";
                        const badgeBg = item.status === "ok"
                          ? "rgba(40, 167, 69, 0.12)"
                          : item.status === "missing"
                            ? "rgba(220, 53, 69, 0.12)"
                            : "rgba(255, 193, 7, 0.12)";
                        const badgeColor = item.status === "ok"
                          ? "#28a745"
                          : item.status === "missing"
                            ? "#dc3545"
                            : "#b8860b";
                        const statusLabel = item.status === "ok"
                          ? t("settings.dependencyStatusOk")
                          : item.status === "missing"
                            ? t("settings.dependencyStatusMissing")
                            : t("settings.dependencyStatusWarning");
                        return (
                          <div
                            key={item.key}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "10px 14px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-secondary)",
                            }}
                          >
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                                  {item.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    background: badgeBg,
                                    color: badgeColor,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {statusLabel}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  {item.required ? t("settings.dependencyRequired") : t("settings.dependencyRecommended")}
                                </span>
                              </div>
                              {item.details && (
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                  {item.details}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                                {item.hint}
                              </div>
                              {localizedPrivilegeElevationRemediation(t, item) && !item.available && (
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                                  {localizedPrivilegeElevationRemediation(t, item)}
                                </div>
                              )}
                              {!item.available && item.action && (
                                <div style={{ marginTop: 8 }}>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => handleRunDependencyAction(item)}
                                    disabled={systemDependencyActionKey === item.key}
                                    style={{ fontSize: 11, padding: "3px 10px" }}
                                  >
                                    {systemDependencyActionKey === item.key
                                      ? t("common.loading")
                                      : dependencyActionLabel(item)}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {t("settings.privElevationHint")}
                    </div>
                  )}
                </div>
              </section>
    </>
  );
}
