# 任务看板：发布门禁复盘与契约缺口

<!--
落位：docs/task/2026-10-26-发布门禁复盘/board.md
本任务由 DEV 发起：复盘 TASK-001（v0.2.0）发布过程中暴露的门禁契约缺口。
当前状态为 spec_draft：缺口清单已由 DEV 提出，等待 ARCH 定稿裁决。
-->

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-002`（DEV 提议，ARCH 可改） |
| 任务目录 | `docs/task/2026-10-26-发布门禁复盘/` |
| 工作树 / 分支 | 本仓库 / `main` |
| 起始日期 | `2026-10-26` |
| 复盘基线 | `v0.2.0` / commit `7e84902` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `spec_draft` |
| 最后推进人 | `DEV`（提出缺口，未实施） |
| 最后更新 | `2026-10-26 04:50` |

> 状态推进权见 `templates/board.template.md`。DEV 只负责提出缺口与证据，
> 是否立项、如何定 AC、优先级排序由 ARCH 裁决；DEV 不修改契约与测试。

## 3. 验收准则进度

> 尚无 AC。下表按缺口编号占位，ARCH 定稿时重编为 AC 编号并补正文。

| 缺口 | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| G-1 bash 命令误判为写 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |
| G-2 自举任务不可放行 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |
| G-3 运行时副本漂移 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |
| G-4 新测试未接入自测/部署 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |
| G-5 发布元数据无真值源 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |
| G-6 放行证据未绑定推送对象 | `☐` | `☐` | `☐` | 待 ARCH 定稿 |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-1 | `contract-gap` | bash 门禁把 `bun tests/...`、`grep tests/...`、`git add -- ...` 判为写入并拒绝；同时 `--pathspec-from-file` 可绕过文本匹配 | `DEV` | `ARCH` | `04:50` |
| B-2 | `contract-gap` | 自举 / 维护任务无法产出 `qa-*-report-*.md`，pre-push 的 dev 分支永远 exit 1，只能 `unset TRIO_ROLE` 人工放行 | `DEV` | `ARCH` | `04:50` |
| B-3 | `contract-gap` | `profiles/*.rules.md` 与 `.omp/trio/*.rules.md` 双份维护，无相等断言；本次发布前已漂移而 111 项测试仍绿 | `DEV` | `ARCH` | `04:50` |
| B-4 | `contract-gap` | `trio-selftest.sh` 硬编码 3 个 suite，未跑 `trio-pre-push.test.mjs`；`init-agent.sh` 也只部署 3 个测试 | `DEV` | `ARCH` | `04:50` |
| B-5 | `contract-gap` | 无 `CHANGELOG.md` / `VERSION` / `package.json`；版本号只在 README 散文与 tag 中，发布靠手工 | `DEV` | `ARCH` | `04:50` |
| B-6 | `contract-gap` | pre-push 的报告 glob 是全仓库、看板取 mtime 最新；放行证据未绑定待推任务 / 提交，旧报告可放行新推送 | `DEV` | `ARCH` | `04:50` |

> 连续 3 轮未全绿 → 停手并在此记 `blocked` 四项。本任务尚无实现轮次。

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| — | — | — | — |

## 6. 交接备注

DEV 已产出 `dev-20261026-0450-bug-1.md`（6 项契约缺口 + 可复现证据 + 建议方向）。
下一步：ARCH 阅读该文件，决定哪些立项、是否新建 / 修订 spec，并回答文档
「§6 待 ARCH 决定的问题」。DEV 在 ARCH 定稿前不实施、不改 `tests/**`、
不改 `arch-*.md`。
