# Implementation Plan: Cloud-Locked LLM Gateway

## Overview

将 9xBot 从本地 LLM 客户端转型为云端锁定平台。实现分 6 个阶段推进，确保每个阶段可独立验证。

**技术栈**:
- 云端: Python (FastAPI + SQLAlchemy 2.0 + PostgreSQL)
- 桌面端: Rust (Tauri) + TypeScript (React)
- 管理后台: TypeScript (Vue 3 + Element Plus)
- 测试: pytest + hypothesis (属性测试)

## Tasks

- [x] 1. Phase 1: 云端后端基础
  - [x] 1.1 创建云端网关项目结构与数据库模型
    - 在 `website/backend/` 下新建 `app/gateway/`、`app/routing/`、`app/billing/`、`app/admin/` 模块
    - 创建 SQLAlchemy 2.0 模型文件: `app/models/user.py`, `app/models/provider.py`, `app/models/model.py`, `app/models/routing.py`, `app/models/billing.py`
    - 创建 Alembic migration 初始化脚本，生成所有表
    - 新增 `app/db.py` 数据库连接与 session 管理 (async SQLAlchemy)
    - 更新 `pyproject.toml` 添加 `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `hypothesis` 依赖
    - _Requirements: 4.1, 5.6_

  - [x] 1.2 扩展用户认证系统
    - 实现 `POST /api/auth/register` — 用户注册 (username/password/phone/email)
    - 实现 `POST /api/auth/send-code` — 短信验证码 (预留接口，开发环境固定返回 success)
    - 修改 `POST /api/auth/device/token` — 从 DB 校验用户而非硬编码
    - 实现 `POST /api/auth/logout` — 销毁 token/session
    - 实现 `GET /api/auth/user/balance` — 从 users 表读取余额
    - 使用 bcrypt 做密码哈希，JWT 保持现有 HS256 方案
    - _Requirements: 2.2, 2.3_

  - [x] 1.3 实现 LLM 网关代理
    - 创建 `app/gateway/router.py` — FastAPI router
    - 实现 `GET /api/llm/v1/models` — 从 DB 读取活跃模型列表，返回 OpenAI 兼容格式
    - 实现 `POST /api/llm/v1/chat/completions` — 代理聊天请求
      - 验证 Bearer Token → 解析 user_id
      - 预估费用检查余额
      - 调用 Routing Engine 选择提供商
      - 使用 `httpx.AsyncClient` 转发请求至上游 (支持 stream=true SSE)
      - 响应结束后异步记录 token 用量
    - _Requirements: 3.2, 3.3, 4.2, 5.1_

  - [x] 1.4 实现路由引擎
    - 创建 `app/routing/engine.py` — RoutingEngine 类
    - 实现 5 种策略: CHEAPEST_FIRST, ROUND_ROBIN, PRIORITY, FALLBACK_CHAIN, LATENCY_BASED
    - 实现 CircuitBreaker 类 (CLOSED/OPEN/HALF_OPEN 状态机)
    - 实现 RoutingConfigCache (30s 定时从 DB 重载)
    - 实现提供商选择 + fallback 逻辑
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 1.5 属性测试: 路由引擎策略一致性
    - **Property 2: 路由引擎策略一致性**
    - 使用 hypothesis 生成随机提供商配置 (cost, priority, latency)
    - 验证每种策略选中的提供商满足其排序不变量
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x] 1.6 属性测试: 路由引擎故障回退
    - **Property 3: 路由引擎故障回退**
    - 生成随机失败序列，验证 fallback 按序尝试
    - **Validates: Requirements 4.5**

- [x] 2. Phase 1 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 启动 FastAPI 服务，能注册用户、获取模型列表、代理聊天请求到 mock upstream

- [x] 3. Phase 2: 桌面端锁定
  - [x] 3.1 实现编译时 Cloud URL 加密
    - 修改 `src-tauri/build.rs` 添加 AES-256-GCM 加密逻辑
    - 在 `Cargo.toml` 添加 `aes-gcm` 和 `hex` 依赖
    - 创建 `src-tauri/src/commands/platform/cloud_url.rs` 模块
    - 实现 `get_cloud_url()` 函数 (debug 模式用环境变量 override)
    - 导出 Tauri command `get_cloud_base_url` 供前端调用
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 3.2 属性测试: Cloud URL 加密解密往返
    - **Property 1: Cloud URL 加密解密往返一致**
    - Rust `#[cfg(test)]` 模块，使用 proptest 生成随机 URL 字符串
    - 验证 encrypt → decrypt == 原始值
    - **Validates: Requirements 1.1, 1.2**

  - [x] 3.3 实现强制登录门控
    - 创建 `src/components/AuthGate/AuthGate.tsx`
    - 创建 `src/components/AuthGate/LoginScreen.tsx`
    - 修改 `src/App.tsx` — 用 AuthGate 包裹所有路由
    - 创建 `src/hooks/useCloudAuth.ts` — 管理认证状态 (调用 Rust command)
    - Token 过期自动跳转登录
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 3.4 移除本地 LLM 配置
    - 修改 `src/config/cloud.ts` — 移除 `setCloudBaseUrl()`、`CLOUD_BASE_URL_KEY`
    - `getCloudBaseUrl()` 改为 invoke Tauri command `get_cloud_base_url`
    - 移除 Settings 页面中所有 LLM API Key 配置 UI (anthropic/openai/deepseek/qwen)
    - 移除 `sync_cloud_llm_config` 中用户自定义 provider 逻辑，仅保留云端 provider
    - _Requirements: 1.3, 1.4, 3.1_

- [x] 4. Phase 2 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 桌面端启动后必须登录，Cloud URL 不可修改，无 API Key 配置入口

- [x] 5. Phase 3: 计费系统与用量 API
  - [x] 5.1 实现 Token 计费核心
    - 创建 `app/billing/service.py` — BillingService 类
    - 实现余额预估检查 (根据 model 价格 × 预估 max_tokens)
    - 实现实际扣费逻辑 (请求完成后根据实际 token 扣除)
    - 实现 UsageRecord 持久化
    - 实现并发安全的余额更新 (SELECT FOR UPDATE 或乐观锁)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 实现每日免费额度
    - 在 BillingService 中添加 `claim_daily_credits()` 方法
    - 检查 `daily_claim_date` 字段防止重复领取
    - 从 `billing_config` 表读取 `daily_free_credits` 配置值
    - 实现 `POST /api/billing/claim-daily` endpoint
    - _Requirements: 5.4, 5.5_

  - [x] 5.3 实现用量查询 API
    - 实现 `GET /api/usage/summary` — 日/月汇总
    - 实现 `GET /api/usage/by-model` — 按模型分组统计
    - 实现 `GET /api/usage/transactions` — 分页交易记录
    - 所有接口需 Bearer Token 认证，只返回当前用户数据
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.4 属性测试: 计费扣除准确性
    - **Property 4: 计费扣除准确性**
    - 使用 hypothesis 生成随机 token 数量和价格配置
    - 验证 cost == (prompt/1000 × input_price) + (completion/1000 × output_price)
    - **Validates: Requirements 5.1, 5.2**

  - [x] 5.5 属性测试: 余额不足拒绝
    - **Property 5: 余额不足拒绝不变量**
    - 生成随机余额和请求成本，验证余额不足时请求被拒且余额不变
    - **Validates: Requirements 5.3**

  - [x] 5.6 属性测试: 每日领取幂等性
    - **Property 6: 每日免费额度幂等性**
    - 模拟同一天多次调用 claim-daily，验证仅首次成功
    - **Validates: Requirements 5.5**

  - [x] 5.7 属性测试: 用量记录完整性
    - **Property 7: 用量记录完整性**
    - 对每条生成的 UsageRecord，验证所有必需字段非空
    - **Validates: Requirements 5.1, 5.6**

- [x] 6. Phase 3 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 完整流程——聊天请求 → 计费扣除 → 用量记录可查询

- [x] 7. Phase 4: 桌面端用量看板 UI
  - [x] 7.1 创建用量看板组件
    - 创建 `src/components/UsageDashboard/UsageDashboard.tsx` — 主面板
    - 创建 `src/components/UsageDashboard/BalanceCard.tsx` — 余额卡片 + 领取按钮
    - 创建 `src/components/UsageDashboard/UsageSummary.tsx` — 日/月汇总
    - 创建 `src/components/UsageDashboard/ModelBreakdown.tsx` — 按模型分组
    - 创建 `src/components/UsageDashboard/TransactionHistory.tsx` — 分页交易记录
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.2 创建用量相关 hooks 和 API service
    - 创建 `src/hooks/useBalance.ts` — 余额查询 hook
    - 创建 `src/hooks/useUsageSummary.ts` — 用量摘要 hook
    - 创建 `src/hooks/useUsageByModel.ts` — 按模型用量 hook
    - 创建 `src/hooks/useTransactions.ts` — 分页交易 hook
    - 创建 `src/services/usageApi.ts` — 封装所有用量 API 调用
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.3 集成用量看板到主界面
    - 在 Sidebar 中添加用量看板入口
    - 在适当路由位置注册 UsageDashboard
    - 顶栏显示简要余额信息
    - 实现领取每日免费额度按钮功能
    - _Requirements: 6.5_

- [x] 8. Phase 4 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 桌面端可查看余额、用量统计、领取每日额度

- [x] 9. Phase 5: 管理后台
  - [x] 9.1 创建管理后台项目与认证
    - 在 `website/admin-panel/` 下初始化 Vue 3 + Vite + Element Plus 项目
    - 配置 Vue Router、Axios 实例
    - 实现管理员登录页面 (调用 admin JWT 接口)
    - 实现路由守卫 (未登录跳转登录页)
    - _Requirements: 4.6_

  - [x] 9.2 实现云端管理 API
    - 创建 `app/admin/router.py` — 管理 API router
    - 实现提供商 CRUD: GET/POST/PUT/DELETE /api/admin/providers
    - 实现模型 CRUD: GET/POST/PUT/DELETE /api/admin/models
    - 实现模型-提供商映射管理
    - 实现路由配置 API: GET/PUT /api/admin/routing
    - 实现用户管理: GET/PUT /api/admin/users
    - 实现计费配置: GET/PUT /api/admin/billing/config
    - Admin JWT 认证中间件 (独立于用户 JWT)
    - _Requirements: 4.6, 4.7_

  - [x] 9.3 实现管理后台前端页面
    - 实现 Dashboard 概览页 (今日统计、健康状态)
    - 实现 Providers 页面 (表格 + 新增/编辑弹窗 + 健康检查触发)
    - 实现 Models 页面 (模型列表 + 提供商映射配置)
    - 实现 Routing 页面 (每模型策略选择 + fallback chain 编辑)
    - 实现 Users 页面 (用户列表 + 余额调整 + 角色管理)
    - 实现 Billing 页面 (全局配置编辑: daily_free_credits 等)
    - _Requirements: 4.6_

- [x] 10. Phase 5 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 管理后台可登录，完成提供商/模型/路由配置的 CRUD 操作

- [x] 11. Phase 6: Mock 服务器扩展与集成测试
  - [x] 11.1 扩展 cloud-mock 服务器
    - 在 `cloud-mock/server.mjs` 中添加 `POST /api/auth/register` endpoint
    - 添加 `GET /api/usage/summary` endpoint (返回 mock 日/月统计)
    - 添加 `GET /api/usage/by-model` endpoint (返回 mock 按模型分组数据)
    - 添加 `GET /api/usage/transactions` endpoint (返回 mock 分页记录)
    - 添加 `POST /api/billing/claim-daily` endpoint (模拟每日领取)
    - 修改 `POST /api/llm/v1/chat/completions` — 返回 token usage 并模拟余额扣除
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 11.2 编写集成测试
    - 测试完整认证流程 (注册 → 登录 → 获取余额)
    - 测试聊天请求代理流程 (模型列表 → 聊天 → 用量记录)
    - 测试计费流程 (余额检查 → 扣费 → 余额更新)
    - 测试路由 fallback 场景 (provider 1 失败 → provider 2 接管)
    - 测试 mock 服务器所有新增端点响应格式
    - _Requirements: 7.1-7.6_

- [x] 12. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - 验证: 完整端到端流程通过，mock 服务器覆盖所有 API，属性测试全部通过

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (使用 hypothesis 库)
- 桌面端属性测试使用 Rust proptest crate
- Phase 1-3 为核心功能，Phase 4-6 为完善和管理功能
