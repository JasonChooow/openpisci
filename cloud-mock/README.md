# 9xBot 云端本地测试服务器

本地模拟 `dimnuo.com` 云平台的所有 API 接口，用于桌面端开发联调。

## 快速启动

```bash
cd cloud-mock
npm install
npm start
```

服务器默认在 `http://localhost:3900` 启动。

## 开发模式 (文件变更自动重启)

```bash
npm run dev
```

## 测试账户

| 用户名 | 密码 | 余额 |
|--------|------|------|
| admin | admin123 | 99.50 |
| test | test123 | 50.00 |

## 接口列表

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/device/token` | 设备令牌登录 (桌面端首选) |
| POST | `/api/auth/login` | 传统 session 登录 (备用) |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/user/balance` | 查询账户余额 (需 Bearer Token) |

### 市场

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/marketplace/index` | 市场浏览索引 |
| GET | `/api/marketplace/asset/:id` | 获取资产详情/下载 |

查询参数: `?surface=desktop&os=linux&capabilities=mcp_stdio&channel=stable`

### LLM 网关 (OpenAI 兼容)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/v1/models` | 可用模型列表 (需认证) |
| POST | `/api/llm/v1/chat/completions` | 聊天补全 (支持 stream) |

## 桌面端连接

### 方式一: 在桌面端 UI 的「设置 → 云端」中修改 Cloud Base URL

将地址改为 `http://localhost:3900`

### 方式二: 浏览器 DevTools 控制台

```js
localStorage.setItem('pisci-cloud-base-url', 'http://localhost:3900')
```

然后刷新页面，用测试账户登录即可。

### 方式三: 环境变量 (开发构建)

在 Tauri 开发模式中设置:
```bash
CLOUD_BASE_URL=http://localhost:3900 npm run tauri dev
```

## 验证登录

```bash
# 设备令牌登录
curl -X POST http://localhost:3900/api/auth/device/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123","device_name":"XiaoNuo"}'

# 查询余额 (替换 TOKEN)
curl http://localhost:3900/api/auth/user/balance \
  -H 'Authorization: Bearer TOKEN'

# 市场索引
curl 'http://localhost:3900/api/marketplace/index?surface=desktop&os=linux&channel=stable'

# 模型列表
curl http://localhost:3900/api/llm/v1/models \
  -H 'Authorization: Bearer TOKEN'

# 聊天补全
curl -X POST http://localhost:3900/api/llm/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"你好"}]}'
```

## 自定义配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| PORT | 监听端口 | 3900 |
| MARKETPLACE_SIGNING_SECRET | HMAC 签名密钥 | (空，跳过验证) |

## 架构说明

本 mock server 直接读取项目中 `marketplace/index.json` 的数据，
为其打上 `source: "cloud"` 标记后返回给桌面端。这样可以测试
桌面端的多源聚合逻辑 (GitHub + Cloud 去重合并)。

LLM 网关使用简单的模拟回复，支持 stream/非 stream 两种模式，
足以验证桌面端的 provider 同步和聊天流程。
