# CB Teams 来源说明

本目录下 `vendor/cb-teams/` 为上游镜像，**不直接上架**；经 `scripts/convert-cb-teams-marketplace.mjs` 改写后的产物位于：

| 目录 | 规范 |
|------|------|
| `experts/*.json` | [expert-pack.v1.schema.json](./schema/expert-pack.v1.schema.json) |
| `teams/*.json` | [team-template.v2.schema.json](./schema/team-template.v2.schema.json) |
| `skills/*/` | 小诺 SKILL.md（frontmatter + 工作区工具映射） |
| `inspiration/cb-teams-scenes.json` | 灵感场景（示例 prompt） |

## 上游

- 仓库：[codebuddy/cbteamsmarketplace](https://cnb.cool/codebuddy/cbteamsmarketplace)
- 镜像下载：`https://cnb.cool/codebuddy/cbteamsmarketplace/-/git/archive/main.tar.gz`
- 索引：`vendor/cb-teams/.codebuddy-plugin/marketplace.json`

## 许可与署名

- 上游插件多为 **MIT**；改写时移除 CodeBuddy / Claude 品牌引用，工具映射为小诺内置能力。
- 上架 ID 命名空间：`openpisci/expert|team|skill/{slug}@1.0.0`
- 保留 `origin` / `origin_plugin` 字段便于追溯与后续增量同步。

## 更新流程

```bash
# 1. 重新拉取上游（覆盖 vendor/cb-teams）
curl -sL 'https://cnb.cool/codebuddy/cbteamsmarketplace/-/git/archive/main.tar.gz' | tar -xz -C marketplace/vendor/cb-teams --strip-components=1

# 2. 重新生成 catalog
node scripts/convert-cb-teams-marketplace.mjs
```
