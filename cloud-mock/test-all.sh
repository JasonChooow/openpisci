#!/bin/bash
# 9xBot 云端 Mock 全接口测试脚本
# 用法: bash test-all.sh [base_url]

BASE="${1:-http://localhost:3900}"
echo "🔗 测试目标: $BASE"
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# 1. 健康检查
echo "━━━ 健康检查 ━━━"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
if [ "$STATUS" = "200" ]; then pass "GET /health → 200"; else fail "GET /health → $STATUS"; fi

# 2. 设备登录
echo ""
echo "━━━ 认证 ━━━"
RESP=$(curl -s -X POST "$BASE/api/auth/device/token" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123","device_name":"TestScript"}')
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$TOKEN" ]; then
  pass "POST /api/auth/device/token → 获得 token"
else
  fail "POST /api/auth/device/token → 无 token"
  echo "  响应: $RESP"
  exit 1
fi

# 3. 错误密码
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/device/token" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"wrong"}')
if [ "$STATUS" = "401" ]; then pass "POST /api/auth/device/token (wrong pw) → 401"; else fail "→ $STATUS"; fi

# 4. 传统登录
RESP2=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"test","password":"test123"}')
SID=$(echo "$RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
if [ -n "$SID" ]; then pass "POST /api/auth/login → 获得 session_id"; else fail "POST /api/auth/login"; fi

# 5. 余额
echo ""
echo "━━━ 余额 ━━━"
BAL=$(curl -s "$BASE/api/auth/user/balance" -H "Authorization: Bearer $TOKEN")
echo "$BAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  余额: {d.get(\"balance\")}')" 2>/dev/null
if echo "$BAL" | grep -q "balance"; then pass "GET /api/auth/user/balance"; else fail "balance 接口"; fi

# 6. Marketplace
echo ""
echo "━━━ 市场 ━━━"
MKT=$(curl -s "$BASE/api/marketplace/index?surface=desktop&os=linux&channel=stable")
echo "$MKT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  experts={len(d.get(\"experts\",[]))}, teams={len(d.get(\"teams\",[]))}, skills={len(d.get(\"skills\",[]))}, connectors={len(d.get(\"connectors\",[]))}')
" 2>/dev/null
if echo "$MKT" | grep -q "experts"; then pass "GET /api/marketplace/index"; else fail "marketplace index"; fi

# 7. LLM 模型列表
echo ""
echo "━━━ LLM 网关 ━━━"
MODELS=$(curl -s "$BASE/api/llm/v1/models" -H "Authorization: Bearer $TOKEN")
echo "$MODELS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids = [m['id'] for m in d.get('data',[])]
print(f'  可用模型: {\", \".join(ids)}')
" 2>/dev/null
if echo "$MODELS" | grep -q "qwen"; then pass "GET /api/llm/v1/models"; else fail "models 接口"; fi

# 8. Chat Completions (非流式)
CHAT=$(curl -s -X POST "$BASE/api/llm/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"你好"}]}')
if echo "$CHAT" | grep -q "choices"; then pass "POST /api/llm/v1/chat/completions (non-stream)"; else fail "chat completions"; fi

# 9. Chat Completions (流式)
STREAM=$(curl -s -X POST "$BASE/api/llm/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}],"stream":true}' \
  --max-time 5)
if echo "$STREAM" | grep -q "data:"; then pass "POST /api/llm/v1/chat/completions (stream)"; else fail "stream chat"; fi

# 10. 注册
echo ""
echo "━━━ 注册 / 用量 / 计费 ━━━"
REG_USER="reg_$(date +%s)"
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$REG_USER\",\"password\":\"pass123\",\"email\":\"$REG_USER@test.com\"}")
REG_TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -n "$REG_TOKEN" ]; then pass "POST /api/auth/register → 获得 token"; else fail "register 失败: $REG"; fi

CLAIM=$(curl -s -X POST "$BASE/api/billing/claim-daily" -H "Authorization: Bearer $REG_TOKEN")
if echo "$CLAIM" | grep -q '"success":true\|"success": true'; then pass "POST /api/billing/claim-daily"; else fail "claim-daily: $CLAIM"; fi

CHAT2=$(curl -s -X POST "$BASE/api/llm/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REG_TOKEN" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"用量测试"}]}')
if echo "$CHAT2" | grep -q "usage"; then pass "chat completions 含 usage"; else fail "chat 无 usage"; fi

SUMMARY=$(curl -s "$BASE/api/usage/summary?period=daily" -H "Authorization: Bearer $REG_TOKEN")
if echo "$SUMMARY" | grep -q "request_count"; then pass "GET /api/usage/summary"; else fail "usage/summary: $SUMMARY"; fi

BY_MODEL=$(curl -s "$BASE/api/usage/by-model?period=daily" -H "Authorization: Bearer $REG_TOKEN")
if echo "$BY_MODEL" | grep -q "models"; then pass "GET /api/usage/by-model"; else fail "usage/by-model: $BY_MODEL"; fi

TX=$(curl -s "$BASE/api/usage/transactions?page=1&page_size=10" -H "Authorization: Bearer $REG_TOKEN")
if echo "$TX" | grep -q "items"; then pass "GET /api/usage/transactions"; else fail "usage/transactions: $TX"; fi

# 11. 登出
echo ""
echo "━━━ 登出 ━━━"
curl -s -X POST "$BASE/api/auth/logout" -H "Authorization: Bearer $TOKEN" > /dev/null
BAL2=$(curl -s "$BASE/api/auth/user/balance" -H "Authorization: Bearer $TOKEN")
if echo "$BAL2" | grep -q "未认证"; then pass "POST /api/auth/logout → token 失效"; else fail "logout 后 token 仍有效"; fi

echo ""
echo "━━━ 测试完成 ━━━"
