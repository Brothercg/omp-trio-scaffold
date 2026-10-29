# profiles 规则文本同步执行提示词（无角色 omp 窗口执行）

<!--
落位：docs/task/TASK-007-2026-10-29-门禁加固与流程落地/arch-20261029-1420-prompt-profiles同步.md
【已作废】本单已整体并入 TASK-008 执行提示词（docs/task/TASK-008-2026-10-29-回复结构内建/arch-20261029-1723-prompt-无角色执行.md），
以合并单为准执行，本单不再单独执行。
用法：用户开一个不设置 TRIO_ROLE 的 omp 窗口，整段粘贴以下分隔线内内容。
依据：ADR-0013 §5「文本同步待办」——profiles 随公共维护区一次同步。
注意：ADR-0013 §5 写作 profiles/qa.rules.md，实际文件名为 profiles/test.rules.md（QA 简报），同一件。
-->

---

你在一个**无角色限制**的 omp 会话中执行 TRIO 机制仓的规则文本同步：把 ADR-0013 的「根因分类强制项」与「熔断仅计实现轮」口径补进 `profiles/*.rules.md`（三份角色简报）。本提示词自包含，逐步执行。

## 仓库与依据
- 工作目录：`/home/cg/projects/omp-trio-scaffold`（不在则先 `cd`）。
- 本窗口**不要设置** `TRIO_ROLE`（policy 对 `profiles/**` 三角色均 fail-closed，本同步走无身份通道）。
- 依据：`docs/architecture/ADR-0013-交付流程契约.md` §2.3（熔断口径）与 §5（文本同步待办）；`docs/RUNBOOK.md` §4（已落地的同口径表述，照它对齐）。

## 铁律（违者即任务失败）
1. 禁止 `git push` / `git tag` / 发布。
2. commit 显式 pathspec；禁 `git add -A` / `git add .`。
3. 只改 `profiles/arch.rules.md`、`profiles/dev.rules.md`、`profiles/test.rules.md` 三个文件，且**只做下述四处增补**，其余一字不动。

## 增补内容（逐字）

### A. 三份文件的「3 轮熔断」条（各自「纪律」节第 2 条）
各文件该条首行现为（称谓不同）：
- `arch.rules.md`：`2. **3 轮熔断**：「QA 判未通过 → DEV 修 → QA 复测仍未通过」计 1 轮。`
- `dev.rules.md`：`2. **3 轮熔断**：「QA 判未通过 → 你修 → QA 复测仍未通过」计 1 轮。`
- `test.rules.md`：`2. **3 轮熔断**：「你判未通过 → DEV 修 → 你复测仍未通过」计 1 轮。`

在每份该行的 `计 1 轮。` 之后**追加同一句**（不动原行其余文字）：

```
计数仅含 `[根因:实现]` 轮；`[根因:契约]` / `[根因:用例]` / `[根因:环境]` 轮 1 轮内转 contract-gap 裁决 / 修用例 / 修环境，不计熔断轮（与 `RUNBOOK.md` §4、ADR-0013 §2.3 同口径）。
```

### B. `test.rules.md` 的「验收报告自检」清单
在该清单 `- [ ] 每个未通过项都有 期望/实际/复现` 一行之后追加一行：

```
- [ ] 每个未通过项都带 `[根因:实现]` / `[根因:契约]` / `[根因:用例]` / `[根因:环境]` 之一（机检 T11）；`[根因:契约]` 即刻提 contract-gap 交 ARCH 裁决
```

## 执行步骤
1. 按上述 A/B 逐字增补（共四处）。
2. 自验：`git diff` 只含四处增补行；`for t in tests/*.test.mjs; do bun "$t"; done` 全绿零回归；`bash bin/trio-selftest.sh` 全绿。
3. `git commit` 显式 pathspec：`docs(roles): profiles 三份简报同步 ADR-0013 口径（根因分类强制项 + 熔断仅计实现轮）`，只含三个 rules 文件。

## 完成判定
- `git diff` 恰四处增补；回归全绿。
- **不 push**。完成后停止，回复 commit hash 与四处 diff 摘要。

---
（提示词结束）
