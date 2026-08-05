# 9X bot 项目交接文档

更新时间：2026-07-03

## 项目目标

本项目从 `njbinbin/openpisci` 派生，本地开发分支为 `9xbot`，远端 fork 为 `JasonChooow/openpisci`。当前目标是把原 OpenPiscis 改造成面向公司同事使用的 9X bot 桌面 AI 助手：品牌显示为 `9X bot`，对话主助手叫 `包子`，内置常用专家和技能，尽量减少用户手动安装、配置和理解技术细节的成本。

产品方向不是做一个开发者工具外壳，而是做一个普通办公人员能直接使用的桌面 Agent：能聊天、调用专家、调用技能、处理文档/PPT/营销/设计/开发任务，后续再逐步完善企业连接器、团队协作和市场能力。

## 当前仓库状态

- 开发目录：`E:\9xbot\DimWork`
- 当前分支：`9xbot`
- 当前版本：`package.json` 与 `src-tauri/tauri.conf.json` 为 `0.8.66`
- 产品名：`9X bot`
- 最近提交：
  - `fda0b38 Isolate chat workspaces and clean secret scan sample`
  - `f013d4a Refresh installer icon and bump version`
  - `b9d46e9 Polish 9X bot UI and bundled skills`
  - `0c341c3 feat: bundle 9xbot experts and skills`
  - `08b9803 docs: add 9xbot branch maintenance guide`

重要：当前工作区有未完成中断状态：

- `src/components/Settings/sections/ChannelsSection.tsx` 当前处于删除未提交状态。这是连接器页面重构中断留下的，不是已完成修改。继续开发前必须先处理：要么从 Git 恢复旧文件，要么完整重写新的连接器向导页面。
- `.cargo/` 是未跟踪本地配置目录，通常不要提交。
- 用户已明确说“连接器功能先不管了”，所以下一位接手者不要继续连接器，除非用户重新要求；但要先保证删除文件不影响构建。

## 关键技术栈

- 前端：React 18、TypeScript、Vite、Redux Toolkit、i18next、lucide-react
- 桌面壳：Tauri 2
- 后端：Rust
- 数据与状态：本地配置、SQLite/应用数据目录、Redux 前端状态
- AI/Agent：主 Agent、专家 Koi、匿名 Fish、技能 Skill、MCP 工具、IM Gateway、团队协作 Pool
- 构建脚本：
  - 前端构建：`npm run build:web`
  - Tauri 开发启动：`npm run tauri -- dev`
  - Rust 检查：`cargo check --manifest-path src-tauri\Cargo.toml`
  - 打包：`npm run tauri -- build`

## 目录结构速览

- `src/`：前端 React 代码。
- `src/components/Chat/`：主对话界面、输入框、附件、技能/专家/模型选择、右侧产物预览区。
- `src/components/Market/`：市场页，包含技能、专家、团队等列表展示。
- `src/components/Settings/` 与 `src/components/SettingsHub/`：设置中心。连接器 UI 在 `Settings/sections/ChannelsSection.tsx`。
- `src/components/ExpertHub/`、`src/components/Fish/`、`src/components/Skills/`：专家、匿名助手、技能相关前端页面。
- `src/i18n/zh.ts`、`src/i18n/en.ts`：中英文文案。仍有一些底层“小诺/Piscis”字样，不能简单全局替换。
- `public/`：前端静态图片，当前含 `in-app-icon.png`、`assistant-illustration.png`、`dialog-decoration.png` 等 9X bot 视觉资源。
- `src-tauri/`：Tauri 与 Rust 后端。
- `src-tauri/src/commands/chat.rs`：聊天主流程、技能强制路由、自动工作区、Agent prompt 等关键逻辑。
- `src-tauri/src/builtin_qinchuang.rs` 与 `src-tauri/src/builtin_qinchuang_experts.json`：内置“agency-agents-qinchuang”专家。
- `src-tauri/builtin_skillhub/`：预装 SkillHub 技能目录，当前约 24 个。
- `src-tauri/icons/`：应用图标、安装包图标。
- `docs/9xbot-branch-guide.md`：9xbot 分支维护说明。
- `CODEX_CHANGELOG.md`、`CHANGELOG.md`、`release_notes.md`：更新说明相关文件。

## 已完成或已修改的主要功能

### 品牌与视觉

- 产品显示名改为 `9X bot`。
- 对话主助手前端显示从“小诺/xiaonuo”逐步改为“包子”。
- 左侧/应用内图标、快捷方式图标、安装器图标已替换到 9X bot 视觉体系。
- 增加/调整了极简主题，设置里的“紫罗兰 / 黑金 / 极简”主题预设已存在。
- 首屏新建对话区域做过多轮 UI 调整：`日常办公 / 代码开发 / 创意设计` 居中、保留边框、文字前图案改为 emoji。
- 对话框加入包子装饰图，并做成“扒在输入框上方”的视觉方向。
- 左侧品牌区显示 `9X bot` 与 `v1.0.1`，居中显示。
- 设置里的“关于”“调试”已做隐藏处理，不面向普通用户显示。

### 对话与首页交互

- 首页 `文档处理 / 会议总结 / 邮件撰写` 等快捷任务按钮已从无效点击改为可触发：点击后进入对话并预填对应提示词。
- 修复过模型选择处 `Auto默认模型` 文案重叠问题。
- 右侧工作文件/产物预览区支持手动扩展，并加过全屏展示按钮。
- 工具调用记录与修改文件同时出现时，工具记录默认只保留最新几行可见，其余通过展开查看。
- 输入框附近的专家选择做过简化：默认只显示最近使用专家，并提供“召唤专家”入口。
- 专家召唤逻辑改为：未召唤时显示“召唤”，已在当前对话中显示“休假”。
- 专家入口图标在对话框下方改成博士帽；注意市场专家图标不要再被误删。

### 专家体系

- 拉取并整理过 `jnMetaCode/agency-agents-zh`，本项目内命名为 `agency-agents-qinchuang`。
- 将该项目中的主要专家内置进 9X bot，不要求用户再安装。
- 对专家分类、排序、去重、删除做过多轮整理：
  - 顺序偏向设计、营销、开发，再到其他。
  - 营销优先国内平台，再海外营销。
  - 删除 GIS 部、专项部、XR 座舱交互专家、测试部部分不常用专家、重复威胁检测工程师/招聘专家等。
  - 工程部与原作者已有架构师/程序员/代码审查员合并，避免重复。
  - 删除“微信公众号管理”，保留“微信公众号运营”。
  - 小红书重复专家已要求删掉多余项。
- 市场-专家页默认打开“已安装”，技能和团队也类似。

### 技能体系

- 用户提供过 `Skills_补全版.docx`，之后要求预装主流办公、设计、营销、开发技能，数量控制在 30 个以内。
- 当前 `src-tauri/builtin_skillhub/` 约 24 个预装技能，包括 PPT、会议纪要、发票整理、数据分析、公众号、广告投放、PRD、SQL、测试用例、视频脚本等。
- PPT 技能切换为 `ppt-generator-skill`。
- 对 PPT 生成做过关键逻辑加固：当用户需求明显是 PPT/演示文稿时，强制路由到 PPT 技能，不允许默认生成纯黑、纯白、无排版、无设计的 PPT。
- `src-tauri/src/commands/chat.rs` 中有一段 PPT 强制路由提示，要求：
  - 附件存在时先提取内容，不做 topic-only 生成。
  - 风格应结合记忆、用户表述、行业和附件判断。
  - 不确定风格时最多问一个简短问题。
  - 不向用户暴露 SKILL.md 读取、PowerShell Add-Type、COM Visible 等调试噪音。
  - 最终 PPT 要有明确视觉层级、配色和布局。
- 修复过导入附件出现两个一样文件的问题。
- 输入 `/` 调用 skill 的需求已做过相关开发，但后续仍需要完整回归。
- 输入框下方技能栏应只保留最近五个；无历史时默认办公相关五个。
- 技能“善春小红书爆款”要求去掉“善春AI”字样，注意不要破坏实际 skill name/触发逻辑。

### 工作区与安全

- 已做“按对话隔离工作区”：新对话不再全部混在同一个本地工作区目录中。
- 默认本地工作区从 piscis 迁移到 9xbot。相关逻辑在 `src-tauri/src/store/mod.rs` 与 `src-tauri/src/commands/chat.rs`。
- GitHub secret scanning 曾因示例里真实微信号/腾讯广告 ID 报警，已将 `src-tauri/builtin_skillhub/tencentads-delivery-smart-create/SKILL.md` 里的具体 ID 改成占位符并推送。

### 打包与发布

- 多次打包过可安装版本给同事测试。
- 安装包图标已换为用户提供的 Installer icon。
- 当前版本号已进到 `0.8.66`。
- 远端 fork/分支同步流程已经建立，用户的 GitHub fork 是 `JasonChooow/openpisci`，当前开发分支叫 `9xbot`。

## 正在开发但已暂停的功能

连接器/助理通道配置体验。

当前判断：

- 助理页不是独立连接器配置页，它复用 Chat 的 IM 模式。
- 连接配置入口在设置中心的“渠道”页。
- 相关文件：
  - `src/App.tsx`
  - `src/components/Settings/ChannelsPanel.tsx`
  - `src/components/Settings/sections/ChannelsSection.tsx`
  - `src/components/SettingsHub/useSettingsForm.tsx`
  - `src/services/tauri/chat.ts`
  - `src-tauri/src/gateway/*`
  - `src-tauri/src/commands/chat/gateway.rs`
  - `src-tauri/src/commands/config/enterprise_capability.rs`

产品判断：

- 普通用户最容易连的是个人微信扫码。
- 公司部署更适合企业微信、飞书、钉钉机器人。
- Slack/Discord/Teams/Webhook 多数偏发送通知，不应默认放在同一层级吓到用户。
- “消息通道”和“企业能力/MCP”应拆开；MCP 属于高级能力。

但用户已要求“连接器功能先不管了”，所以新会话不要继续这个方向，除非用户重新开启。

## 重要文件说明

- `src/App.tsx`：主应用布局、左侧导航、Chat/Assistant 渲染入口。
- `src/components/Chat/index.tsx`：主对话页面大文件，包含输入框、附件、专家/技能/模型选择、工作区选择、消息流等。
- `src/components/Chat/ArtifactPreview.tsx` 与 `src/components/Chat/ChatRightPanel.tsx`：右侧产物预览、宽度、全屏等。
- `src/components/SettingsHub/index.tsx`：设置中心导航；“关于/调试”隐藏逻辑在这里。
- `src/components/SettingsHub/useSettingsForm.tsx`：设置表单状态、保存、连接器、微信绑定、企业能力测试。
- `src/components/Settings/sections/ChannelsSection.tsx`：连接器 UI。当前被删除，必须先恢复或重写。
- `src/i18n/zh.ts`：大部分中文界面文案。注意文件里有历史“小诺/Piscis”文案，不能盲目全局替换。
- `src-tauri/tauri.conf.json`：产品名、版本、窗口标题、安装包配置、图标配置。
- `src-tauri/src/commands/chat.rs`：聊天核心逻辑，含 PPT 技能强制路由、按会话工作区、技能/专家调用、Agent prompt。
- `src-tauri/src/builtin_qinchuang.rs`：内置专家注入、清理、去重逻辑。
- `src-tauri/src/builtin_qinchuang_experts.json`：内置专家数据。
- `src-tauri/builtin_skillhub/*/SKILL.md`：预装技能内容。
- `scripts/apply-brand.mjs` 与 `brand.generated.json`：品牌替换和生成资源相关。

## 已知问题

1. 当前 `ChannelsSection.tsx` 删除未提交，构建会失败。用户说连接器先不管，但也不能留下缺文件。下一次动代码前建议先恢复旧版文件。
2. 前端仍有不少“小诺”“XiaoNuo”“Piscis”文案残留。用户能看到的地方应改成 `包子` 或 `9X bot`，底层架构名可以保留。
3. 不要全局替换 `piscis`。很多 Rust crate、localStorage key、内部 source、数据库 owner、bundle identifier 仍依赖这个名字，乱改会破坏兼容。
4. 终端里部分中文/emoji 显示为乱码，不一定代表前端实际乱码。改文案前尽量确认文件编码和浏览器实际显示。
5. `src-tauri/tauri.conf.json` 的 `mainBinaryName`、`identifier` 仍包含 `piscis`，这是兼容性和底层遗留，不要在未评估安装升级影响前改。
6. `About` 页面 GitHub 链接仍可能指向原作者仓库，后续要按产品策略决定是保留致谢、改 fork 地址，还是隐藏入口。
7. PPT 技能虽然做了强制路由提示，但仍需要用真实 Word/PDF/PPT 附件做回归测试，尤其是风格询问、模板选择、依赖缺失和错误提示是否足够用户友好。
8. 安装包和本地开发版本可能共用应用数据目录，测试安装前要确认是否影响本机配置。
9. `.cargo/` 是本机配置，不要随手提交。

## 下一步建议

1. 先处理中断现场：恢复 `src/components/Settings/sections/ChannelsSection.tsx` 到上一个提交，或者完整重写后再构建。若用户仍说连接器不做，建议直接恢复旧文件以保证项目可运行。
2. 跑一次基础校验：
   - `npm run build:web`
   - `cargo check --manifest-path src-tauri\Cargo.toml`
3. 启动开发版给用户看：
   - `cd /d E:\9xbot\DimWork`
   - `npm run tauri -- dev`
4. 回归 UI 品牌：
   - 首屏是否还有 WorkBuddy/Piscis/小诺。
   - 对话框助手是否显示包子。
   - 左上品牌区、登录区图标、安装包图标是否正确。
5. 回归技能：
   - `/` 是否能唤起技能。
   - 输入框下方是否只显示 5 个技能。
   - 直接要求“帮我做 PPT”是否强制走 PPT 技能，且不会生成纯黑/纯白无设计 PPT。
6. 回归专家：
   - 对话框下方专家只显示最近使用。
   - “召唤专家”能进入市场并真正召唤。
   - 市场专家分类、顺序、重复项和删除项是否符合用户之前要求。
7. 如果要继续连接器，再按“普通用户向导”重做：微信扫码优先，企业微信/飞书/钉钉做公司机器人，Slack/Webhook 等放高级。

## 不能改动和需要注意的约束

- 不要影响原作者仓库；所有开发走用户 fork 的 `9xbot` 分支。
- 不要把本地测试包、临时 zip、target 构建产物、`.cargo/` 等误提交。
- 不要删除用户提供的 UI 素材目录：`E:\9xbot\9Xbot UI`。
- 不要把专家市场、对话框专家图标等区域的原有图标误删；之前用户明确纠正过“市场专家图标不用改，哪怕有鱼 emoji 都可以”。
- 不要把所有 `Piscis/piscis` 全部替换成 `9X bot/9xbot`；只改用户可见品牌。
- 不要让普通用户看到“关于”“调试”等开发入口。
- 不要让技能执行过程把底层工具读取、PowerShell 警告、路径权限、SKILL.md 读取失败等调试过程直接吐给用户。
- 对 PPT/文档类任务，优先做成用户能直接用的结果，不要要求用户理解模板、依赖、脚本、COM、LibreOffice 等技术细节。
- 每次改完前端 UI，尽量实际启动或截图看一眼；这个项目 UI 细节容易因为宽度、中文长度、图标尺寸发生错位。

## 新会话开启提示词

请复制下面这段给新会话：

```text
我们继续开发 9X bot 项目。项目目录是 E:\9xbot\DimWork，分支是 9xbot，远端 fork 是 JasonChooow/openpisci。请先阅读根目录 PROJECT_HANDOFF_9XBOT.md，然后检查 git status。

重要：上一轮连接器页面重构被中断，src/components/Settings/sections/ChannelsSection.tsx 当前可能是删除未提交状态。连接器功能先不要继续开发，除非我重新要求；你要先保证项目能正常构建运行，必要时先恢复这个文件到上一个提交。

产品要求：前端用户可见品牌是 9X bot，主助手叫包子；底层 piscis 命名不要盲目全局替换。普通同事不懂技术，所以所有 UI 和技能流程都要尽量简单。改动后请做基本校验，能启动就启动给我看。
```
