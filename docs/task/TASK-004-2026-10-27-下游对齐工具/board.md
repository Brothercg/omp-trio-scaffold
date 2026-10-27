# 任务看板：下游对齐工具（trio-align）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-004` |
| 任务目录 | `docs/task/TASK-004-2026-10-27-下游对齐工具/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-27` |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed` |
| 最后推进人 | `用户`（签字） |
| 最后更新 | `2026-10-27 11:26` |
| qa_report | `docs/task/TASK-004-2026-10-27-下游对齐工具/qa-20261027-1117-report-下游对齐工具-第3轮.md` |

> 用户终验签字 `2026-10-27 11:26`；矩阵 9 行全过、§4/§7 全清零。

### 处置流程

| 阶段 | 状态 | 轮次 |
|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v1 |
| ② DEV 开发 | done | 第 1 轮：落盘 `27a01d5`，自测全绿 |
| ③ QA 测试 | done | 第 3 轮复测全绿（qa-20261027-1117）：AC-9 转通过、矩阵 9 行全绿、断言同步 3 组、7 套件 328/0 |
| ④ 闭环（user_signed + 挂起清单清零） | done | 用户签字 11:26 —— 真闭环达成 |

迭代日志：
- 第 0 轮 09:47：grill-me 对齐会话 downstream-adapt 7 问全解 → ADR-0006/0007 用户审核通过 → TASK-004 立项，spec v1 定稿，② 交 DEV 开工
- 第 1 轮 10:02：DEV 完成 trio-align/init-agent U1/test/README 实现与自测（align 12/0、临时自证 aligned）；
  `bin/**`、`tests/**` 无写通道，交付 patch 待用户落盘；GR-1/GR-2 报 ARCH
- 第 1 轮 10:05：用户无角色落盘 `27a01d5`；DEV 复跑 align 12/0、`--check` aligned、
  `trio-selftest --fast` 20/0；② done，③ 交 QA
- 第 1 轮 10:32：QA 第 1 轮验收：13 通过 / 半通过 AC-4（GR-1 口径待 V-1）/ 未通过 AC-9
  （本仓 HEAD 残留 selftest probe 夹具 37dc5af/d508032/266e905，阻塞验收链第 1 条；
  修复方向已机器验证并写入 qa bug-1）；报告 qa-20261027-1030（校验器合规）
- 第 2 轮 10:54：ARCH V-1/V-2 落 verdict-1 + spec v3；QA 第 2 轮：AC-4 夹具
  按 V-1 转 policy 相等口径 + 对抗用例（policy-diff --apply 后 --check 仍 1、
  人工同步归零）+ AC-5 补 policy.txt 零写入断言 —— 全绿（套件 13/0 × 3）；
  AC-9 复核仍被 B-3 阻塞（probe 夹具未修，环境级，不计熔断）；GR-2 实证记录
  于报告 SKIP 行；报告 qa-20261027-1054（校验器合规）
- 第 3 轮 11:01：DEV 收尾：`b0f7689` B-3 src 半区（probe 删 + `src/__init__.py` 占位）；
  `a576893` GR-2 部署收尾（init-agent 移除 trio-align 部署行）；`223c218` docs 半区落
  （无角色提交）；B-4（ADR-0009 测试漂移）归 QA
- 第 3 轮 11:17：QA 第 3 轮复测全绿：3 组断言同步（AC-6 反转部署断言、
  trio-guard/policy ADR-0009 文档模板 arch 放行 + 执行件仍全拒）→ 7 套件
  328/0；干净 HEAD `--check` exit 0（probe 已清零）+ selftest 20/0 →
  AC-9 转通过、矩阵全绿；B-3/GR-2 挂起解除；报告 qa-20261027-1117；
  ③ done → ④ 等 user_signed
- 第 3 轮 11:26：用户终验签字（AC-9/V-2 复核单收到，HEAD 现场抽查与 `09b88e5`
  签核时一致：`--check` aligned exit 0、init-agent 无 trio-align、树内无
  probe 残留）；④ done —— TASK-004 真闭环达成，全周期归档

②⇄③ 回环即迭代；轮次口径 = 3 轮熔断定义（「QA 判未通过 → DEV 修 → QA 复测」计 1 轮）。

## 3. 验收准则进度

> 只记状态，不复制准则正文 —— 正文以 `arch-20261027-0947-spec.md` 为准。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 `--check` 对齐判定 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030） |
| AC-2 `--check` 差异检出 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030） |
| AC-3 默认 dry-run 不落盘 | ✅ | ✅ | ✅ | 通过（qa-20261027-1030；`git status --porcelain` 前后逐字节一致） |
| AC-4 `--apply` 迁移与引用清扫 | ✅（v3） | ✅ | ✅ | 通过（qa-20261027-1054：V-1 口径夹具 + 对抗用例两侧；第 1 轮半通过转正） |
| AC-5 `--apply` 核验报告零越界 | ✅（v3） | ✅ | ✅ | 通过（qa-20261027-1054：非路径行 + policy.txt 零写入 Buffer/diff 双断言；qa-20261027-1030 首验） |
| AC-6 升级分类覆盖（U1） | ✅（v3） | ✅ | ✅ | 通过（qa-20261027-1030 探针首验；qa-20261027-1117 断言反转——不再部署 trio-align，V-2 落地） |
| AC-7 回归测试 | ✅ | ✅ 328/0 | ✅ | 通过（qa-20261027-1117：7 套件全绿；断言同步 b/c 落地） |
| AC-8 文档落地 | ✅ | ✅ README §14 | ✅ | 通过（§14 下游适配 + §14.1 三命令 + §14.2 逃生舱与验收链） |
| AC-9 验收链自证 | ✅ | ✅ | ✅ | 通过（qa-20261027-1117：B-3 双半区落 HEAD，干净 HEAD `--check` exit 0 + selftest 20/0；第 1/2 轮环境级阻塞解除） |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-2 | `已裁决` | GR-1/GR-2 均判 `契约缺陷`：V-1 选 A（AC-4 夹具改 policy 相等，policy diff 只由 AC-2 检出、人工同步后归零）；V-2 三态裁定①仅脚手架仓运行（②环境变量/③参数否决）。spec v2→v3；处置修正（10:57）：init-agent.sh 移除 trio-align 部署行（ALIGN-DEPLOYED 差异，用户落盘） | `DEV` | `ARCH`（已裁决） | `2026-10-27 10:02` |
| B-3 | ✅ 已解除 | HEAD probe 夹具残留（TRIO-SELFTEST 报告 + `src/trio_probe.py`）阻塞 AC-9 —— 双半区落 HEAD：`223c218`（docs 半区，无角色）+ `b0f7689`(src 半区 + `src/__init__.py` 占位)；干净 HEAD `--check` exit 0（qa-20261027-1117 probe 复证） | QA | 已解除 | `2026-10-27 10:30` |
| B-4 | ✅ 已解除 | ADR-0009 测试漂移：guard/policy 仍断言全角色拒绝文档模板 —— QA 第 3 轮断言同步 b/c：arch 放行 3 模板 + dev/qa 仍拒 + pre-commit/pre-push 全拒；7 套件 328/0（qa-20261027-1117） | DEV | 已解除 | `2026-10-27 11:01` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `11:35` | TASK-004 v0.4.0 发布 | push `2ca27dd` → `origin/main`；tag `v0.4.0`；`trio-align` 13/0、selftest 20/0、`--check` aligned；TASK-004 职责流终结 | `dev-20261027-1135-release.md`、tag `v0.4.0` |
| `10:57` | V-2 三态定音 + 处置修正 | GR-2 三态裁定①仅脚手架仓运行（②`TRIO_UPSTREAM_POLICY`/③`--upstream-policy` 否决：第二真值源入口 + 版本漂移；未来需要先立 ADR-0010）。QA AC-6 实测 ALIGN-DEPLOYED 与「不部署」相抵 → init-agent.sh 移除部署行（用户落盘） | `arch-20261027-1046-verdict-1.md` §3 补录/§4 修正 |
| `10:46` | GR-1/GR-2 contract-gap 联裁决 | 均判 `契约缺陷`：V-1 选 A（夹具正交于被测语义——改夹具不改约束）；V-2 单真值源定位（不加参数注入）。spec v2→v3（AC-4/AC-5 重写 + §2 运行形态）；实现零改动 | `arch-20261027-1046-verdict-1.md`、spec v3 |
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

③ QA 第 2 轮（10:54）：V-1/V-2 裁决落地后复测 —— AC-4 测试口径改 V-1（夹具
policy 相等）+ 新增对抗用例（policy-diff 项目 `--apply` 后 `--check` 仍 exit 1、
policy 字节不变、人工同步后归零）+ AC-5 补 policy.txt 零写入双断言 → 全绿
（13/0 × 3 次）；AC-9 复核 B-3 仍未修（环境级未通过，不熔断）；GR-2 实证
（下游自跑 policy 自比自 → 永远 aligned）记报告 SKIP 行。报告
`qa-20261027-1054`。dev 残留工作：按 spec v3 §2 从 init-agent 部署清单中
移除 `trio-align.sh`（不随下游部署）。

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| ~~AC-9（B-3 未修）~~ 已解除 | 双半区落 HEAD：`223c218`（docs）+ `b0f7689`（src + `src/__init__.py` 占位） | 用户/DEV 已执行 | 已清零：第 3 轮复核干净 HEAD `--check` exit 0；AC-9 行转「通过」；全矩阵绿；③ → `qa_passed` |
| ~~GR-2 部署收尾~~ 已解除（V-2） | `a576893` init-agent 移除 trio-align 部署行 | DEV 已执行 | 已清零：第 3 轮 AC-6 反转断言 `!exists(下游 bin/trio-align.sh)` + 干净 HEAD `grep trio-align bin/init-agent.sh` = 0 |
| ~~ADR-0009 测试同步（B-4）~~ 已解除 | QA 断言同步 b/c（arch 放行 3 文档模板 / dev、qa 拒 / 执行件全拒） | QA 已执行 | 已清零：guard 68/0、policy 140/0；7 套件 328/0；AC-9 转通过 → `qa_passed`。真闭环剩 user_signed |