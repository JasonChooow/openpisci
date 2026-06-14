import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";
import { FONT_SCALE_OPTIONS, setFontScale, type FontScale } from "../../../utils/fontScale";

export default function InterfaceSection() {
  const { t } = useTranslation();
  const { form, update, theme, setTheme, fontScale, setFontScaleState } = useSettingsForm();

  return (
    <>
              {/* Interface */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  {t("settings.interface")}
                </h2>
                <div className="form-group">
                  <label className="label">{t("settings.language")}</label>
                  <select className="input" value={form.language ?? "zh"} onChange={(e) => update("language", e.target.value)}>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
      
                <div className="form-group">
                  <label className="label">{t("settings.fontScale")}</label>
                  <select
                    className="input"
                    value={fontScale}
                    onChange={(e) => {
                      const next = Number(e.target.value) as FontScale;
                      setFontScaleState(next);
                      setFontScale(next);
                    }}
                  >
                    {FONT_SCALE_OPTIONS.map((scale) => (
                      <option key={scale} value={scale}>
                        {t(`settings.fontScale${String(scale).replace(".", "")}`)}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    {t("settings.fontScaleHint")}
                  </p>
                </div>
      
                <div className="form-group">
                  <label className="label">{t("settings.theme")}</label>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    {/* 紫罗兰主题卡片 */}
                    <button
                      onClick={() => setTheme("violet")}
                      style={{
                        flex: 1,
                        padding: "14px 12px",
                        border: `2px solid ${theme === "violet" ? "#7c6af7" : "transparent"}`,
                        borderRadius: 10,
                        background: theme === "violet" ? "rgba(124,106,247,0.08)" : "#1a1a22",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        outline: "none",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* 色块预览 */}
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 8 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#0f0f13", border: "1px solid #333345" }} />
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#7c6af7" }} />
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#9585ff" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme === "violet" ? "#9585ff" : "var(--text-secondary)" }}>
                        {t("settings.themeViolet")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {t("settings.themeVioletDesc")}
                      </div>
                      {theme === "violet" && (
                        <div style={{ position: "absolute", top: 6, right: 8, color: "#7c6af7", fontSize: 14, fontWeight: 700 }}>✓</div>
                      )}
                    </button>
      
                    {/* 黑金主题卡片 */}
                    <button
                      onClick={() => setTheme("gold")}
                      style={{
                        flex: 1,
                        padding: "14px 12px",
                        border: `2px solid ${theme === "gold" ? "#c9a84c" : "transparent"}`,
                        borderRadius: 10,
                        background: theme === "gold" ? "rgba(201,168,76,0.06)" : "#111110",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        outline: "none",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 8 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#0a0a08", border: "1px solid #2a2820" }} />
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#c9a84c" }} />
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#dfc070" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme === "gold" ? "#c9a84c" : "var(--text-secondary)" }}>
                        {t("settings.themeGold")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {t("settings.themeGoldDesc")}
                      </div>
                      {theme === "gold" && (
                        <div style={{ position: "absolute", top: 6, right: 8, color: "#c9a84c", fontSize: 14, fontWeight: 700 }}>✓</div>
                      )}
                    </button>
                  </div>
                </div>
              </section>
    </>
  );
}
