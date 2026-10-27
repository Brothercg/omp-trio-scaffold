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
| 当前状态 | `testing`（QA 第 1 轮：未通过 AC-9 + 半通过 AC-4；等 DEV 修 probe 残留、ARCH 裁 V-1/V-2） |
| 最后推进人 | `QA` |
| 最后更新 | `2026-10-27 10:32` |
| qa_report | `docs/task/TASK-004-2026-10-27-下游对齐工具/qa-20261027-1030-report-下游对齐工具-第1轮.md` |

### 处置流程

| 阶段 | 状态 | 轮次 |
|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v1 |
| ② DEV 开发 | done | 第 1 轮：落盘 `27a01d5`，自测全绿 |
| ③ QA 测试 | 进行中 | 第 1 轮已执行：13 通过 / 1 半通过（AC-4）/ 1 未通过（AC-9），见 qa_report |
| ④ 闭环（user_signed + 挂起清单清零） | 待办 | — |

迭代日志：
- 第 0 轮 09:47：grill-me 对齐会话 downstream-adapt 7 问全解 → ADR-0006/0007 用户审核通过 → TASK-004 立项，spec v1 定稿，② 交 DEV 开工
- 第 1 轮 10:02：DEV 完成 trio-align/init-agent U1/test/README 实现与自测（align 12/0、临时自证 aligned）；
  `bin/**`、`tests/**` 无写通道，交付 patch 待用户落盘；GR-1/GR-2 报 ARCH
- 第 1 轮 10:05：用户无角色落盘 `27a01d5`；DEV 复跑 align 12/0、`--check` aligned、
  `trio-selftest --fast` 20/0；② done，③ 交 QA
- 第 1 轮 10:32：QA 第 1 轮验收：13 通过 / 半通过 AC-4（GR-1 口径待 V-1）/ 未通过 AC-9
  （本仓 HEAD 残留 selftest probe 夹具 37dc5af/d508032/266e905，阻塞验收链第 1 条；
  修复方向已机器验证并写入 qa bug-1）；报告 qa-20261027-1030（校验器合规）

②⇄③ 回环即迭代；轮次口径 = 3 轮熔断定义（「QA 判未通过 → DEV 修 → QA 复测」计 1 轮）。

## 3. 验收准则进度

> 只记状态，不复制准则正文 —— 正文以 `arch-20261027-0947-spec.md` 为准。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 `--check` 对齐判定 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030） |
| AC-2 `--check` 差异检出 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030） |
| AC-3 默认 dry-run 不落盘 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030；`git status --porcelain` 前后逐字节一致） |
| AC-4 `--apply` 迁移与引用清扫 | ✅ | ✅ | ⚠️ | 半通过：policy 相等夹具全绿；spec 原文 Given（policy 有 diff）下 `--check`=1 —— GR-1 待 V-1，不判实现缺陷 |
| AC-5 `--apply` 核验报告零越界 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030；policy.txt 逐字节不变） |
| AC-6 升级分类覆盖（U1） | ✅ | ✅ | ✅ | 通过（qa-20261027-1030 独立探针：执行件覆盖 + policy 保留 + exit 0） |
| AC-7 回归测试 | ✅ | ✅ 12/0 | ✅ | 通过（3 次运行均 12/0，确定性满足） |
| AC-8 文档落地 | ✅ | ✅ README §14 | ✅ | 通过（§14 下游适配 + §14.1 三命令 + §14.2 逃生舱与验收链） |
| AC-9 验收链自证 | ✅ | ✅ aligned + selftest 20/0 | ❌ | 未通过：干净 HEAD 上 `--check` exit 1 —— 本仓 HEAD 残留 selftest probe 夹具 commits（37dc5af/d508032/266e905）；修复方向已机器验证，见 qa-20261027-1030-bug-1.md |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-2 | 契约 | GR-1：AC-2 policy diff 与 AC-4 `--apply` 后 `--check` 0、AC-5 零越界冲突；GR-2：`trio-align.sh` 上游 policy 定位未定义 | DEV | ARCH | `2026-10-27 10:02` |
| B-3 | 实现（环境级） | 本仓 HEAD 残留 selftest probe 夹具 commits（37dc5af/d508032/266e905：TRIO-SELFTEST 报告 + `src/trio_probe.py`），干净 HEAD `--check` exit 1，阻塞 AC-9；修复 = git rm 两 probe 路径 + `src/` tracked 占位（QA 已在 simulated HEAD 验证归零） | QA | DEV/用户 | `2026-10-27 10:30` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `10:05` | B-1 落盘解除 | 用户无角色应用补丁并提交 `27a01d5`（三个受保护文件）；DEV 复跑 align 12/0、selftest 20/0 | `dev-20261027-1002-release.md` §3.4/§4 |
| `09:47` | 下游适配策略（grill 7 问） | C+A：结构对齐 + 逃生舱；S1 标准=本项目；X3 迁移 dry-run；U1 升级分类覆盖；验收 = init ≤2 命令 + selftest 绿 + align 零差异 + policy cmp | `docs/architecture/ADR-0006-下游项目对齐策略.md`、`docs/architecture/ADR-0007-文档标题层级顺序编号.md` |
| `10:02` | 测试内容归属（用户拍板 P3） | 测试矩阵前移：ARCH 在 spec 锁定 AC→断言映射；QA 全覆盖 + 自主对抗；DEV 后直交 QA 无中间审核点。TASK-004 spec v1→v2 补 §4.1 测试矩阵（首个执行实例） | `docs/architecture/ADR-0008-测试矩阵前移.md`、spec v2 |

## 6. 交接备注

② DEV done（落盘 `27a01d5`，README/docs `f0ca43b` + 本次补记）→ ③ QA。
DEV 自测：`bun tests/trio-align.test.mjs` 12/0；`bin/trio-align.sh --check`
`aligned`/exit 0；`bin/trio-selftest.sh --fast` 20/0。
QA 重点：
1. AC-1..AC-3/5/6/7/8/9 按 spec v1 复测；AC-3 必须断言 `git status --porcelain`
   前后逐字节一致。
2. **AC-4 先读 `dev-20261027-1002-bug-1.md` 的 GR-1**：DEV 实现不写 policy；
   若用 AC-2 的 policy-diff 夹具，`--apply` 后 `--check` 必为 1。等 ARCH V-1
   裁决测试口径；不要把该契约冲突记成实现缺陷。
3. **GR-2**：`trio-align.sh` 部署进下游后上游 policy 自比问题；等 ARCH V-2。
4. AC-6 已由 `tests/trio-align.test.mjs` 覆盖（执行件覆盖 + policy diff 保留）。
5. 工作区有非本任务残留（`D docs/task/TRIO-SELFTEST/...`、`D src/trio_probe.py`、
   `?? .omp/trio/templates/`），不要纳入本任务验收。

③ QA 第 1 轮（10:30）：AC-1..AC-3/5/6/7/8 + 6 边界全过（均含独立探针复证）；
AC-4 半通过（GR-1 选 A 口径实现侧全绿，spec v1 原文 Given 未改写，待 ARCH V-1）；
AC-9 未通过（B-3：HEAD 残留 probe 夹具，修复方向已机器验证）。GR-1/GR-2 均记
B-2 待 ARCH 裁决，QA 未将其判为实现缺陷。报告 `qa-20261027-1030`、缺陷
`qa-20261027-1030-bug-1`（编号 B-3）。

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| — | — | — | — |