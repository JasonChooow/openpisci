import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function AgentConfigSection() {
  const { t } = useTranslation();
  const { form, update } = useSettingsForm();

  return (
    <>
              {/* Agent Config */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  {t("settings.agentConfig")}
                </h2>
                <div className="form-group">
                  <label className="label">{t("settings.maxIterations")}</label>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    max={200}
                    value={form.max_iterations ?? 50}
                    onChange={(e) => update("max_iterations", Math.min(200, Math.max(10, Number(e.target.value))))}
                  />
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("settings.maxIterationsDesc")}</p>
                </div>
                <div className="form-group">
                  <label className="label">{t("settings.autoCompactThreshold")}</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={10000000}
                    value={form.auto_compact_input_tokens_threshold ?? 400000}
                    onChange={(e) =>
                      update(
                        "auto_compact_input_tokens_threshold",
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                  />
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {t("settings.autoCompactThresholdDesc")}
                  </p>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 12,
                    padding: 14,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--bg-secondary)",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {t("settings.compactionTiers")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                      {t("settings.compactionTiersDesc")}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">{t("settings.compactionMicroPct")}</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={99}
                      value={form.compaction_micro_percent ?? 60}
                      onChange={(e) =>
                        update("compaction_micro_percent", Math.min(99, Math.max(0, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">{t("settings.compactionAutoPct")}</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={99}
                      value={form.compaction_auto_percent ?? 80}
                      onChange={(e) =>
                        update("compaction_auto_percent", Math.min(99, Math.max(1, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">{t("settings.compactionFullPct")}</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={99}
                      value={form.compaction_full_percent ?? 95}
                      onChange={(e) =>
                        update("compaction_full_percent", Math.min(99, Math.max(1, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="label">{t("settings.maxToolResultTokens")}</label>
                    <input
                      className="input"
                      type="number"
                      min={1000}
                      max={400000}
                      value={form.max_tool_result_tokens ?? 16000}
                      onChange={(e) =>
                        update("max_tool_result_tokens", Math.max(1000, Number(e.target.value) || 1000))
                      }
                    />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {t("settings.maxToolResultTokensDesc")}
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="label">{t("settings.summaryModel")}</label>
                    <input
                      className="input"
                      value={form.summary_model ?? ""}
                      onChange={(e) => update("summary_model", e.target.value)}
                      placeholder={t("settings.summaryModelPlaceholder")}
                    />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {t("settings.summaryModelDesc")}
                    </p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="label">{t("settings.llmReadTimeout")}</label>
                    <input
                      className="input"
                      type="number"
                      min={300}
                      max={1800}
                      value={form.llm_read_timeout_secs ?? 600}
                      onChange={(e) => update("llm_read_timeout_secs", Math.min(1800, Math.max(300, Number(e.target.value))))}
                    />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("settings.llmReadTimeoutDesc")}</p>
                  </div>
                  <div className="form-group">
                    <label className="label">{t("settings.koiTimeout")}</label>
                    <input
                      className="input"
                      type="number"
                      min={60}
                      max={7200}
                      value={form.koi_timeout_secs ?? 600}
                      onChange={(e) => update("koi_timeout_secs", Math.min(7200, Math.max(60, Number(e.target.value))))}
                    />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("settings.koiTimeoutDesc")}</p>
                  </div>
                </div>
                <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.enableProjectInstructions")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.enableProjectInstructionsDesc")}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.enable_project_instructions ?? true}
                    onChange={(e) => update("enable_project_instructions", e.target.checked)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">{t("settings.projectInstructionBudget")}</label>
                  <input
                    className="input"
                    type="number"
                    min={512}
                    max={200000}
                    value={form.project_instruction_budget_chars ?? 8000}
                    onChange={(e) =>
                      update(
                        "project_instruction_budget_chars",
                        Math.max(512, Number(e.target.value) || 512)
                      )
                    }
                  />
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {t("settings.projectInstructionBudgetDesc")}
                  </p>
                </div>
                <div className="form-group">
                  <label className="label">{t("settings.piscisPersonalPrompt")}</label>
                  <textarea
                    className="input"
                    rows={6}
                    value={form.piscis_personal_prompt ?? ""}
                    placeholder={t("settings.piscisPersonalPromptPlaceholder")}
                    onChange={(e) => update("piscis_personal_prompt", e.target.value)}
                    style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                  />
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {t("settings.piscisPersonalPromptDesc")}
                  </p>
                </div>
                <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t("settings.heartbeatEnabled")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("settings.heartbeatEnabledDesc")}</div>
                  </div>
                  <input type="checkbox" checked={form.heartbeat_enabled ?? false} onChange={(e) => update("heartbeat_enabled", e.target.checked)} />
                </div>
                {form.heartbeat_enabled && (
                  <>
                    <div className="form-group">
                      <label className="label">{t("settings.heartbeatInterval")}</label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={1440}
                        value={form.heartbeat_interval_mins ?? 30}
                        onChange={(e) => update("heartbeat_interval_mins", Math.max(1, Number(e.target.value)))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="label">{t("settings.heartbeatPrompt")}</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={form.heartbeat_prompt ?? ""}
                        placeholder={t("settings.heartbeatPromptPlaceholder")}
                        onChange={(e) => update("heartbeat_prompt", e.target.value)}
                        style={{ resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </>
                )}
              </section>
    </>
  );
}
