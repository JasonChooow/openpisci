/**
 * cloud-mock 集成测试
 *
 * 覆盖:
 *   - 完整认证流程 (注册 → 登录 → 获取余额)
 *   - 聊天请求代理流程 (模型列表 → 聊天 → 用量记录)
 *   - 计费流程 (余额检查 → 扣费 → 余额更新)
 *   - 每日领取幂等性
 *   - 新增端点响应格式
 *
 * 用法: node integration.test.mjs
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 13900 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function request(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise(async (resolve, reject) => {
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) return resolve();
      } catch {
        // retry
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    reject(new Error("mock server health check timed out"));
  });
}

async function testAuthFlow() {
  console.log("\n━━━ 认证流程 ━━━");
  const username = `itest_${Date.now()}`;
  const password = "testpass123";

  const register = await request("POST", "/api/auth/register", {
    body: { username, password, email: `${username}@test.com` },
  });
  assert(register.status === 201, "注册返回 201");
  assert(!!register.json?.access_token, "注册返回 access_token");
  assert(register.json?.user?.username === username, "注册返回用户名");
  assert(register.json?.user?.balance === 0, "新用户余额为 0");

  const dup = await request("POST", "/api/auth/register", {
    body: { username, password },
  });
  assert(dup.status === 409, "重复注册返回 409");

  const login = await request("POST", "/api/auth/device/token", {
    body: { username, password, device_name: "integration-test" },
  });
  assert(login.status === 200, "登录返回 200");
  assert(!!login.json?.access_token, "登录返回 access_token");

  const token = login.json.access_token;
  const balance = await request("GET", "/api/auth/user/balance", { token });
  assert(balance.status === 200, "余额查询返回 200");
  assert(typeof balance.json?.balance === "number", "余额为数字");

  return { username, password, token };
}

async function testChatAndUsage(token) {
  console.log("\n━━━ 聊天代理与用量 ━━━");

  const models = await request("GET", "/api/llm/v1/models", { token });
  assert(models.status === 200, "模型列表返回 200");
  assert(Array.isArray(models.json?.data), "模型列表 data 为数组");
  assert(models.json.data.length > 0, "模型列表非空");

  const before = await request("GET", "/api/auth/user/balance", { token });
  const balanceBefore = before.json.balance;

  // 先领取额度再聊天（新用户余额为 0）
  const claim = await request("POST", "/api/billing/claim-daily", { token });
  assert(claim.status === 200, "每日领取返回 200");
  assert(claim.json?.success === true, "每日领取 success=true");
  assert(typeof claim.json?.credited === "number", "返回 credited");
  assert(typeof claim.json?.new_balance === "number", "返回 new_balance");

  const claimAgain = await request("POST", "/api/billing/claim-daily", { token });
  assert(claimAgain.status === 409, "重复领取返回 409");
  assert(claimAgain.json?.error?.code === "already_claimed", "重复领取错误码");

  const afterClaim = await request("GET", "/api/auth/user/balance", { token });
  assert(
    afterClaim.json.balance > balanceBefore,
    "领取后余额增加"
  );

  const chat = await request("POST", "/api/llm/v1/chat/completions", {
    token,
    body: {
      model: "qwen-plus",
      messages: [{ role: "user", content: "hello integration test" }],
    },
  });
  assert(chat.status === 200, "聊天补全返回 200");
  assert(Array.isArray(chat.json?.choices), "聊天返回 choices");
  assert(typeof chat.json?.usage?.prompt_tokens === "number", "返回 prompt_tokens");
  assert(
    typeof chat.json?.usage?.completion_tokens === "number",
    "返回 completion_tokens"
  );
  assert(typeof chat.json?.usage?.total_tokens === "number", "返回 total_tokens");

  const afterChat = await request("GET", "/api/auth/user/balance", { token });
  assert(
    afterChat.json.balance < afterClaim.json.balance,
    "聊天后余额减少"
  );

  const summary = await request("GET", "/api/usage/summary?period=daily", {
    token,
  });
  assert(summary.status === 200, "用量摘要返回 200");
  assert(summary.json?.period === "daily", "用量摘要 period=daily");
  assert(summary.json?.request_count >= 1, "用量摘要 request_count >= 1");
  assert(typeof summary.json?.total_cost === "number", "用量摘要含 total_cost");

  const byModel = await request("GET", "/api/usage/by-model?period=daily", {
    token,
  });
  assert(byModel.status === 200, "按模型用量返回 200");
  assert(Array.isArray(byModel.json?.models), "按模型用量 models 为数组");
  assert(
    byModel.json.models.some((m) => m.model === "qwen-plus"),
    "按模型用量含 qwen-plus"
  );

  const tx = await request("GET", "/api/usage/transactions?page=1&page_size=10", {
    token,
  });
  assert(tx.status === 200, "交易记录返回 200");
  assert(typeof tx.json?.total === "number", "交易记录含 total");
  assert(Array.isArray(tx.json?.items), "交易记录 items 为数组");
  assert(tx.json.items.length >= 1, "交易记录非空");
  assert(tx.json.items[0].model === "qwen-plus", "交易记录模型正确");
}

async function testEndpointFormats(token) {
  console.log("\n━━━ 新增端点响应格式 ━━━");

  const summary = await request("GET", "/api/usage/summary?period=monthly", {
    token,
  });
  assert(summary.status === 200, "monthly summary 200");
  for (const key of [
    "period",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "total_cost",
    "request_count",
  ]) {
    assert(key in (summary.json || {}), `summary 含字段 ${key}`);
  }

  const byModel = await request("GET", "/api/usage/by-model?period=monthly", {
    token,
  });
  assert(byModel.status === 200, "monthly by-model 200");
  assert("period" in (byModel.json || {}), "by-model 含 period");
  assert("models" in (byModel.json || {}), "by-model 含 models");

  const tx = await request("GET", "/api/usage/transactions?page=1&page_size=5", {
    token,
  });
  assert(tx.status === 200, "transactions 200");
  for (const key of ["total", "page", "page_size", "items"]) {
    assert(key in (tx.json || {}), `transactions 含字段 ${key}`);
  }

  const unauth = await request("GET", "/api/usage/summary");
  assert(unauth.status === 401, "未认证 usage 返回 401");
}

async function main() {
  console.log(`🔗 集成测试目标: ${BASE}`);

  const child = spawn("node", [join(__dirname, "server.mjs")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLog = "";
  child.stdout.on("data", (d) => {
    serverLog += d.toString();
  });
  child.stderr.on("data", (d) => {
    serverLog += d.toString();
  });

  try {
    await waitForHealth();
    console.log("✓ Mock 服务器已就绪");

    const { token } = await testAuthFlow();
    await testChatAndUsage(token);
    await testEndpointFormats(token);
  } catch (err) {
    console.error("\n集成测试异常:", err);
    console.error("服务器日志:\n", serverLog);
    failed++;
  } finally {
    child.kill("SIGTERM");
  }

  console.log(`\n━━━ 结果: ${passed} passed, ${failed} failed ━━━`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
