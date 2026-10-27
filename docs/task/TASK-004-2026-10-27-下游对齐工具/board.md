# 任务看板：下游对齐工具（trio-align）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-004` |
| 任务目录 | `docs/task/TASK-004-2026-10-27-下游对齐工具/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-27` |
| qa_report | `—`（待 QA 产出后回填） |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `waiting_user` |
| 最后推进人 | `DEV` |
| 最后更新 | `2026-10-27 10:02` |

### 处置流程

| 阶段 | 状态 | 轮次 |
|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v1 |
| ② DEV 开发 | blocked | 第 1 轮：实现完成，待用户落盘/提交 |
| ③ QA 测试 | 待办 | — |
| ④ 闭环（user_signed + 挂起清单清零） | 待办 | — |

迭代日志：
- 第 0 轮 09:47：grill-me 对齐会话 downstream-adapt 7 问全解 → ADR-0006/0007 用户审核通过 → TASK-004 立项，spec v1 定稿，② 交 DEV 开工
- 第 1 轮 10:02：DEV 完成 trio-align/init-agent U1/test/README 实现与自测（align 12/0、临时自证 aligned）；
  `bin/**`、`tests/**` 无写通道，交付 patch 待用户落盘；GR-1/GR-2 报 ARCH

②⇄③ 回环即迭代；轮次口径 = 3 轮熔断定义（「QA 判未通过 → DEV 修 → QA 复测」计 1 轮）。

## 3. 验收准则进度

> 只记状态，不复制准则正文 —— 正文以 `arch-20261027-0947-spec.md` 为准。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 `--check` 对齐判定 | ✅ | ✅ staging | ☐ | 待落盘/QA |
| AC-2 `--check` 差异检出 | ✅ | ✅ staging | ☐ | 待落盘/QA |
| AC-3 默认 dry-run 不落盘 | ✅ | ✅ staging | ☐ | 待落盘/QA |
| AC-4 `--apply` 迁移与引用清扫 | ✅ | ✅ staging | ☐ | 待落盘/QA；GR-1 待裁决 |
| AC-5 `--apply` 核验报告零越界 | ✅ | ✅ staging | ☐ | 待落盘/QA |
| AC-6 升级分类覆盖（U1） | ✅ | ✅ staging | ☐ | 待落盘/QA |
| AC-7 回归测试 | ✅ | ✅ staging 12/0 | ☐ | 待落盘/QA |
| AC-8 文档落地 | ✅ | ✅ README §14 | ☐ | 待提交/QA |
| AC-9 验收链自证 | ✅ | ☐ | ☐ | 待落盘后本仓复跑 |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-1 | 流程 | `bin/**`、`tests/**` 对 DEV 为 `deny *`，TASK-004 无临时写通道；实现已打成 patch/附件，待用户无角色落盘并提交三个受保护文件 | DEV | 用户 | `2026-10-27 10:02` |
| B-2 | 契约 | GR-1：AC-2 policy diff 与 AC-4 `--apply` 后 `--check` 0、AC-5 零越界冲突；GR-2：`trio-align.sh` 上游 policy 定位未定义 | DEV | ARCH | `2026-10-27 10:02` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `09:47` | 下游适配策略（grill 7 问） | C+A：结构对齐 + 逃生舱；S1 标准=本项目；X3 迁移 dry-run；U1 升级分类覆盖；验收 = init ≤2 命令 + selftest 绿 + align 零差异 + policy cmp | `docs/architecture/ADR-0006-下游项目对齐策略.md`、`docs/architecture/ADR-0007-文档标题层级顺序编号.md` |

## 6. 交接备注

② DEV 实现完成，但受门禁 `deny *` 限制未落盘。待用户：
1. 按 `dev-20261027-1002-release.md` §4（或 `dev-20261027-1002-changes.md`）
   应用 patch，提交 `bin/trio-align.sh`、`bin/init-agent.sh`、
   `tests/trio-align.test.mjs`；
2. 回报提交哈希。DEV 随后提交 README/交付说明，复跑 AC-9，推 ③ 交 QA。
ARCH 需同时裁决 `dev-20261027-1002-bug-1.md` 的 GR-1/GR-2。

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| — | — | — | — |