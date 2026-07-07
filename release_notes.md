## v1.0.1 - 9X bot guidance, workspace, and installer polish

### Highlights

- **不中断引导**: 包子执行任务时可以继续输入补充要求，先暂存为“引导命令”，再发送给当前任务；引导会进入上下文，并在对话里用更轻的样式区分。
- **专家/技能搜索优化**: 对话框下方专家和技能搜索改为面向完整已安装清单，市场专家区也补上搜索入口。
- **上传更简单**: 附件上传统一为“所有文件”，减少普通同事选择文件类型的成本。
- **本地工作区命名**: 自动工作区改为 `对话名_0703-1428` 这类可读命名，并保留重名保护。
- **安装包规范**: 版本统一到 `1.0.1`，Windows 安装包标准命名为 `9Xbot-installer-1.0.1.exe`。
- **模型配置更清晰**: 首次配置新增自定义中转站入口；聊天框模型列表不再展示写死的内置模型，只展示用户已配置模型，并自动读取中转站 `/models` 返回的可用模型。
- **自定义模型可留空**: 自定义中转站的模型名称改为可选，普通用户只填 API Key 和 Base URL 即可，多个模型可在聊天框模型列表中选择。
- **新手指引修复**: 首次无对话状态点击“新手指引”会自动新建对话并填入预设提示词。
- **强制性新手引导**: 第一次完成 API 配置后会进入 4 步强制教程，逐步高亮“新建任务 / 工作类型 / 市场 / 新手指引”，帮助非技术同事知道下一步能做什么；完成后会记录状态，以后不再自动弹出。
- **后续登录系统注意**: 当前触发点是“首次 API 配置完成后”。后期接入登录/注册系统时，应把这套强制新手引导迁移到“用户注册完成后首次进入主界面”触发，并继续保持只自动触发一次。
- **专家市场调整**: 默认已安装专家收敛到主要办公/营销专家，其余专家留在市场中按需添加；市场专家卡片改为彩色视觉、显示添加按钮，并修复市场页顶部导航滚动穿模和回到顶部体验。

### Packaging

- Installer icon now refreshes from the same 9X bot artwork as the app icon, preventing stale/default installer imagery.
- Package metadata is aligned across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

### Validation

- `npm run build:web` passed.
- `cargo check --manifest-path src-tauri\Cargo.toml` passed.
- Windows installer packaged as `target/release/bundle/nsis/9Xbot-installer-1.0.1.exe`.
- `npm test` remains blocked by an existing Vitest/Vite startup mismatch before tests execute.

### Previous releases

## v0.8.64 - 9X bot rebrand, marketplace, and release polish

### Highlights

- **9X bot branding**: App icon (transparent), dock/tray icon refresh, chat empty-state 3D hero, settings tools page CSS fix
- **Marketplace**: Unified 9X bot market, cloud account gateway, lazy-loaded catalog
- **Cross-platform release**: Windows (NSIS/MSI), Linux (deb/AppImage), macOS universal binary (Intel + Apple Silicon)

### Bug Fixes

- Linux dock icon now loads latest `icons/icon.png` at startup
- Pagination lazy-load cap (`visibleCount` vs `total`)
- CI: TypeScript, vitest, and clippy fixes

### Previous releases

## v0.5.23 - Release asset upload fix

### Bug Fixes

- **GitHub Actions / release upload**: Fix Windows binary and installer upload paths so tagged builds publish actual downloadable assets to GitHub Release
- **GitHub Actions / release validation**: Make artifact upload and release attachment fail when installer files are missing, instead of silently succeeding

### Previous releases

#### v0.5.22 - Windows startup crash fix and release pipeline stabilisation

### Bug Fixes

- **startup/runtime**: Fix installed Windows builds crashing during startup when background tasks touch `AppState` before registration completes
- **commands/test_runner**: Fix the `replace_todo` resume-path deadlock in Rust tests
- **GitHub Actions / Windows tests**: Embed the required Windows manifest so Rust test binaries no longer fail with `STATUS_ENTRYPOINT_NOT_FOUND`

### Documentation

- **README.md / README_CN.md**: Backfill `v0.5.20` / `v0.5.21` / `v0.5.22` changelog entries and switch the repository default landing page to English
- **src-tauri/README.md / src-tauri/README_CN.md**: Split backend docs into English and Chinese entrypoints with corrected cross-links

### Previous releases

#### v0.5.21 - Layered timeouts and context runtime consolidation
- Added layered task timeout inheritance across task, pool, Koi, and system defaults
- Unified context assembly, rolling-summary compaction controls, and minimal task-spine persistence

#### v0.5.20 - Settings fix and documentation refresh
- Fixed custom LLM providers disappearing after saving settings
- Added screenshots, star prompt, and updated licensing notes
- Known issue: some Windows installers could crash on startup; fixed in `v0.5.22`

#### v0.5.19 - Koi/Pool fixes, parity matrix, backend README

### Bug Fixes

- **koi/runtime**: Fix stalled project unblocking logic when a Koi times out
- **pool_org**: Fix pool project management edge cases

### Documentation

- **docs/openclaw-parity-matrix.md**: Full audit and update of PiscisDesktop vs OpenClaw capability matrix; corrected statuses for Slack/Discord/Teams/Matrix (partial), resume-after-restart (implemented), prompt injection (implemented), multi-agent routing (implemented), email (implemented); added new rows for UAC elevation, PDF, SSH, code execution, web search, vision, WMI, MCP, secret encryption; added PiscisDesktop-specific multi-agent collaboration section
- **src-tauri/README_CN.md**: Replaced incorrect content with proper OpenPiscis Rust backend documentation

### Previous releases

#### v0.5.18
- fix(office): fix Excel chart type and sheet_check logic
- fix(clippy): use next_back() instead of last() on DoubleEndedIterator

#### v0.5.16 - UAC Elevated Execution Fix
- UAC elevated execution now works correctly for native executables (regsvr32, reg, regasm)
- Fixed UTF-8 BOM in result file causing JSON parse failure
- Fixed $LASTEXITCODE not captured for native executables via Start-Process inner script
- 32-bit PowerShell preserved for powershell32 interpreter

#### v0.5.15 - Real-time Message Persistence
- Every agent message written to DB immediately (not batch on run end)
- Prevents message loss on mid-run exits (crash, recompile, process kill)
