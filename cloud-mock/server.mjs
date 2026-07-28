/**
 * 9xBot 云端本地测试服务器
 *
 * 模拟 dimnuo.com 云平台的所有 API 端点，用于桌面端本地联调测试。
 *
 * 覆盖的接口:
 *   - POST /api/auth/device/token     — 设备令牌登录
 *   - POST /api/auth/login            — 传统 session 登录
 *   - GET  /api/auth/register         — 浏览器注册页
 *   - POST /api/auth/register         — 用户注册 API
 *   - POST /api/auth/logout           — 登出
 *   - GET  /api/auth/user/balance     — 账户余额
 *   - GET  /api/marketplace/index     — 市场浏览
 *   - GET  /api/marketplace/asset/:id — 资产详情
 *   - GET  /api/llm/v1/models         — 模型列表
 *   - POST /api/llm/v1/chat/completions — 聊天补全 (OpenAI 兼容, 带计费)
 *   - GET  /api/usage/summary         — 用量摘要 (日/月)
 *   - GET  /api/usage/by-model        — 按模型分组用量
 *   - GET  /api/usage/transactions    — 分页交易记录
 *   - POST /api/billing/claim-daily   — 每日免费额度领取
 *
 * 启动: cd cloud-mock && npm install && npm start
 * 默认端口: 3900 (环境变量 PORT 可覆盖)
 */

import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3900;

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, _res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ─── Mock Data ───────────────────────────────────────────────────────────────

// 模拟用户数据库
const MOCK_USERS = {
  admin: {
    password: "admin123",
    id: "user_001",
    username: "admin",
    email: "admin@dimnuo.com",
    balance: 99.50,
  },
  test: {
    password: "test123",
    id: "user_002",
    username: "test",
    email: "test@dimnuo.com",
    balance: 50.00,
  },
};

// 活跃 token 存储 (token -> user_id)
const activeSessions = new Map();

// 每日领取记录 (user_id -> 上次领取日期 YYYY-MM-DD)
const dailyClaimRecords = new Map();

// 用量记录存储 (user_id -> UsageRecord[])
const usageRecords = new Map();

// 每日免费额度 (CNY)
const DAILY_FREE_CREDITS = 1.0;

// 自增用户ID计数器
let userIdCounter = 100;

// 签名密钥 (可选)
const SIGNING_SECRET = process.env.MARKETPLACE_SIGNING_SECRET || "";

// ─── Auth Helpers ────────────────────────────────────────────────────────────

function generateToken() {
  return `mock_${crypto.randomBytes(24).toString("hex")}`;
}

function authenticateRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !activeSessions.has(token)) return null;
  const userId = activeSessions.get(token);
  return Object.values(MOCK_USERS).find((u) => u.id === userId) || null;
}

// ─── Auth Endpoints ──────────────────────────────────────────────────────────

// POST /api/auth/device/token — 设备令牌登录 (首选方式)
app.post("/api/auth/device/token", (req, res) => {
  const { username, password, device_name } = req.body;
  console.log(`  → 设备登录: user=${username}, device=${device_name}`);

  const user = MOCK_USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const accessToken = generateToken();
  const refreshToken = generateToken();
  activeSessions.set(accessToken, user.id);

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});

// GET /api/auth/register — 浏览器注册页 (桌面端 "前往云端注册" 会打开此 URL)
app.get("/api/auth/register", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>注册云端账户 · 9xBot Mock</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(160deg, #eef4ff, #f7fafc 55%, #edf2f7); color: #1a202c; }
    main { width: min(420px, calc(100vw - 2rem)); background: #fff; border-radius: 16px;
      padding: 2rem; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
    h1 { margin: 0 0 0.35rem; font-size: 1.45rem; }
    p { margin: 0 0 1.25rem; color: #4a5568; line-height: 1.5; }
    label { display: grid; gap: 0.35rem; margin-bottom: 0.9rem; font-size: 0.92rem; }
    input { border: 1px solid #cbd5e0; border-radius: 10px; padding: 0.7rem 0.85rem; font: inherit; }
    button { width: 100%; margin-top: 0.4rem; border: 0; border-radius: 10px; padding: 0.85rem;
      background: #2563eb; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.65; cursor: wait; }
    .msg { margin-top: 1rem; padding: 0.75rem 0.9rem; border-radius: 10px; display: none; }
    .msg.ok { display: block; background: #ecfdf5; color: #065f46; }
    .msg.err { display: block; background: #fef2f2; color: #991b1b; }
    .hint { margin-top: 1rem; font-size: 0.85rem; color: #718096; }
  </style>
</head>
<body>
  <main>
    <h1>注册云端账户</h1>
    <p>本地 Mock 注册页。注册成功后请返回桌面端，用同一用户名密码登录。</p>
    <form id="form">
      <label>用户名<input name="username" autocomplete="username" required /></label>
      <label>密码<input name="password" type="password" autocomplete="new-password" required minlength="6" /></label>
      <label>邮箱（可选）<input name="email" type="email" autocomplete="email" /></label>
      <button type="submit">创建账户</button>
    </form>
    <div id="msg" class="msg" role="status"></div>
    <p class="hint">API: POST /api/auth/register · Mock Server</p>
  </main>
  <script>
    const form = document.getElementById("form");
    const msg = document.getElementById("msg");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const button = form.querySelector("button");
      button.disabled = true;
      msg.className = "msg";
      msg.textContent = "";
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || ("注册失败 (" + res.status + ")"));
        msg.className = "msg ok";
        msg.textContent = "注册成功：用户 " + body.user.username + "。请返回桌面端登录。";
        form.reset();
      } catch (error) {
        msg.className = "msg err";
        msg.textContent = error.message || "注册失败";
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`);
});

// POST /api/auth/register — 用户注册 API
app.post("/api/auth/register", (req, res) => {
  const { username, password, phone, email } = req.body;
  console.log(`  → 用户注册: username=${username}, phone=${phone}, email=${email}`);

  if (!username || !password) {
    return res.status(400).json({ error: "用户名和密码为必填项" });
  }

  // 检查用户名是否已存在
  if (MOCK_USERS[username]) {
    return res.status(409).json({ error: "用户名已存在" });
  }

  // 创建新用户
  userIdCounter++;
  const newUser = {
    password,
    id: `user_${String(userIdCounter).padStart(3, "0")}`,
    username,
    email: email || null,
    phone: phone || null,
    balance: 0.0,
  };
  MOCK_USERS[username] = newUser;

  // 自动登录
  const accessToken = generateToken();
  const refreshToken = generateToken();
  activeSessions.set(accessToken, newUser.id);

  res.status(201).json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      balance: newUser.balance,
    },
  });
});

// POST /api/auth/login — 传统 session 登录 (备用)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`  → 传统登录: user=${username}`);

  const user = MOCK_USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const sessionId = generateToken();
  activeSessions.set(sessionId, user.id);

  res.json({
    session_id: sessionId,
    user_info: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});

// POST /api/auth/logout — 登出
app.post("/api/auth/logout", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    activeSessions.delete(token);
  }
  console.log("  → 已登出");
  res.json({ success: true });
});

// GET /api/auth/user/balance — 查询余额
app.get("/api/auth/user/balance", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }
  res.json({ balance: user.balance });
});

// ─── Marketplace Endpoints ───────────────────────────────────────────────────

// 加载本地 marketplace/index.json 作为数据源
function loadMarketplaceIndex() {
  const indexPath = join(__dirname, "..", "marketplace", "index.json");
  if (!existsSync(indexPath)) {
    return { experts: [], teams: [], skills: [], connectors: [] };
  }
  const raw = readFileSync(indexPath, "utf-8");
  const data = JSON.parse(raw);
  return {
    experts: data.experts || [],
    teams: data.teams || [],
    skills: data.skills || [],
    connectors: data.connectors || [],
  };
}

// 为云端条目添加 cloud 标记
function tagAsCloud(items) {
  return items.map((item) => ({
    ...item,
    source: "cloud",
    trusted: true,
    platform_compat: { surfaces: ["web", "desktop"] },
    download_url:
      item.download_url ||
      `http://localhost:${PORT}/api/marketplace/asset/${encodeURIComponent(item.id)}`,
  }));
}

// GET /api/marketplace/index — 市场浏览索引
app.get("/api/marketplace/index", (req, res) => {
  const { surface, os, capabilities, channel } = req.query;
  console.log(`  → 市场索引: surface=${surface}, os=${os}, channel=${channel}`);

  const data = loadMarketplaceIndex();
  const result = {
    experts: tagAsCloud(data.experts).slice(0, 10), // 返回前 10 个作为示例
    teams: tagAsCloud(data.teams).slice(0, 5),
    skills: tagAsCloud(data.skills).slice(0, 10),
    connectors: tagAsCloud(data.connectors || []),
  };

  res.json(result);
});

// GET /api/marketplace/asset/:id — 获取资产详情
app.get("/api/marketplace/asset/:id", (req, res) => {
  const assetId = decodeURIComponent(req.params.id);
  console.log(`  → 获取资产: ${assetId}`);

  const data = loadMarketplaceIndex();
  const allItems = [
    ...data.experts,
    ...data.teams,
    ...data.skills,
    ...(data.connectors || []),
  ];

  const item = allItems.find((i) => i.id === assetId);
  if (!item) {
    return res.status(404).json({ error: `资产 "${assetId}" 未找到` });
  }

  // 如果有 download_url 指向外部 (GitHub)，重定向过去
  if (item.download_url && item.download_url.startsWith("http")) {
    return res.redirect(302, item.download_url);
  }

  res.json(item);
});

// ─── LLM Gateway Endpoints (OpenAI Compatible) ──────────────────────────────

const MOCK_MODELS = [
  { id: "qwen-plus", object: "model", owned_by: "cloud" },
  { id: "qwen-turbo", object: "model", owned_by: "cloud" },
  { id: "deepseek-chat", object: "model", owned_by: "cloud" },
  { id: "claude-3-5-sonnet", object: "model", owned_by: "cloud" },
  { id: "gpt-4o", object: "model", owned_by: "cloud" },
];

// GET /api/llm/v1/models — 列出可用模型
app.get("/api/llm/v1/models", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证，请先登录云账户" });
  }
  console.log(`  → 模型列表 (用户: ${user.username})`);
  res.json({
    object: "list",
    data: MOCK_MODELS,
  });
});

// POST /api/llm/v1/chat/completions — 聊天补全 (带计费模拟)
app.post("/api/llm/v1/chat/completions", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  const { model, messages, stream } = req.body;
  console.log(`  → 聊天补全: model=${model}, msgs=${messages?.length}, stream=${!!stream}`);

  // 模拟 token 用量
  const promptTokens = messages
    ? messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    : 100;
  const completionTokens = Math.floor(Math.random() * 100) + 30;
  const totalTokens = promptTokens + completionTokens;

  // 模拟费用计算: 0.002 CNY / 1K tokens (input) + 0.004 CNY / 1K tokens (output)
  const cost = (promptTokens / 1000) * 0.002 + (completionTokens / 1000) * 0.004;
  const roundedCost = Math.round(cost * 10000) / 10000;

  // 检查余额
  if (user.balance < roundedCost) {
    return res.status(402).json({
      error: {
        code: "insufficient_balance",
        message: "账户余额不足",
        balance: user.balance,
      },
    });
  }

  // 扣除余额
  user.balance = Math.round((user.balance - roundedCost) * 10000) / 10000;
  console.log(`  → 扣费: ${roundedCost} CNY, 剩余余额: ${user.balance}`);

  // 记录用量
  const record = {
    id: Date.now(),
    user_id: user.id,
    model: model || "qwen-plus",
    provider_id: 1,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost: roundedCost,
    request_id: `req_${crypto.randomBytes(8).toString("hex")}`,
    created_at: new Date().toISOString(),
  };
  if (!usageRecords.has(user.id)) {
    usageRecords.set(user.id, []);
  }
  usageRecords.get(user.id).push(record);

  if (stream) {
    // SSE 流式响应
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "close",
      "X-Accel-Buffering": "no",
    });

    const responseText = `[Mock] 收到${messages?.length || 0}条消息，模型${model}，本地测试回复正常。`;
    const tokens = responseText.match(/.{1,3}/g) || [responseText];
    const chatId = `chatcmpl-mock-${Date.now()}`;

    let ssePayload = "";
    for (const token of tokens) {
      const chunk = {
        id: chatId,
        object: "chat.completion.chunk",
        model,
        choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
      };
      ssePayload += `data: ${JSON.stringify(chunk)}\n\n`;
    }
    // 结束标记
    const doneChunk = {
      id: chatId,
      object: "chat.completion.chunk",
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    };
    ssePayload += `data: ${JSON.stringify(doneChunk)}\n\n`;
    ssePayload += "data: [DONE]\n\n";

    res.send(ssePayload);
  } else {
    // 非流式响应
    const responseText = `[云端Mock] 收到 ${messages?.length || 0} 条消息，使用模型 ${model}。这是本地测试服务器的模拟回复。请将 cloud base URL 设为 http://localhost:${PORT} 来连接桌面端。`;
    res.json({
      id: `chatcmpl-mock-${Date.now()}`,
      object: "chat.completion",
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: responseText },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    });
  }
});

// ─── Usage & Billing Endpoints ───────────────────────────────────────────────

// GET /api/usage/summary — 用量摘要 (日/月)
app.get("/api/usage/summary", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  const period = req.query.period || "daily";
  const records = usageRecords.get(user.id) || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  let filtered;
  if (period === "daily") {
    filtered = records.filter((r) => r.created_at.slice(0, 10) === todayStr);
  } else {
    filtered = records.filter((r) => r.created_at.slice(0, 7) === monthStr);
  }

  const summary = filtered.reduce(
    (acc, r) => {
      acc.prompt_tokens += r.prompt_tokens;
      acc.completion_tokens += r.completion_tokens;
      acc.total_tokens += r.prompt_tokens + r.completion_tokens;
      acc.total_cost += r.cost;
      acc.request_count += 1;
      return acc;
    },
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_cost: 0, request_count: 0 }
  );

  summary.total_cost = Math.round(summary.total_cost * 10000) / 10000;

  console.log(`  → 用量摘要: user=${user.username}, period=${period}, requests=${summary.request_count}`);
  res.json({ period, ...summary });
});

// GET /api/usage/by-model — 按模型分组用量统计
app.get("/api/usage/by-model", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  const period = req.query.period || "daily";
  const records = usageRecords.get(user.id) || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  let filtered;
  if (period === "daily") {
    filtered = records.filter((r) => r.created_at.slice(0, 10) === todayStr);
  } else {
    filtered = records.filter((r) => r.created_at.slice(0, 7) === monthStr);
  }

  // 按模型分组
  const modelMap = {};
  for (const r of filtered) {
    if (!modelMap[r.model]) {
      modelMap[r.model] = { model: r.model, prompt_tokens: 0, completion_tokens: 0, total_cost: 0, request_count: 0 };
    }
    modelMap[r.model].prompt_tokens += r.prompt_tokens;
    modelMap[r.model].completion_tokens += r.completion_tokens;
    modelMap[r.model].total_cost += r.cost;
    modelMap[r.model].request_count += 1;
  }

  const models = Object.values(modelMap).map((m) => ({
    ...m,
    total_cost: Math.round(m.total_cost * 10000) / 10000,
  }));

  console.log(`  → 按模型用量: user=${user.username}, period=${period}, models=${models.length}`);
  res.json({ period, models });
});

// GET /api/usage/transactions — 分页交易记录
app.get("/api/usage/transactions", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));
  const startDate = req.query.start_date || null;
  const endDate = req.query.end_date || null;

  let records = usageRecords.get(user.id) || [];

  // 按日期过滤
  if (startDate) {
    records = records.filter((r) => r.created_at >= startDate);
  }
  if (endDate) {
    records = records.filter((r) => r.created_at.slice(0, 10) <= endDate);
  }

  // 按时间倒序
  records = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = records.length;
  const start = (page - 1) * pageSize;
  const items = records.slice(start, start + pageSize).map((r) => ({
    id: r.id,
    model: r.model,
    prompt_tokens: r.prompt_tokens,
    completion_tokens: r.completion_tokens,
    cost: r.cost,
    created_at: r.created_at,
  }));

  console.log(`  → 交易记录: user=${user.username}, page=${page}, total=${total}`);
  res.json({ total, page, page_size: pageSize, items });
});

// POST /api/billing/claim-daily — 每日免费额度领取
app.post("/api/billing/claim-daily", (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastClaim = dailyClaimRecords.get(user.id);

  if (lastClaim === todayStr) {
    // 今日已领取
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    console.log(`  → 每日领取: user=${user.username} — 今日已领取`);
    return res.status(409).json({
      error: {
        code: "already_claimed",
        message: "今日已领取",
        next_claim_at: tomorrow.toISOString(),
      },
    });
  }

  // 首次领取
  dailyClaimRecords.set(user.id, todayStr);
  user.balance = Math.round((user.balance + DAILY_FREE_CREDITS) * 10000) / 10000;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  console.log(`  → 每日领取: user=${user.username}, credited=${DAILY_FREE_CREDITS}, new_balance=${user.balance}`);
  res.json({
    success: true,
    credited: DAILY_FREE_CREDITS,
    new_balance: user.balance,
    next_claim_at: tomorrow.toISOString(),
  });
});

// ─── Health & Info ───────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({
    service: "9xBot Cloud Mock Server",
    version: "2.0.0",
    status: "running",
    endpoints: {
      auth: [
        "POST /api/auth/device/token",
        "POST /api/auth/login",
        "GET  /api/auth/register",
        "POST /api/auth/register",
        "POST /api/auth/logout",
        "GET  /api/auth/user/balance",
      ],
      marketplace: [
        "GET /api/marketplace/index",
        "GET /api/marketplace/asset/:id",
      ],
      llm: [
        "GET  /api/llm/v1/models",
        "POST /api/llm/v1/chat/completions",
      ],
      usage: [
        "GET /api/usage/summary",
        "GET /api/usage/by-model",
        "GET /api/usage/transactions",
      ],
      billing: [
        "POST /api/billing/claim-daily",
      ],
    },
    test_accounts: {
      admin: { username: "admin", password: "admin123" },
      test: { username: "test", password: "test123" },
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          9xBot 云端本地测试服务器 (Mock Server)               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  地址: http://localhost:${PORT}                               ║
║                                                              ║
║  测试账户:                                                    ║
║    用户名: admin   密码: admin123                             ║
║    用户名: test    密码: test123                              ║
║                                                              ║
║  桌面端连接方式:                                              ║
║    在桌面端设置中将 Cloud Base URL 改为:                       ║
║    http://localhost:${PORT}                                    ║
║                                                              ║
║  或在浏览器控制台执行:                                        ║
║    localStorage.setItem(                                     ║
║      'pisci-cloud-base-url', 'http://localhost:${PORT}'       ║
║    )                                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
