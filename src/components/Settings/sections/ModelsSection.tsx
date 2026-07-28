import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";

export default function ModelsSection() {
  const { t } = useTranslation();
  const { form, update } = useSettingsForm();

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        {t("settings.aiProvider")}
      </h2>

      <div className="form-group">
        <label className="label">{t("settings.provider")}</label>
        <div className="input" aria-readonly="true">官方云端</div>
        <p className="field-hint" style={{ marginTop: 4 }}>
          模型列表和访问凭据由官方云端统一管理，无需配置本地 API Key。
        </p>
      </div>

      <div className="form-group">
        <label className="label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!form.vision_enabled}
            onChange={(event) => update("vision_enabled", event.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          {t("settings.visionEnabled")}
        </label>
        <p className="field-hint" style={{ marginTop: 4 }}>{t("settings.visionEnabledHint")}</p>
      </div>

      <div className="form-group">
        <label className="label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!form.enable_streaming}
            onChange={(event) => update("enable_streaming", event.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          {t("settings.enableStreaming")}
        </label>
        <p className="field-hint" style={{ marginTop: 4 }}>{t("settings.enableStreamingHint")}</p>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="cloud-max-tokens">{t("settings.maxTokens")}</label>
        <input
          id="cloud-max-tokens"
          className="input"
          type="number"
          value={form.max_tokens ?? 8192}
          onChange={(event) => update("max_tokens", parseInt(event.target.value, 10))}
          min={256}
          max={65536}
        />
        <span className="hint">{t("settings.maxTokensHint")}</span>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="cloud-context-window">{t("settings.contextWindow")}</label>
        <input
          id="cloud-context-window"
          className="input"
          type="number"
          value={form.context_window ?? 0}
          onChange={(event) => update("context_window", parseInt(event.target.value, 10) || 0)}
          min={0}
          max={2000000}
          step={1000}
        />
        <span className="hint">{t("settings.contextWindowHint")}</span>
      </div>
    </section>
  );
}
