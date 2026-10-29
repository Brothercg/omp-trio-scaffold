# init rc 语义修复执行提示词（无角色 omp 窗口执行）

<!--
落位：docs/task/TASK-008-2026-10-29-回复结构内建/arch-20261029-1813-prompt-init-rc修复.md
用法：用户开一个不设置 TRIO_ROLE 的 omp 窗口，整段粘贴以下分隔线内内容。
依据：arch-20261029-1813-verdict-1.md（V-1 裁决：失败即整体非 0，过程尽力结果硬）。
-->

---

你在一个**无角色限制**的 omp 会话中执行 TASK-008 的裁决落地：修复 `bin/init-agent.sh` 的失败 rc 语义（`bin/**` 三角色 fail-closed，走根信任通道）。本提示词自包含，逐步执行。

## 仓库与依据
- 工作目录：`/home/cg/projects/omp-trio-scaffold`；本窗口**不要设置** `TRIO_ROLE`。
- 裁决真值：`docs/task/TASK-008-2026-10-29-回复结构内建/arch-20261029-1813-verdict-1.md`（后果节三项）；spec §6 已同步 v2。
- 缺陷复现：QA 脚本 `/tmp/qa-t008/ac2-err.sh`（在则复用；不在则按下方最小复现重建）。

## 铁律（违者即任务失败）
1. 禁止 `git push` / `git tag` / 发布。
2. commit 显式 pathspec；禁 `git add -A` / `git add .`。
3. 只改 `bin/init-agent.sh`、`tests/trio-reply-conventions.test.mjs`（rc 语义断言）与本任务目录产物；其余一字不动。
4. 输出真实执行后粘贴。

## 修复契约（判定标准）
1. `create_file()` 任一失败路径（`install` / `mkdir` 非 0，含只读目标）→ `FAILED` 计数 + 输出 `  失败  <相对路径>：<原因>`；失败**不得**计入 `CREATED`，不得打印「覆盖」。
2. 单件失败**不中断**后续注入（过程尽力）。
3. 收尾汇总：`完成：新建/覆盖 N 项，跳过 M 项，失败 K 件。`（K>0 时另行列出失败路径清单）；`K > 0` → exit 1；全成功 → exit 0。
4. 既有成功/跳过/覆盖/`--force`/policy 差异保留行为零变化。

## 执行步骤
1. 最小复现（修前贴输出）：临时树 `mkdir -p /tmp/t008rc && git -C /tmp/t008rc init -q` → `bash bin/init-agent.sh /tmp/t008rc` 一次 → 对任一注入件 `chmod 444`（如 `/tmp/t008rc/docs/REPLY-CONVENTIONS.md`）→ 重跑 init → 观察 rc 与汇总。
2. 按修复契约改 `create_file()` 与收尾汇总。
3. `tests/trio-reply-conventions.test.mjs` 补 ≥2 断言：只读目标 → rc=1 且汇总含失败路径；全绿树 → rc=0 且「失败 0 件」。既有断言不改。
4. 真实验证（贴输出）：修前/修后同一复现对照；`for t in tests/*.test.mjs; do bun "$t"; done` 全绿；`bash bin/trio-selftest.sh` 全绿。
5. 交付：`docs/task/TASK-008-2026-10-29-回复结构内建/dev-<YYYYMMDD>-<HHMM>-release-rc修复.md`（修前/修后对照 + Files Changed + 真实输出）；更新 `board.md`（B-2 修复项、AC-2f 行）；commit 分两批 `fix(trio): …` / `docs(task-008): …`。

## 完成判定
- 只读目标 rc=1 + 失败汇总；全绿 rc=0；回归全绿。
- **不 push**。完成后停止，交 QA 第 2 轮复测。

---
（提示词结束）
