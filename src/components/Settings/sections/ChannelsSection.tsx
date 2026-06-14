import { useTranslation } from "react-i18next";
import { useSettingsForm } from "../../SettingsHub/useSettingsForm";
import { open as openUrl } from "@tauri-apps/plugin-shell";

export default function ChannelsSection() {
  const { t } = useTranslation();
  const { form, update, showKeys, setShowKeys, gatewayStatus, gatewayMsg, gatewayConnecting, gatewayDisconnecting, handleGatewayConnect, handleGatewayDisconnect, statusBadge, wechatQr, wechatBindState, wechatBindError, handleWechatBind, renderEnterpriseCapabilityPanel } = useSettingsForm();

  return (
    <>
              {/* IM Gateway */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  {t("settings.imChannels")}
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  {t("settings.imChannelsDesc")}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 6, lineHeight: 1.6 }}>
                  {t("settings.imLayerExplain")}
                </p>
      
                <div style={{ marginBottom: 16, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{t("settings.imAutoMinimalMode")}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{t("settings.imAutoMinimalModeHint")}</div>
                    </div>
                    <input type="checkbox" checked={form.im_auto_minimal_mode ?? true} onChange={(e) => update("im_auto_minimal_mode", e.target.checked)} />
                  </label>
                </div>
      
                <div className="form-group" style={{ marginBottom: 16, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-secondary)" }}>
                  <label className="label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: "block" }}>
                    {t("settings.imMessageMode")}
                  </label>
                  <select
                    className="input"
                    value={form.im_message_mode ?? "queue"}
                    onChange={(e) => update("im_message_mode", e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="queue">{t("settings.imMessageModeQueue")}</option>
                    <option value="cancel">{t("settings.imMessageModeCancel")}</option>
                  </select>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                    {t("settings.imMessageModeHint")}
                  </p>
                </div>
      
                {gatewayStatus.length > 0 && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6, fontSize: 13 }}>
                    {gatewayStatus.map((ch) => (
                      <div key={ch.name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{ch.name}</span>
                        {statusBadge(ch.status)}
                      </div>
                    ))}
                  </div>
                )}
      
                {gatewayMsg && (
                  <div style={{ marginBottom: 12, padding: "6px 12px", background: gatewayMsg.includes("失败") || gatewayMsg.includes("failed") || gatewayMsg.includes("Failed") ? "rgba(220,53,69,0.12)" : "rgba(40,167,69,0.12)", borderRadius: 6, fontSize: 13, color: gatewayMsg.includes("失败") || gatewayMsg.includes("failed") || gatewayMsg.includes("Failed") ? "#ff6b6b" : "#28a745" }}>
                    {gatewayMsg}
                  </div>
                )}
      
                {/* Feishu */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.feishu_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.feishu")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.feishuDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.feishu_enabled} onChange={(e) => update("feishu_enabled", e.target.checked)} />
                  </div>
                  {form.feishu_enabled && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4, marginBottom: 6 }}>
                        {t("settings.imCredsLabel")}
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.feishuAppId")}</label>
                        <input className="input" value={form.feishu_app_id} onChange={(e) => update("feishu_app_id", e.target.value)} placeholder="cli_xxxxxxxxxxxxxxxx" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.feishuAppSecret")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.feishu_app_secret} onChange={(e) => update("feishu_app_secret", e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 }}>
                        {t("settings.imChannelLabel")}
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.feishuDomain")}</label>
                        <select className="input" value={form.feishu_domain} onChange={(e) => update("feishu_domain", e.target.value)}>
                          <option value="feishu">{t("settings.feishuDomainCN")}</option>
                          <option value="lark">{t("settings.feishuDomainIntl")}</option>
                        </select>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.feishuHelp")}</p>
                      {renderEnterpriseCapabilityPanel(
                        "feishu",
                        t("settings.feishuEnterpriseTitle"),
                        t("settings.feishuEnterpriseDesc"),
                        { showOpenTools: true }
                      )}
                    </>
                  )}
                </div>
      
                {/* WeChat (OpenClaw-compat) */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.wechat_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.wechat")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.wechatDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.wechat_enabled} onChange={(e) => update("wechat_enabled", e.target.checked)} />
                  </div>
                  {form.wechat_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.wechatGatewayToken")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.wechat_gateway_token} onChange={(e) => update("wechat_gateway_token", e.target.value)} placeholder="" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.wechatGatewayPort")}</label>
                        <input className="input" type="number" value={form.wechat_gateway_port} onChange={(e) => update("wechat_gateway_port", parseInt(e.target.value) || 18789)} placeholder="18789" />
                      </div>
      
                      {/* Bind button and QR display */}
                      <div style={{ marginTop: 12 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 13 }}
                          disabled={wechatBindState === "loading"}
                          onClick={handleWechatBind}
                        >
                          {wechatBindState === "loading"
                            ? t("settings.wechatBindLoading")
                            : t("settings.wechatBindBtn")}
                        </button>
      
                        {(wechatBindState === "scan" || wechatBindState === "scaned") && wechatQr && (
                          <div style={{ marginTop: 12, textAlign: "center" }}>
                            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                              {wechatBindState === "scaned"
                                ? t("settings.wechatScaned")
                                : t("settings.wechatBindScanPrompt")}
                            </p>
                            <img
                              src={wechatQr}
                              alt="WeChat QR"
                              style={{ width: 200, height: 200, border: "1px solid var(--border)", borderRadius: 8, opacity: wechatBindState === "scaned" ? 0.4 : 1 }}
                            />
                          </div>
                        )}
      
                        {wechatBindState === "success" && (
                          <p style={{ fontSize: 13, color: "var(--success, #22c55e)", marginTop: 8 }}>
                            ✓ {t("settings.wechatBindSuccess")}
                          </p>
                        )}
      
                        {wechatBindState === "error" && wechatBindError && (
                          <p style={{ fontSize: 12, color: "var(--error, #ef4444)", marginTop: 8, whiteSpace: "pre-line" }}>
                            {wechatBindError}
                          </p>
                        )}
                      </div>
      
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0", whiteSpace: "pre-line" }}>{t("settings.wechatHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* WeCom */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.wecom_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.wecom")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.wecomDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.wecom_enabled} onChange={(e) => update("wecom_enabled", e.target.checked)} />
                  </div>
                  {form.wecom_enabled && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4, marginBottom: 6 }}>
                        {t("settings.imCredsLabel")}
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.wecomBotId")}</label>
                        <input className="input" value={form.wecom_bot_id ?? ""} onChange={(e) => update("wecom_bot_id", e.target.value)} placeholder="BOTID" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.wecomBotSecret")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.wecom_bot_secret ?? ""} onChange={(e) => update("wecom_bot_secret", e.target.value)} placeholder="SECRET" />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>
                        {t("settings.imChannelLabel")}
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", whiteSpace: "pre-line" }}>{t("settings.wecomHelp")}</p>
                      {renderEnterpriseCapabilityPanel(
                        "wecom",
                        t("settings.wecomEnterpriseTitle"),
                        t("settings.wecomEnterpriseDesc"),
                        { showEnable: false }
                      )}
                    </>
                  )}
                </div>
      
                {/* DingTalk */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.dingtalk_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.dingtalk")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.dingtalkDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.dingtalk_enabled} onChange={(e) => update("dingtalk_enabled", e.target.checked)} />
                  </div>
                  {form.dingtalk_enabled && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4, marginBottom: 6 }}>
                        {t("settings.imCredsLabel")}
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.dingtalkAppKey")}</label>
                        <input className="input" value={form.dingtalk_app_key} onChange={(e) => update("dingtalk_app_key", e.target.value)} placeholder="dingxxxxxxxxxxxxxxxx" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.dingtalkAppSecret")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.dingtalk_app_secret} onChange={(e) => update("dingtalk_app_secret", e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className="form-group">
                          <label className="label">{t("settings.dingtalkCorpId")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                          <input className="input" value={form.dingtalk_corp_id ?? ""} onChange={(e) => update("dingtalk_corp_id", e.target.value)} placeholder="dingxxxxxxxxxxxx" />
                        </div>
                        <div className="form-group">
                          <label className="label">{t("settings.dingtalkAgentId")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                          <input className="input" value={form.dingtalk_agent_id ?? ""} onChange={(e) => update("dingtalk_agent_id", e.target.value)} placeholder="123456789" />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 }}>
                        {t("settings.imChannelLabel")}
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.dingtalkRobotCode")}</label>
                        <input className="input" value={form.dingtalk_robot_code ?? ""} onChange={(e) => update("dingtalk_robot_code", e.target.value)} placeholder="dingxxxxxxxxxxxxxxxx" />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", whiteSpace: "pre-line" }}>{t("settings.dingtalkHelp")}</p>
                      <div className="form-group" style={{ marginTop: 12 }}>
                        <label className="label">{t("settings.dingtalkMcpUrl")}</label>
                        <input className="input" value={form.dingtalk_mcp_url ?? ""} onChange={(e) => update("dingtalk_mcp_url", e.target.value)} placeholder="https://mcp-gw.dingtalk.com/..." />
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.6 }}>
                          {t("settings.dingtalkMcpUrlHelp")}
                        </p>
                        <button className="btn btn-secondary" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => openUrl("https://mcp.dingtalk.com/")}>
                          {t("settings.dingtalkOpenMcpMarketplace")}
                        </button>
                      </div>
                      {renderEnterpriseCapabilityPanel(
                        "dingtalk",
                        t("settings.dingtalkEnterpriseTitle"),
                        t("settings.dingtalkEnterpriseDesc"),
                        { showOpenTools: true }
                      )}
                    </>
                  )}
                </div>
      
                {/* Telegram */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.telegram_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.telegram")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.telegramDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.telegram_enabled} onChange={(e) => update("telegram_enabled", e.target.checked)} />
                  </div>
                  {form.telegram_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.telegramToken")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.telegram_bot_token} onChange={(e) => update("telegram_bot_token", e.target.value)} placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.telegramHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* Slack */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.slack_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.slack")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.slackDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.slack_enabled ?? false} onChange={(e) => update("slack_enabled", e.target.checked)} />
                  </div>
                  {form.slack_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.slackWebhookUrl")}</label>
                        <input className="input" value={form.slack_webhook_url ?? ""} onChange={(e) => update("slack_webhook_url", e.target.value)} placeholder="https://hooks.slack.com/services/T.../B.../..." />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.slackHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* Discord */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.discord_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.discord")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.discordDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.discord_enabled ?? false} onChange={(e) => update("discord_enabled", e.target.checked)} />
                  </div>
                  {form.discord_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.discordWebhookUrl")}</label>
                        <input className="input" value={form.discord_webhook_url ?? ""} onChange={(e) => update("discord_webhook_url", e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.discordHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* Microsoft Teams */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.teams_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.teams")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.teamsDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.teams_enabled ?? false} onChange={(e) => update("teams_enabled", e.target.checked)} />
                  </div>
                  {form.teams_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.teamsWebhookUrl")}</label>
                        <input className="input" value={form.teams_webhook_url ?? ""} onChange={(e) => update("teams_webhook_url", e.target.value)} placeholder="https://yourorg.webhook.office.com/webhookb2/..." />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.teamsHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* Matrix */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.matrix_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.matrix")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.matrixDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.matrix_enabled ?? false} onChange={(e) => update("matrix_enabled", e.target.checked)} />
                  </div>
                  {form.matrix_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.matrixHomeserver")}</label>
                        <input className="input" value={form.matrix_homeserver ?? ""} onChange={(e) => update("matrix_homeserver", e.target.value)} placeholder="https://matrix.org" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.matrixAccessToken")}</label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.matrix_access_token ?? ""} onChange={(e) => update("matrix_access_token", e.target.value)} placeholder="syt_..." />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.matrixRoomId")}</label>
                        <input className="input" value={form.matrix_room_id ?? ""} onChange={(e) => update("matrix_room_id", e.target.value)} placeholder="!roomid:matrix.org" />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.matrixHelp")}</p>
                    </>
                  )}
                </div>
      
                {/* Generic Webhook */}
                <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.webhook_enabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.webhook")}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{t("settings.webhookDesc")}</span>
                    </div>
                    <input type="checkbox" checked={form.webhook_enabled ?? false} onChange={(e) => update("webhook_enabled", e.target.checked)} />
                  </div>
                  {form.webhook_enabled && (
                    <>
                      <div className="form-group">
                        <label className="label">{t("settings.webhookOutboundUrl")}</label>
                        <input className="input" value={form.webhook_outbound_url ?? ""} onChange={(e) => update("webhook_outbound_url", e.target.value)} placeholder="https://your-service.example.com/webhook" />
                      </div>
                      <div className="form-group">
                        <label className="label">{t("settings.webhookAuthToken")} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("common.optional")})</span></label>
                        <input className="input" type={showKeys ? "text" : "password"} value={form.webhook_auth_token ?? ""} onChange={(e) => update("webhook_auth_token", e.target.value)} placeholder="Bearer token or API key" />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.webhookHelp")}</p>
                    </>
                  )}
                </div>
      
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={handleGatewayConnect} disabled={gatewayConnecting || gatewayDisconnecting}>
                    {gatewayConnecting ? t("common.connecting") : t("settings.connectChannels")}
                  </button>
                  <button
                    className="btn"
                    onClick={handleGatewayDisconnect}
                    disabled={
                      gatewayDisconnecting ||
                      gatewayConnecting ||
                      !gatewayStatus.some((ch) => ch.status === "Connected" || ch.status === "Connecting")
                    }
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {gatewayDisconnecting ? t("common.disconnecting") : t("settings.disconnectAll")}
                  </button>
                  <button className="btn" onClick={() => setShowKeys(!showKeys)} style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12 }}>
                    {showKeys ? t("common.hideKeys") : t("common.showKeys")}
                  </button>
                </div>
              </section>
    </>
  );
}
