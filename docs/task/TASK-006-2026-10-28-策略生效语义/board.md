# 任务看板：策略生效语义（policy 生效时机与双执法面同裁决 / BUG-1 上游修复）

| 字段 | 值 |
|---|---|
| Task ID | `TASK-006` |
| 任务目录 | `docs/task/TASK-006-2026-10-28-策略生效语义/` |
| 起始日期 | `2026-10-28` |
| 上游来源 | 下游 `factor_synthesis` 取证 `arch-20261028-1522-bug-1.md`（随包由用户带回） |
| release_gate | `strict` |

## 1. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed`（用户终验签字 2026-10-28 23:18 —— 矩阵 6/6 全通过，BUG-1 双子缺陷确认消除） |
| 最后推进人 | `用户`（签字） |
| 最后更新 | `2026-10-28 23:18` |
| qa_report | `docs/task/TASK-006-2026-10-28-策略生效语义/qa-20261028-2311-report-策略生效语义-第2轮.md`（过 `bin/trio-check-report.mjs`） |

## 2. 验收准则进度

> 正文以 `arch-20261028-2014-spec.md` v1 为准。

| AC | 契约 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 新增 allow 即时生效 | ☑ | ☑ | ☑ | 通过（qa-20261028-2311：A/AC-1；deny→allow 无重启即时放行） |
| AC-2 新增 deny 即时生效 | ☑ | ☑ | ☑ | 通过（B/AC-2；紧急撤权无 fail-open 窗口） |
| AC-3 缺失/不可解析 fail-closed | ☑ | ☑ | ☑ | 通过（C/C2/E/F/F2：缺失/空/纯注释/非法行整份失效四态全绿，文案明示原因） |
| AC-4 判定与当前策略一致 | ☑ | ☑ | ☑ | 通过（G/I2/J：mtime 不变 digest 变仍重读；旧快照不留存；deny→allow 边界即时） |
| AC-5 文案含快照标识 | ☑ | ☑ | ☑ | 通过（H/I：`快照：<8 位>（mtimeMs N）`；多角色不串扰） |
| AC-6 guard/pre-commit 同裁决 | ☑ | ☑ | ☑ | 通过（D/D2/K：共享判定器 `bin/trio-policy-eval.mjs`，pre-commit 实际走 CLI，矩阵 6/6 双面一致 + 缺失双拒，无角色直调证据见报告 §3） |

## 3. 迭代日志

- 23:11：QA 第 2 轮复测全绿 —— 修复 `6ac8766` 后 15 例回归（A/B/C/C2/D/D2 第 1 轮遗留
  翻红为绿 + 新增 E/F/F2/G/H/I/I2/J 八例 §6 对抗边界 + K CLI 直调）0 失败；
  selftest --fast 20/0；repro 脚本 exit 0（打印「BUG-1①/② 修复已生效」）；
  AC-6 无角色直调证据：pre-commit 走 `bin/trio-policy-eval.mjs`（双向 1 / 只 allow 0 /
  缺失 policy 1）；7 套件回归一致；报告 qa-20261028-2311 过校验器；③ done → 等 user_signed

- 20:15：QA 第 1 轮修复前基线 —— tests/trio-guard.test.mjs 增 6 例回归（A/B/C/C2/D/D2，fixture policy 隔离，不触真值源）；实测 guard 套件 70 项失败 4（A/B/C/C2 全红 = BUG-1 双子缺陷实锤：`:612` 终身缓存、`:630` fail-open），D/D2 绿（双执法面同裁决成立、pre-commit 面正确）；其余 6 套件回归全绿；selftest --fast 19/1（唯红色即 guard 套件 4 例的传播）；报告过校验器。修复前基线交付，转 DEV 实现。
- 22:48：DEV 修复落地 `6ac8766`（无 TRIO_ROLE 维护会话，commit body 已记 accounted）——`loadPolicy` mtime+digest、非法行整份失效、空策略 fail-closed、`describeVerdict` 快照标识；`pre-commit` 改调共享 `bin/trio-policy-eval.mjs`。真实仓库 7 套件全绿（guard 74/0、policy 140/0、align 13/0、check-report 47/0、gate-contract 12/0、pre-push 21/0、reply 28/0）；`selftest --fast` 20/0；`init-agent` 已安装新 pre-commit。DEV 交 QA 第 2 轮。

## 4. 分工（spec v1 §8）

- DEV：共享判定语义落地（mtime+digest 重读 / 非法行整份失效 / 文案带快照标识）→ guard、pre-commit 双面接线。（已完成）
- ARCH：契约补条（已落 v1）+ ADR-0011。
- QA：DEV 修复后复测 6 例回归 → 或翻绿、或按轮次熔断。（已全绿，0 熔断）

## 3'. 收尾归档

- 23:11：QA 第 2 轮复测全绿，看板推 `qa_passed`（commit `e42f87b`）。
- 23:18：用户终验签字——TASK-006 全周期归档（20:15 基线 → 22:48 修复 → 23:11 复测 → 23:18 签字；
  熔断 0 轮；qa_report `qa-20261028-2311-report-策略生效语义-第2轮.md`）。
- 下一步：DEV 窗口发布 v0.5.1（guard/pre-commit 共享判定器修复版）；
  origin（git@github.com:Brothercg/omp-trio-scaffold）已接入，
  远端 main 停在 `47970a7`（落后本地 9 commit）——push 与 tag 一并由 DEV 执行。
- 23:23：DEV 发布 `v0.5.1` —— `main 47970a7..3dd30c9`；tag object
  `161a300`（peeled `3dd30c9`）；远端 main / tag 已落地。发布记录
  `dev-20261028-2323-release.md`。

## 5. 交接备注（DEV → QA 第 2 轮）

交付说明：`dev-20261028-2248-release.md`。重点：

1. **非法行整份失效**：`allow dev src/a.py` + 任意坏行 → guard / pre-commit 双拒，文案明示 `policy 不可解析`。
2. **四种策略状态**：缺失 / 不可读 / 非法行 / 空文件或纯注释；前三种 `FailClosed`，空策略为 `rules=[]` 但受控写一律拒绝，文案分别可辨。
3. **AC-4**：`mtime` 未变但内容变，digest 必须触发重读；fixture 可用 `utimesSync` 回拨 mtime 验证。
4. **AC-5**：拦截文案含 8 位 digest + `mtimeMs`；判定后改 policy，文案出现“按旧快照执法”。
5. **AC-6**：pre-commit 必须实际走 `bin/trio-policy-eval.mjs`（非独立 shell 解析）；D/D2 矩阵继续全绿。
6. 未修改 `tests/**`；QA 直接用既有 6 例回归复测。
