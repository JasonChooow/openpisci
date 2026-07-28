# 需求文档：Cloud-Locked LLM Gateway

## 简介

将 9xBot (Piscis Desktop) 从一个可自由配置 LLM 的客户端转型为云端锁定平台。用户必须登录云账户才能使用，所有 LLM 调用通过云端网关路由，桌面端不再允许自行配置 LLM 提供商/API Key。云端服务器作为模型中继代理，支持多上游提供商连接池、可配置路由策略、Token 计费和用量看板。

## 术语表

- **Desktop_App**: 基于 Tauri (Rust + React) 的 9xBot 桌面应用程序
- **Cloud_Gateway**: 部署在 dimnuo.com 的云端 LLM 中继代理服务
- **Cloud_URL**: 硬编码并加密存储在桌面端二进制文件中的云端服务地址 (https://www.dimnuo.com)
- **Connection_Pool**: 云端维护的多上游 LLM/AIGC 提供商连接池
- **Routing_Engine**: 根据配置策略选择上游提供商的路由引擎
- **Token_Billing**: 基于 Token 消耗量的计费系统
- **Usage_Dashboard**: 桌面端的用量统计与余额查看面板
- **Admin_Panel**: 云端管理后台，用于配置路由规则和提供商
- **User_Account**: 用户的云端账户，包含余额、用量记录等

## 需求

### 需求 1：加密硬编码云端地址

**用户故事：** 作为平台运营者，我希望桌面端的云端地址固定且不可被用户修改，以确保所有流量经过官方云端。

#### 验收标准

1. THE Desktop_App SHALL embed the Cloud_URL as a compile-time encrypted constant in the Rust binary
2. WHEN the Desktop_App starts, THE Desktop_App SHALL decrypt the Cloud_URL at runtime using a built-in decryption key
3. WHEN a user attempts to access cloud configuration, THE Desktop_App SHALL hide any UI elements that allow modifying the cloud base URL
4. THE Desktop_App SHALL remove the localStorage-based `pisci-cloud-base-url` configuration mechanism from production builds
5. WHERE development builds are compiled with `VITE_CLOUD_BASE_URL` set, THE Desktop_App SHALL use the environment variable override for local testing only

### 需求 2：强制登录注册

**用户故事：** 作为平台运营者，我希望用户首次启动后必须登录或注册，以确保每个用户都有云端账户绑定。

#### 验收标准

1. WHEN the Desktop_App launches without a valid authenticated session, THE Desktop_App SHALL display a login/registration screen and block access to all other features
2. WHEN a user submits valid login credentials, THE Desktop_App SHALL authenticate via `POST {Cloud_URL}/api/auth/device/token` and persist the session
3. WHEN a user chooses to register, THE Desktop_App SHALL navigate to the cloud registration flow at `{Cloud_URL}/api/auth/register`
4. IF the authentication token expires or is revoked, THEN THE Desktop_App SHALL redirect the user back to the login screen
5. THE Desktop_App SHALL remove any local-only usage mode that bypasses cloud authentication

### 需求 3：云端唯一模型源

**用户故事：** 作为平台运营者，我希望桌面端的所有可用模型都来自云端，用户无法自行配置 LLM 提供商，以实现统一的计费和管控。

#### 验收标准

1. THE Desktop_App SHALL remove all UI elements for configuring local LLM provider API keys (anthropic_api_key, openai_api_key, deepseek_api_key, qwen_api_key, etc.)
2. WHEN the Desktop_App fetches available models, THE Desktop_App SHALL request the model list exclusively from `GET {Cloud_URL}/api/llm/v1/models`
3. WHEN a user selects a model for chat, THE Desktop_App SHALL route all chat completions through `POST {Cloud_URL}/api/llm/v1/chat/completions`
4. THE Desktop_App SHALL authenticate all LLM API requests using the user's cloud session token as Bearer token
5. IF the model list request fails, THEN THE Desktop_App SHALL display an error message indicating cloud connectivity issues and retry with exponential backoff

### 需求 4：云端连接池与路由

**用户故事：** 作为平台管理员，我希望云端能管理多个上游 LLM 提供商并按策略智能路由请求，以优化成本和可用性。

#### 验收标准

1. THE Cloud_Gateway SHALL maintain a Connection_Pool containing configurations for multiple upstream LLM providers (Anthropic, OpenAI, DeepSeek, Qwen, etc.)
2. WHEN a chat completion request arrives, THE Routing_Engine SHALL select an upstream provider based on the configured routing strategy for the requested model
3. THE Routing_Engine SHALL support the following routing strategies: cheapest-first, round-robin, priority-based, fallback-chain, and latency-based
4. WHEN multiple providers offer the same model, THE Routing_Engine SHALL evaluate provider selection based on the active strategy and per-provider metadata (cost per 1K tokens, latency, availability)
5. IF the selected upstream provider returns an error or times out, THEN THE Routing_Engine SHALL attempt the next provider in the fallback chain before returning an error to the client
6. THE Admin_Panel SHALL allow administrators to configure routing rules per model, including provider priority, cost thresholds, and rate limits
7. WHEN a provider is added or removed from the Connection_Pool, THE Cloud_Gateway SHALL update routing without requiring a service restart

### 需求 5：Token 计费系统

**用户故事：** 作为平台运营者，我希望每次 API 调用都记录 Token 消耗并从用户余额扣除，以实现按量计费。

#### 验收标准

1. WHEN a chat completion request is processed, THE Token_Billing SHALL record the prompt_tokens, completion_tokens, and total_tokens from the upstream response
2. WHEN token usage is recorded, THE Token_Billing SHALL deduct the corresponding cost from the User_Account balance based on the model's pricing configuration
3. IF the User_Account balance is insufficient to cover the estimated cost of a request, THEN THE Cloud_Gateway SHALL reject the request with a clear insufficient-balance error
4. THE Token_Billing SHALL support a daily free quota mechanism where each User_Account receives a configurable number of free tokens per day
5. WHEN a user claims daily free credits, THE Token_Billing SHALL add the configured credit amount to the User_Account balance once per calendar day
6. THE Token_Billing SHALL persist all usage records server-side with fields: user_id, model, provider, prompt_tokens, completion_tokens, cost, timestamp

### 需求 6：桌面端用量看板

**用户故事：** 作为用户，我希望在桌面端查看我的余额和用量统计，以便了解消费情况。

#### 验收标准

1. WHEN the user navigates to the usage dashboard, THE Desktop_App SHALL fetch and display the current User_Account balance from `GET {Cloud_URL}/api/auth/user/balance`
2. WHEN the usage dashboard is displayed, THE Desktop_App SHALL show daily and monthly token usage summaries from `GET {Cloud_URL}/api/usage/summary`
3. WHEN the usage dashboard is displayed, THE Desktop_App SHALL show per-model usage breakdown from `GET {Cloud_URL}/api/usage/by-model`
4. WHEN the user views transaction history, THE Desktop_App SHALL fetch paginated transaction records from `GET {Cloud_URL}/api/usage/transactions`
5. WHEN the user claims daily free credits, THE Desktop_App SHALL call `POST {Cloud_URL}/api/billing/claim-daily` and update the displayed balance

### 需求 7：云端 Mock 服务器扩展

**用户故事：** 作为开发者，我希望本地 Mock 服务器能覆盖所有新增的云端 API，以便进行桌面端开发和联调测试。

#### 验收标准

1. THE cloud-mock server SHALL implement `POST /api/auth/register` endpoint for testing user registration flow
2. THE cloud-mock server SHALL implement `GET /api/usage/summary` endpoint returning mock daily/monthly usage data
3. THE cloud-mock server SHALL implement `GET /api/usage/by-model` endpoint returning mock per-model breakdown data
4. THE cloud-mock server SHALL implement `GET /api/usage/transactions` endpoint returning mock paginated transaction records
5. THE cloud-mock server SHALL implement `POST /api/billing/claim-daily` endpoint simulating daily credit claim
6. WHEN a chat completion request is processed by the mock server, THE cloud-mock server SHALL return simulated token usage in the response and deduct from the mock user's balance
