import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function ModelsSection() {
  const { t } = useTranslation();
  const { form, update, showKeys, setShowKeys, llmProviders, setLlmProviders, llmEditIdx, setLlmEditIdx, llmEditForm, setLlmEditForm, llmShowKey, setLlmShowKey, EMPTY_LLM_PROVIDER } = useSettingsForm();

  return (
    <>
              {/* AI Provider */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  {t("settings.aiProvider")}
                </h2>
      
                <div className="form-group">
                  <label className="label">{t("settings.provider")}</label>
                  <select className="input" value={form.provider ?? "anthropic"} onChange={(e) => update("provider", e.target.value)}>
                    <option value="anthropic">{t("settings.providerAnthropic")}</option>
                    <option value="openai">{t("settings.providerOpenai")}</option>
                    <option value="deepseek">{t("settings.providerDeepseek")}</option>
                    <option value="qwen">{t("settings.providerQwen")}</option>
                    <option value="minimax">{t("settings.providerMinimax")}</option>
                    <option value="zhipu">{t("settings.providerZhipu")}</option>
                    <option value="kimi">{t("settings.providerKimi")}</option>
                    <option value="custom">{t("settings.providerCustom")}</option>
                  </select>
                </div>
      
                <div className="form-group">
                  <label className="label">{t("settings.model")}</label>
                  <input className="input" value={form.model ?? ""} onChange={(e) => update("model", e.target.value)}
                    placeholder={
                      form.provider === "anthropic" ? "claude-sonnet-4-5" :
                      form.provider === "openai" ? "gpt-4o" :
                      form.provider === "deepseek" ? "deepseek-chat" :
                      form.provider === "qwen" ? "qwen3-max" :
                      form.provider === "minimax" ? "MiniMax-M2.5" :
                      form.provider === "zhipu" ? "glm-5" :
                      form.provider === "kimi" ? "kimi-k2.5" :
                      t("settings.modelPlaceholder")
                    }
                  />
                </div>
      
                <div className="form-group">
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!form.vision_enabled}
                      onChange={(e) => update("vision_enabled", e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    {t("settings.visionEnabled")}
                  </label>
                  <p className="field-hint" style={{ marginTop: 4 }}>{t("settings.visionEnabledHint")}</p>
                </div>
      
                {/* Vision Model Section */}
                <div style={{ marginTop: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-secondary)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                    {t("settings.visionModelSection")}
                  </div>
      
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={!!form.vision_use_main_llm}
                        onChange={(e) => update("vision_use_main_llm", e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                      {t("settings.visionUseMainLlm")}
                    </label>
                    <p className="field-hint" style={{ marginTop: 2, fontSize: 11 }}>{t("settings.visionUseMainLlmHint")}</p>
                  </div>
      
                  {!form.vision_use_main_llm && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.visionProvider")}</label>
                        <select className="input" value={form.vision_provider || "anthropic"} onChange={(e) => update("vision_provider", e.target.value)}>
                          <option value="anthropic">{t("settings.providerAnthropic")}</option>
                          <option value="openai">{t("settings.providerOpenai")}</option>
                          <option value="deepseek">{t("settings.providerDeepseek")}</option>
                          <option value="qwen">{t("settings.providerQwen")}</option>
                          <option value="minimax">{t("settings.providerMinimax")}</option>
                          <option value="zhipu">{t("settings.providerZhipu")}</option>
                          <option value="kimi">{t("settings.providerKimi")}</option>
                          <option value="custom">{t("settings.providerCustom")}</option>
                        </select>
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.visionModel")}</label>
                        <input className="input" value={form.vision_model ?? ""} onChange={(e) => update("vision_model", e.target.value)}
                          placeholder={t("settings.visionModelPlaceholder")}
                        />
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.visionApiKey")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.vision_api_key ?? ""}
                          onChange={(e) => update("vision_api_key", e.target.value)} placeholder="sk-..." />
                      </div>
      
                      <div className="form-group">
                        <label className="label">{t("settings.visionBaseUrl")}</label>
                        <input className="input" value={form.vision_base_url ?? ""} onChange={(e) => update("vision_base_url", e.target.value)}
                          placeholder="https://api.openai.com/v1" />
                      </div>
                    </>
                  )}
      
                  {/* Status badge */}
                  <div style={{ marginTop: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: (form.vision_use_main_llm && form.vision_enabled) || (!form.vision_use_main_llm && form.vision_provider && form.vision_model && form.vision_api_key)
                        ? "#4ade80" : "#f87171"
                    }} />
                    <span style={{ color: (form.vision_use_main_llm && form.vision_enabled) || (!form.vision_use_main_llm && form.vision_provider && form.vision_model && form.vision_api_key)
                      ? "#4ade80" : "#f87171" }}>
                      {(form.vision_use_main_llm && form.vision_enabled) || (!form.vision_use_main_llm && form.vision_provider && form.vision_model && form.vision_api_key)
                        ? t("settings.visionStatusOk") : t("settings.visionStatusMissing")}
                    </span>
                  </div>
                </div>
      
                <div className="form-group">
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!form.enable_streaming}
                      onChange={(e) => update("enable_streaming", e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    {t("settings.enableStreaming")}
                  </label>
                  <p className="field-hint" style={{ marginTop: 4 }}>{t("settings.enableStreamingHint")}</p>
                </div>
      
                {(form.provider === "anthropic" || !form.provider) && (
                  <div className="form-group">
                    <label className="label">{t("settings.anthropicKey")}</label>
                    <div style={{ position: "relative" }}>
                      <input className="input" type={showKeys ? "text" : "password"} value={form.anthropic_api_key ?? ""}
                        onChange={(e) => update("anthropic_api_key", e.target.value)} placeholder="sk-ant-..." style={{ paddingRight: 80 }} />
                      <button style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
                        onClick={() => setShowKeys(!showKeys)}>{showKeys ? t("common.hide") : t("common.show")}</button>
                    </div>
                  </div>
                )}
      
                {form.provider === "openai" && (
                  <div className="form-group">
                    <label className="label">{t("settings.openaiKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.openai_api_key ?? ""}
                      onChange={(e) => update("openai_api_key", e.target.value)} placeholder="sk-..." />
                  </div>
                )}
      
                {form.provider === "deepseek" && (
                  <div className="form-group">
                    <label className="label">{t("settings.deepseekKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.deepseek_api_key ?? ""}
                      onChange={(e) => update("deepseek_api_key", e.target.value)} placeholder="sk-..." />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("settings.deepseekKeyHelp")}</a>
                    </p>
                  </div>
                )}
      
                {form.provider === "qwen" && (
                  <div className="form-group">
                    <label className="label">{t("settings.qwenKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.qwen_api_key ?? ""}
                      onChange={(e) => update("qwen_api_key", e.target.value)} placeholder="sk-..." />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      Base URL: <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>
                      {" · "}<a href="https://bailian.console.aliyun.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("settings.qwenKeyHelp")}</a>
                    </p>
                  </div>
                )}
      
                {form.provider === "minimax" && (
                  <div className="form-group">
                    <label className="label">{t("settings.minimaxKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.minimax_api_key ?? ""}
                      onChange={(e) => update("minimax_api_key", e.target.value)} placeholder="eyJ..." />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      Base URL: <code>https://api.minimax.io/v1</code>
                      {" · "}<a href="https://platform.minimax.io" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("settings.minimaxKeyHelp")}</a>
                    </p>
                  </div>
                )}
      
                {form.provider === "zhipu" && (
                  <div className="form-group">
                    <label className="label">{t("settings.zhipuKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.zhipu_api_key ?? ""}
                      onChange={(e) => update("zhipu_api_key", e.target.value)} placeholder="API Key..." />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      Base URL: <code>https://api.z.ai/api/paas/v4</code>
                      {" · "}<a href="https://z.ai" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("settings.zhipuKeyHelp")}</a>
                    </p>
                  </div>
                )}
      
                {form.provider === "kimi" && (
                  <div className="form-group">
                    <label className="label">{t("settings.kimiKey")}</label>
                    <input className="input" type={showKeys ? "text" : "password"} value={form.kimi_api_key ?? ""}
                      onChange={(e) => update("kimi_api_key", e.target.value)} placeholder="sk-..." />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      Base URL: <code>https://api.moonshot.cn/v1</code>
                      {" · "}<a href="https://platform.moonshot.cn" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("settings.kimiKeyHelp")}</a>
                    </p>
                  </div>
                )}
      
                {form.provider === "custom" && (
                  <>
                    <div className="form-group">
                      <label className="label">{t("settings.customApiKey")}</label>
                      <input className="input" type={showKeys ? "text" : "password"} value={form.openai_api_key ?? ""}
                        onChange={(e) => update("openai_api_key", e.target.value)} placeholder="API Key" />
                      <p className="field-hint" style={{ marginTop: 4 }}>{t("settings.customApiKeyHint")}</p>
                    </div>
                    <div className="form-group">
                      <label className="label">{t("settings.customBaseUrl")}</label>
                      <input className="input" value={form.custom_base_url ?? ""} onChange={(e) => update("custom_base_url", e.target.value)}
                        placeholder={t("settings.customBaseUrlPlaceholder")} />
                    </div>
                  </>
                )}
      
                <div className="form-group">
                  <label className="label">{t("settings.maxTokens")}</label>
                  <input className="input" type="number" value={form.max_tokens ?? 8192} onChange={(e) => update("max_tokens", parseInt(e.target.value))} min={256} max={65536} />
                  <span className="hint">{t("settings.maxTokensHint")}</span>
                </div>
                <div className="form-group">
                  <label className="label">{t("settings.contextWindow")}</label>
                  <input
                    className="input"
                    type="number"
                    value={form.context_window ?? 0}
                    onChange={(e) => update("context_window", parseInt(e.target.value) || 0)}
                    min={0}
                    max={2000000}
                    step={1000}
                  />
                  <span className="hint">{t("settings.contextWindowHint")}</span>
                </div>
      
                {/* Named LLM Providers — lives inside AI Provider section */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>
                    🔑 {t("settings.namedLlmTitle")}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("settings.namedLlmDesc")}
                  </p>
      
                  {llmProviders.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {llmProviders.map((p, idx) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                          <span style={{ fontSize: 16 }}>🔑</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                              {p.label || p.id}
                              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11, marginLeft: 8 }}>[{p.id}]</span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {p.provider} · {p.model || t("settings.namedLlmNoModel")}
                              {p.base_url ? ` · ${p.base_url}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn" style={{ fontSize: 11, padding: "3px 10px", border: "1px solid var(--border)" }}
                              onClick={() => { setLlmEditIdx(idx); setLlmEditForm({ ...p, api_key: "" }); setLlmShowKey(false); }}>
                              {t("settings.namedLlmEdit")}
                            </button>
                            <button className="btn" style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #dc3545", color: "#dc3545" }}
                              onClick={() => setLlmProviders(prev => prev.filter((_, i) => i !== idx))}>
                              {t("settings.namedLlmDelete")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
      
                  {llmEditIdx !== null ? (
                    <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>
                        {llmEditIdx === -1 ? t("settings.namedLlmAddTitle") : t("settings.namedLlmEditTitle")}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.namedLlmIdLabel")}</label>
                          <input className="input" value={llmEditForm.id} onChange={e => setLlmEditForm(f => ({ ...f, id: e.target.value }))}
                            placeholder="my-gpt4" disabled={llmEditIdx !== -1} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.namedLlmLabelLabel")}</label>
                          <input className="input" value={llmEditForm.label} onChange={e => setLlmEditForm(f => ({ ...f, label: e.target.value }))}
                            placeholder={t("settings.namedLlmLabelPlaceholder")} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.namedLlmProviderTypeLabel")}</label>
                          <select className="input" value={llmEditForm.provider} onChange={e => setLlmEditForm(f => ({ ...f, provider: e.target.value }))}>
                            <option value="anthropic">{t("settings.providerAnthropic")}</option>
                            <option value="openai">{t("settings.providerOpenai")}</option>
                            <option value="deepseek">{t("settings.providerDeepseek")}</option>
                            <option value="qwen">{t("settings.providerQwen")}</option>
                            <option value="minimax">{t("settings.providerMinimax")}</option>
                            <option value="zhipu">{t("settings.providerZhipu")}</option>
                            <option value="kimi">{t("settings.providerKimi")}</option>
                            <option value="custom">{t("settings.providerCustom")}</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.namedLlmModelLabel")}</label>
                          <input className="input" value={llmEditForm.model} onChange={e => setLlmEditForm(f => ({ ...f, model: e.target.value }))}
                            placeholder={
                              llmEditForm.provider === "anthropic" ? "claude-opus-4-5" :
                              llmEditForm.provider === "openai" ? "gpt-4o" :
                              llmEditForm.provider === "deepseek" ? "deepseek-chat" :
                              llmEditForm.provider === "qwen" ? "qwen3-max" :
                              llmEditForm.provider === "minimax" ? "MiniMax-M2.5" :
                              llmEditForm.provider === "zhipu" ? "glm-5" :
                              llmEditForm.provider === "kimi" ? "kimi-k2.5" :
                              "model-name"
                            } />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                          <label className="label">
                            API Key
                            {llmEditIdx !== -1 && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{t("settings.namedLlmApiKeyKeepHint")}</span>}
                          </label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input className="input" style={{ flex: 1 }} type={llmShowKey ? "text" : "password"}
                              value={llmEditForm.api_key} onChange={e => setLlmEditForm(f => ({ ...f, api_key: e.target.value }))}
                              placeholder={llmEditIdx !== -1 ? t("settings.namedLlmApiKeyKeepPlaceholder") : "sk-..."} />
                            <button className="btn" style={{ padding: "0 10px", border: "1px solid var(--border)" }}
                              onClick={() => setLlmShowKey(v => !v)}>
                              {llmShowKey ? "🙈" : "👁️"}
                            </button>
                          </div>
                        </div>
                        {llmEditForm.provider === "custom" && (
                          <div className="form-group" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                            <label className="label">Base URL *</label>
                            <input className="input" value={llmEditForm.base_url} onChange={e => setLlmEditForm(f => ({ ...f, base_url: e.target.value }))}
                              placeholder="https://api.example.com/v1" />
                          </div>
                        )}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label">{t("settings.namedLlmMaxTokensLabel")}</label>
                          <input className="input" type="number" value={llmEditForm.max_tokens}
                            onChange={e => setLlmEditForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 0 }))} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12 }}
                          onClick={() => {
                            if (!llmEditForm.id.trim() || !llmEditForm.model.trim()) return;
                            if (llmEditIdx === -1) {
                              if (llmProviders.some(p => p.id === llmEditForm.id.trim())) return;
                              setLlmProviders(prev => [...prev, llmEditForm]);
                            } else {
                              setLlmProviders(prev => prev.map((p, i) => i === llmEditIdx ? { ...llmEditForm } : p));
                            }
                            setLlmEditIdx(null);
                          }}>
                          {t("common.save")}
                        </button>
                        <button className="btn" style={{ fontSize: 12, border: "1px solid var(--border)" }}
                          onClick={() => setLlmEditIdx(null)}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn" style={{ fontSize: 12, padding: "6px 14px", border: "1px solid var(--border)" }}
                      onClick={() => { setLlmEditIdx(-1); setLlmEditForm(EMPTY_LLM_PROVIDER); setLlmShowKey(false); }}>
                      {t("settings.namedLlmAddBtn")}
                    </button>
                  )}
                </div>
              </section>
    </>
  );
}
