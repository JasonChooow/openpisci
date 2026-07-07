# Codex Change Log for Upstream Handoff

This file tracks local 9X bot changes made while debugging DimWork/openpisci on the `9xbot` branch.
It is intended to be converted into an upstream issue, PR description, or patch notes for the project author.

## Working Context

- Repository: `njbinbin/openpisci`
- Local path: `E:\9xbot\DimWork`
- Branch: `9xbot`
- Test app path: `E:\9xbot\DimWork\target\debug\piscis-desktop.exe`
- Main focus: local build, skills/tool installation flow, and agent runtime behavior.

## Change Tracking Rules

For each meaningful adjustment, record:

- Symptom or problem observed
- Root cause or current hypothesis
- Files changed
- Implementation summary
- Verification result
- Whether the change is likely upstream-worthy or local-only

## Changes So Far

### 2026-07-07. Forced first-run guide and expert market polish

- Problem: New users still needed a clearer first-use path after configuring an API key, and the expert market needed to separate core preinstalled experts from the larger bundled catalog.
- Files changed:
  - `src/App.tsx`
  - `src/App.css`
  - `src/components/Chat/index.tsx`
  - `src/components/ExpertHub/ExpertHub.css`
  - `src/components/ExpertHub/index.tsx`
  - `src/components/Market/MarketCatalogGrid.tsx`
  - `src/services/tauri/platform.ts`
  - `src/utils/marketSource.ts`
  - `src-tauri/src/app/bootstrap.rs`
  - `src-tauri/src/builtin_qinchuang.rs`
  - `src-tauri/src/commands/platform/marketplace.rs`
  - `CHANGELOG.md`
  - `release_notes.md`
- Summary:
  - Added a required four-step first-run guide after initial API configuration. It highlights "new task", work type tabs, the market entry, and the guide entry, then records completion so it does not auto-open again.
  - Important future handoff: when login/registration is added, move this forced guide trigger from "API configuration completed" to "new user registration completed and first main-screen entry", while preserving one-time completion behavior.
  - Added a local development preview path at `http://localhost:5174/?tour=1` so already-configured development builds can preview the guide without resetting user settings.
  - Limited default installed qinchuang experts to the main office/marketing set and left the remaining bundled experts in the market for manual adding.
  - Added market expert install state, colored expert cards, tighter sticky market navigation, and back-to-top behavior for long market lists.
- Verification:
  - `npm run build:web` passed.
  - Local preview at `http://localhost:5174/?tour=1` showed the guide with the first step highlighting `+新建`.
- Upstream suitability: mostly 9X bot product polish. The forced-guide trigger and market defaults are branch-specific; the one-time onboarding-tour pattern may be useful upstream if generalized.

### 2026-07-04. 9X bot model configuration and guide entry polish

- Problem: The first-run guide button did not create a normal chat when no conversation existed, and the model configuration flow still exposed hardcoded model choices plus a required model-name field for custom relay providers.
- Files changed:
  - `src/App.tsx`
  - `src/components/Chat/index.tsx`
  - `src/components/Onboarding/index.tsx`
  - `src/components/Settings/sections/ModelsSection.tsx`
  - `CHANGELOG.md`
  - `release_notes.md`
- Summary:
  - Fixed the no-session "新手指引" path so it creates a chat and fills the preset prompt.
  - Removed hardcoded built-in model rows from the composer model picker.
  - Added first-run custom OpenAI-compatible relay configuration.
  - Made custom relay model names optional and relies on the existing `/models` API to expand available relay models in the chat model picker.
  - Replaced truncated provider prefixes with clearer provider marks in the chat model list.
- Verification:
  - `npm run build:web` passed.
  - `npm run package:windows` passed and generated `target/release/bundle/nsis/9Xbot-installer-1.0.1.exe`.
- Upstream suitability: 9X bot product polish; parts may be upstream-worthy as custom provider UX improvements, but visible naming should stay 9X bot-specific on this branch.

### 2026-07-03. 9X bot v1.0.1 guidance, workspace, search, upload, and installer polish

- Problem: The coworker-facing build needed a simpler active-run guidance flow, less confusing expert/skill search and upload behavior, readable workspace folders, and a reliable installer name/icon for sharing.
- Files changed:
  - `src/components/Chat/index.tsx`
  - `src/components/Chat/Chat.css`
  - `src/components/Market/MarketCatalogGrid.tsx`
  - `src/components/ui/AppDropdown.tsx`
  - `src/i18n/zh.ts`
  - `src/i18n/en.ts`
  - `src/services/tauri/chat.ts`
  - `src/services/tauri/tauri.test.ts`
  - `src-tauri/src/commands/chat.rs`
  - `src-tauri/src/store/mod.rs`
  - `src-tauri/src/app/bootstrap.rs`
  - `scripts/apply-brand.mjs`
  - `scripts/make_icons.mjs`
  - `scripts/standardize-installer-name.mjs`
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/icons/*`
- Summary:
  - Added non-interrupting chat guidance for active Baozi runs. The composer can stage an "引导命令", send it to the running agent, and persist it into conversation history with a visually lighter message style.
  - Search and share paths strip internal guidance markers while preserving guidance content in context.
  - Updated composer expert/skill search to target the installed catalog rather than only recent items, and added market expert search.
  - Simplified attachment upload to "all files" only.
  - Changed automatic session workspace folders to `title_MMDD-HHMM` with collision handling.
  - Standardized package version to `1.0.1`.
  - Updated icon generation so `installer.ico` is refreshed from the same 9X bot artwork as the app icon.
  - Added a package script that copies the Windows installer to `9X-bot-installer-{version}.exe` after packaging.
- Verification:
  - `npm run build:web` passed.
  - `cargo check --manifest-path src-tauri\Cargo.toml` passed.
  - Local app loaded at `http://localhost:5174/`; homepage and scene switching rendered correctly in the in-app browser.
  - `npm test` remains blocked by the existing Vitest/Vite `vite/module-runner` package export mismatch before tests execute.
- Upstream value: Mixed. Guidance, workspace naming, catalog search, upload simplification, and package naming may be upstream-worthy as UX improvements. 9X bot branding and installer artwork are branch-specific.

### 2026-07-02. Secret scanning cleanup for bundled Tencent Ads skill

- Problem: GitHub secret scanning flagged a concrete WeChat/Tencent ecosystem id inside a bundled Tencent Ads skill example.
- Files changed:
  - `src-tauri/builtin_skillhub/tencentads-delivery-smart-create/SKILL.md`
- Summary:
  - Replaced the concrete `wechat_official_account_id` example value with a placeholder.
  - Re-scanned bundled skill/frontend/backend files for the same `wx` id pattern and found no remaining matches.
- Verification:
  - `rg "wx[0-9a-fA-F]{16}" ...` returned no remaining matches in the checked source and bundled skill paths.
- Upstream value: Generally useful; example docs should not include real platform identifiers.

### 2026-07-02. Per-chat workspace folders

- Problem: Regular chat sessions inherited the global workspace root directly, so files produced across different conversations were collected in the same folder.
- Files changed:
  - `src-tauri/src/commands/chat.rs`
- Summary:
  - Added automatic per-chat workspace folder creation under the global workspace root.
  - New regular chat sessions now receive a folder named from the chat title plus a short session id.
  - Existing regular chat sessions without a workspace override are backfilled the first time their workspace is resolved.
  - When a regular chat is renamed before files are produced, its automatic workspace folder follows the clearer chat title.
  - Manual per-session workspace selections, IDE sessions, team/project sessions, and non-chat sources continue to use their explicit paths.
- Verification:
  - `cargo check --manifest-path src-tauri\Cargo.toml` passed.
  - Full `cargo test ... session_workspace` is blocked by an unrelated existing `pool_event_bridge.rs` test fixture error about missing `member_koi_ids`.
- Upstream value: Generally useful; it prevents workspace clutter while preserving existing explicit workspace overrides.

### 2026-07-01. 0.8.66 installer icon refresh

- Problem: The generated desktop installer could still appear with a default-looking icon in Windows Explorer, despite the NSIS installer icon being configured.
- Files changed:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/icons/installer.ico`
- Summary:
  - Bumped the packaged app version from `0.8.65` to `0.8.66`.
  - Regenerated the installer `.ico` from `E:\9xbot\9Xbot UI\Installer icon.png` with 16, 32, 48, 64, 128, and 256 px entries for better Windows Explorer display.
- Verification:
  - `npm run tauri -- build` passed and produced `9X bot_0.8.66_x64-setup.exe`.
  - Extracted the installer executable icon after build and confirmed it uses the regenerated 9X bot installer artwork.
- Upstream value: Local-only 9X bot packaging/branding.

### 2026-07-01. 9X bot UI polish, PPT robustness, and installer branding

- Problem: The 9X bot branch needed a coworker-friendly testing build with clearer branding, simpler first-run entry points, fewer exposed technical details, and more reliable PPT generation from real business documents.
- Files changed:
  - `src/components/Chat/index.tsx`
  - `src/components/Chat/Chat.css`
  - `src/components/Chat/ChatPanels.tsx`
  - `src/components/Chat/ChatRightPanel.tsx`
  - `src/components/Sidebar/SidebarHeader.tsx`
  - `src/components/Sidebar/AccountMenu.tsx`
  - `src/components/SettingsHub/index.tsx`
  - `src/components/ui/AppDropdown.css`
  - `src/utils/skills.ts`
  - `src-tauri/builtin_skillhub/ppt-generator-skill/SKILL.md`
  - `src-tauri/builtin_skillhub/ppt-generator-skill/scripts/generate.js`
  - `src-tauri/src/commands/chat.rs`
  - `src-tauri/src/app/bootstrap.rs`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/icons/installer.ico`
- Summary:
  - Reworked visible assistant branding to Baozi/包子 and 9X bot assets across the main UI.
  - Added a cleaner white/minimal theme and hid About/Debug settings from normal users.
  - Improved the chat composer visual treatment, input auto-sizing, expert/skill compact menus, and model selector readability.
  - Added first-screen quick action prompts so office/code/design examples open a new chat and prefill a useful starter prompt.
  - Hardened bundled PPT generation for Word/PDF/TXT/Markdown/PPTX/Excel/image inputs, including source-first slide JSON generation, layout variation, placeholder detection, compare-column de-duplication, and non-technical error handling.
  - Refreshed the SkillHub preinstall marker so updated bundled skills are reseeded locally.
  - Added a custom NSIS installer/uninstaller icon generated from `E:\9xbot\9Xbot UI\Installer icon.png`.
- Verification:
  - `npm run build:web` passed.
  - `cargo check --manifest-path src-tauri\Cargo.toml` passed during the PPT/UI hardening pass.
  - `node --check src-tauri\builtin_skillhub\ppt-generator-skill\scripts\generate.js` passed.
- Upstream value: Mixed. PPT robustness, attachment handling, composer sizing, and task panel compaction are generally upstream-worthy. 9X bot branding, Baozi visuals, bundled Qinchuang experts, and installer artwork are branch-specific.

### 2026-06-30. 9X bot bundled experts, skills, PPT workflow, and composer fixes

- Problem: Non-technical company users had to manually install useful experts and skills before the product felt ready to use. PPT generation was especially fragile: the SkillHub PPT skill had been seeded as a single `SKILL.md`, so its referenced `templates/`, `references/`, and generation scripts were missing. This caused plain black/white decks, failed PowerPoint COM attempts, and repeated attempts to read `SKILL.md` from outside the workspace.
- Files changed:
  - `src-tauri/src/builtin_qinchuang.rs`
  - `src-tauri/src/builtin_qinchuang_experts.json`
  - `src-tauri/src/builtin_skillhub.rs`
  - `src-tauri/builtin_skillhub/**`
  - `src-tauri/src/app/bootstrap.rs`
  - `src-tauri/src/commands/chat.rs`
  - `src-tauri/src/skills/loader.rs`
  - `src/components/Chat/index.tsx`
  - `src/components/ExpertHub/**`
  - `src/components/Pond/KoiManager/**`
  - `src/components/Market/MarketCatalogGrid.tsx`
  - `src/utils/skills.ts`
  - `src/utils/expertOrdering.ts`
  - `src/i18n/en.ts`, `src/i18n/zh.ts`
- Summary:
  - Rebranded visible product/app naming toward 9X bot.
  - Added bundled Qinchuang experts and cleaned expert ordering/categories for design, marketing, development, and office use.
  - Added bundled SkillHub skills under 30 main office/design/marketing/development skills.
  - Replaced the old PowerPoint skill with `ppt-generator-skill` and bundled supporting `templates`, `references`, and `scripts/generate.js`.
  - Added deterministic skill routing for common requests, especially PPT generation, so matching skills are injected automatically instead of relying on the model to discover them.
  - Embedded selected skill instructions and supporting markdown into the prompt, avoiding outside-workspace `file_read` loops.
  - Added composer `/` skill invocation and kept the compact skill picker focused on basic office skills.
  - Fixed duplicate attachment chips by de-duplicating attachments in both frontend composer state and backend chat send handling.
- Verification:
  - `npm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
  - Generated a real test PPTX from the installed `ppt-generator` skill script.
  - Confirmed development app runs at `http://localhost:5174`.
- Upstream value: Partly upstream-worthy and partly 9X bot product-specific. The generic improvements worth proposing upstream separately are skill routing, full-directory bundled skill seeding, selected-skill prompt embedding, and attachment de-duplication. The 9X bot branding and Qinchuang expert pack should stay on the `9xbot` branch unless upstream wants a white-label extension point.

### 4. Chat composer can select a full named LLM provider per turn

- Problem: The settings page already stores multiple named LLM providers, but the chat composer only sent a `model_override` string. That changed the model name only and could not switch provider, API key, Base URL, or per-provider max tokens.
- Files changed:
  - `src/components/Chat/index.tsx`
  - `src/services/tauri/chat.ts`
  - `src-tauri/src/commands/chat.rs`
- Summary: Added a `modelProviderId` / `model_provider_id` per-turn option. The chat model dropdown now uses each named provider's stable `id`, and the backend resolves that id through `settings.find_llm_provider(...)` to switch provider, model, API key, base URL, and max tokens for the current turn. The dropdown now also supports built-in model ids such as `builtin:openai:gpt-4o`, letting the backend switch to the matching built-in provider/key instead of only overriding the model string.
- Verification:
  - `pnpm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy. This completes the existing named-provider UI by connecting it to real chat execution.

### 4a. Model picker is grouped into built-in and custom models

- Problem: The old composer picker did not match the desired model-menu shape. It mixed the default model and custom entries in a flat list, and selecting a GPT-style option could still leave the actual turn effectively on the default provider if only the model name was overridden.
- File changed:
  - `src/components/Chat/index.tsx`
- Summary: Reworked the composer model picker into grouped rows: default model, built-in models, custom models, and a direct entry for configuring custom models. The selected model id is persisted in local storage so the user's chosen model stays active across reloads. Built-in rows without configured provider keys are shown but disabled.
- Verification:
  - Opened the development app.
  - Confirmed the composer dropdown shows `内置模型`, `自定义模型`, and `+ 配置自定义模型`.
  - Selected a custom GPT-style model and confirmed the composer button displays that model.
  - `npm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy. This makes the chat model picker behave like a first-class multi-model switcher rather than a cosmetic model-name selector.

### 4b. Expand OpenAI-compatible relay model lists in the composer

- Problem: A relay provider can expose many models through its `/models` endpoint, including image or multimodal models, but the composer only showed the single manually saved model entry. Users had to know and type every model id by hand.
- Files changed:
  - `src-tauri/src/commands/chat.rs`
  - `src-tauri/src/app/bootstrap.rs`
  - `src/services/tauri/chat.ts`
  - `src/components/Chat/index.tsx`
- Summary: Added a `list_llm_provider_models` Tauri command that fetches `{base_url}/models` for a saved named provider without exposing its API key to the frontend. The chat composer now expands each custom provider into the models returned by the relay. Selecting an expanded model sends an id shaped like `provider-id::model-id`; the backend resolves the provider's key/Base URL and applies the selected model id for that turn.
- Verification:
  - Restarted the development app.
  - Confirmed searching `image` in the composer model dropdown shows relay-provided image models.
  - `npm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy. This lets OpenAI-compatible relay providers behave like model catalogs instead of one manually configured model at a time.

### 4c. Prevent image-generation-only models from being used as chat models

- Problem: Some OpenAI-compatible relay catalogs return image generation models beside chat models. Selecting one of those entries in the chat composer makes the app send it through the chat-completions path, causing provider-side 400 errors because image generation models require an image generation endpoint instead of a chat endpoint.
- Files changed:
  - `src/components/Chat/index.tsx`
  - `src-tauri/src/commands/chat.rs`
- Summary: Added image-generation model detection in the composer. These models remain visible in the custom model catalog under a disabled "image generation model" group so users can see that the relay exposed them, but they cannot be selected as the current chat model. If a previously cached selection points to an image-generation-only model, the composer falls back to the default chat model. The backend also rejects image-generation-only model ids with a clear local error before calling the relay.
- Verification:
  - `npm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy guardrail. A later feature can add a dedicated image generation tool/API path that calls image generation endpoints directly.

### 4d. Add scene-based model routing for office, code, and creative design

- Problem: Chat, code, image generation, and future video generation models were all surfaced through the same composer model menu. This made image-generation models visible in the wrong workflow and made it unclear whether a selected model should run through chat completions or a generation endpoint.
- Files changed:
  - `src/components/Chat/index.tsx`
  - `src/components/Chat/Chat.css`
  - `src/services/tauri/chat.ts`
  - `src-tauri/src/commands/chat.rs`
- Summary: Added a persisted chat scene state with three product modes: office, code, and creative design. The empty chat screen now presents these modes prominently in the main canvas, and the composer also keeps a compact scene switcher for existing conversations. The model menu filters creative generation models out of office/code scenes, while the creative design scene shows image/video generation candidates as selectable creative models. The selected scene is sent to the backend with each turn.
- Verification:
  - `npm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy product structure. It separates model capability from generic chat selection and matches a clearer user-facing workflow.

### 4e. Route selected image-generation models to an image generation endpoint

- Problem: Image generation models such as relay-provided `*-image` models cannot be called through chat completions. They need a dedicated image generation request path, but users still expect to select them from the creative design scene and send a prompt naturally.
- Files changed:
  - `src-tauri/src/commands/chat.rs`
- Summary: When the selected model is recognized as image-generation-only and the current scene is creative design, `chat_send` now saves the user prompt, calls the provider Base URL's `/images/generations` endpoint with the selected model, supports both `b64_json` and `url` image responses, stores the generated image under the app data directory, registers it as an image artifact for the session, and writes a Markdown image reply back to the chat. In non-design scenes, image-generation-only models are rejected with a local scene mismatch error.
- Verification:
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy first implementation of capability-based routing. Future work can add provider-specific size/aspect controls and a matching video-generation route.

### 5. Selected named model participates in multimodal image handling

- Problem: Image attachment handling previously depended on the global vision settings. Selecting a named multimodal model such as GPT-4o, Claude, Gemini, or Qwen-VL would not necessarily make the current turn treat image attachments as vision input.
- File changed:
  - `src-tauri/src/commands/chat.rs`
- Summary: The effective provider/model selected for the current turn now runs through the existing `model_supports_vision(...)` heuristic. If the selected model is recognized as vision-capable, the turn can pass image attachments inline to the LLM even when the global default model is different.
- Verification:
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy. A future enhancement could add an explicit per-named-provider `vision_enabled` flag in `piscis-engine`'s `LlmProviderConfig` for custom multimodal endpoints that cannot be recognized by model name.

### 6. Persist additional model entries immediately from the model settings page

- Problem: The model settings page had a nested "Named LLM providers" editor. Its local save button only updated the in-page list, so users could think the model was saved while the app-level settings were not persisted yet. After restart, the additional model list could appear empty, and the chat composer had no extra models to select.
- Files changed:
  - `src/components/SettingsHub/useSettingsForm.tsx`
  - `src/components/Settings/sections/ModelsSection.tsx`
- Summary: Added a shared `saveLlmProviders(...)` path that persists the additional model list through `settingsApi.save(...)`, updates Redux settings, and marks the settings as saved immediately. The model settings page now shows the default model and additional models in one list, making additional models feel like first-class chat-selectable models instead of a secondary hidden configuration.
- Verification:
  - `pnpm run build:web` passed.
  - `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Upstream-worthy. This closes the confusing gap between adding a model in the model page and seeing it available in chat after restart.

### 7. Make the additional-model entry easier to find and open

- Problem: The add-model entry was visually presented as a secondary "provider" section, so users could not easily find it as a first-class model configuration. In local testing, the small secondary button was easy to miss and hard to hit reliably.
- Files changed:
  - `src/components/Settings/sections/ModelsSection.tsx`
  - `src/i18n/zh.ts`
  - `src/i18n/en.ts`
- Summary: Changed the section copy from provider-centric wording to model-centric wording ("Model list" / "Add model"), made the add entry a full-width primary button, and gave new model entries an auto-generated id seed so the form opens ready to edit.
- Verification:
  - Opened the development app with Computer Use.
  - Navigated through local account menu -> Settings -> AI Model.
  - Confirmed the full-width add entry opens the add-model form.
  - `pnpm run build:web` passed.
- Upstream value: Upstream-worthy UX fix.

### 8. Local development port moved to 5174

- Problem: On this Windows machine, an old Vite process held port `5173` and resisted normal termination. This made the dev app sometimes load stale UI and made the add-model fix hard to verify.
- Files changed:
  - `vite.config.ts`
  - `src-tauri/tauri.conf.json`
- Summary: Changed the local Tauri development URL to `http://localhost:5174` and made Vite read `VITE_DEV_PORT`, defaulting to 5174.
- Verification:
  - Tauri dev launched successfully.
  - Vite reported `http://localhost:5174/`.
  - Running process path confirmed: `E:\9xbot\DimWork\target\debug\piscis-desktop.exe`.
- Upstream value: Probably local-only unless the author also wants configurable dev port support.

### 1. Cargo mirror configuration for local Windows build

- Problem: Cargo crate downloads timed out repeatedly from the default registry in this local network environment.
- Files changed:
  - `.cargo/config.toml`
  - `src-tauri/.cargo/config.toml`
- Summary: Added a sparse crates.io mirror configuration using USTC to make dependency resolution reliable on this machine.
- Verification: Rust dependency resolution and `cargo check` completed successfully after the mirror configuration.
- Upstream value: Probably local-only. The author may not want to commit this unless the project intentionally supports China-mainland mirror defaults.

### 2. Allow currently unused marketplace manifest fields

- Problem: `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` failed because warnings are treated as errors and `channel` / `signature` fields were deserialized but not read.
- File changed:
  - `src-tauri/src/commands/platform/marketplace.rs`
- Summary: Added `#[allow(dead_code)]` to the two currently unused optional manifest fields so the strict build can pass without changing runtime behavior.
- Verification: `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml` passed.
- Upstream value: Likely upstream-worthy, or alternatively the author can consume/validate these fields instead of allowing dead code.

### 3. pnpm dependency lock and build approval state

- Problem: `npm install` was unreliable locally due cache permission/network issues; `pnpm` installed dependencies successfully but blocked `esbuild` postinstall until approved.
- Files generated:
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
- Summary: Used `pnpm` for a stable local dependency install and approved the `esbuild` build script.
- Verification: `pnpm run build:web` completed successfully.
- Upstream value: Needs author decision. If the project wants pnpm as supported package manager, commit these; otherwise treat as local setup files.

## Current Verification Snapshot

- Branch: `xiaonuo`
- Frontend build: passed with `pnpm run build:web`
- Rust check: passed with `cargo check -p piscis-desktop --manifest-path src-tauri\Cargo.toml`
- Tauri dev app: launched successfully from source
- Running process: `piscis-desktop.exe`
- Local testing mode: close the installed packaged app first, then run the development build from `E:\9xbot\DimWork`; verify the process path is `E:\9xbot\DimWork\target\debug\piscis-desktop.exe` before testing.

## Open Investigation Notes

### `skill_list` tool availability

- Current finding: Source code contains a `skill_list` tool and registers it only when the tool is enabled and a skill loader is present.
- Current hypothesis: Runtime errors like `Tool 'skill_list' not found` are likely caused by scene/profile tool allowlist filtering, not by the tool source file being absent.
- Relevant files to inspect further:
  - `src-tauri/src/tools/skill_list.rs`
  - `src-tauri/src/host.rs`
  - `src-tauri/src/commands/chat.rs`
  - `src-tauri/src/commands/config/scene.rs`
  - `src-tauri/src/commands/config/skills.rs`
  - `src-tauri/src/commands/config/openai_skills.rs`
