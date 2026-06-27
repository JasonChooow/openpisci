# 9X bot 分支维护说明

本文档说明本 fork 的分支和同步方式，避免误推到原作者仓库。

## 仓库关系

- 原作者仓库：`upstream` -> `https://github.com/njbinbin/openpisci.git`
- 我们的 fork：`origin` -> `https://github.com/JasonChooow/openpisci.git`
- 我们的长期开发分支：`9xbot`
- 原作者当前基准分支：`xiaonuo`

本地已禁用 `upstream` 的 push 地址，避免误把 9X bot 改动推到原作者仓库。

## 日常开发

所有 9X bot 自定义改动都在 `9xbot` 分支上进行：

```bash
git switch 9xbot
git pull
```

提交并推送到自己的 fork：

```bash
git add .
git commit -m "描述这次改动"
git push
```

## 同步原作者更新

当原作者 `njbinbin/openpisci` 有新更新时，先拉取原作者仓库：

```bash
git fetch upstream
```

然后把原作者的 `xiaonuo` 分支合并到我们的 `9xbot`：

```bash
git switch 9xbot
git merge upstream/xiaonuo
```

如果出现冲突，先解决冲突，再提交同步结果：

```bash
git add .
git commit
git push
```

## 给原作者贡献代码

不要直接从 `9xbot` 分支给原作者提 Pull Request，因为里面包含 9X bot 品牌、自定义界面、本地构建配置等内容。

如果有适合贡献给原作者的通用修复，应从原作者分支单独切干净分支：

```bash
git fetch upstream
git switch -c fix/some-upstream-fix upstream/xiaonuo
```

只挑选通用修复提交，然后推到自己的 fork：

```bash
git push -u origin fix/some-upstream-fix
```

再从 GitHub 页面向 `njbinbin/openpisci` 提 Pull Request。

## 当前状态

截至本文档创建时：

- `9xbot` 分支已推送到 `JasonChooow/openpisci`
- 该分支包含 9X bot 品牌替换、三场景入口、模型选择增强、图片生成分流、极简主题等本地定制
- 这些改动默认只维护在自己的 fork 中
