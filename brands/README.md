# 品牌包（Brand packs）

同一套功能代码，通过 `BRAND` 环境变量切换用户可见的品牌（名称、图标、打包元数据）。

## 目录结构

```
brands/
  xiaonuo/          # 默认：小诺
    brand.json
    icon-source.png # 可选，1024+  mascot 源图
  xiaoke/           # 示例：小锞
    brand.json
    icon-source.png
```

## 常用命令

```bash
# 应用默认品牌（小诺）— 写 tauri / i18n 运行时配置 / Rust 常量
npm run brand:apply

# 切换到小锞（仅改品牌层，业务代码不变）
npm run brand:xiaoke

# 构建小锞安装包
npm run brand:xiaoke && npm run tauri build

# 切回小诺并恢复仓库默认提交态
npm run brand:xiaonuo
```

## 工作原理

1. `scripts/apply-brand.mjs` 读取 `brands/<id>/brand.json`
2. 生成 `src/brand.generated.json`（前端运行时）
3. 生成 `src-tauri/src/brand_generated.rs`（后端 User-Agent、GitHub 检查等）
4. 更新 `tauri.conf.json`、`index.html` 中的打包与窗口标题
5. 若存在 `icon-source.png`，调用 `scripts/make_icons.py` 生成全套图标
6. 前端 i18n 在初始化时对 `zh.ts` / `en.ts` 做字符串替换（`i18nReplace`），无需维护两份翻译

## 并排安装两个 App

在 `brand.json` 里为不同品牌设置不同的 `bundleIdentifier`（小锞示例为 `com.xiaoke.desktop`）。

## 发版建议

- **功能开发**：只在 `xiaonuo` 分支提交，仓库内保持 `npm run brand:xiaonuo` 后的状态
- **小锞包**：CI 中 `BRAND=xiaoke npm run brand:apply && npm run tauri build`，打 tag `v0.8.65-xiaoke`
- **不要改**内部 `piscis_*` 标识，除非你有意隔离数据目录

## 自定义新品牌

1. 复制 `brands/xiaoke/` 为 `brands/<your-id>/`
2. 编辑 `brand.json` 中的名称与 `i18nReplace`
3. 放入 `icon-source.png`（透明或浅色底 mascot 图）
4. `BRAND=<your-id> npm run brand:apply`
