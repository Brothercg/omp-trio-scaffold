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
| 当前状态 | `testing`（DEV 已落共享判定语义，待 QA 第 2 轮复测） |
| 最后推进人 | `DEV`（实现完成，交 QA） |
| 最后更新 | `2026-10-28 22:48` |
| qa_report | `docs/task/TASK-006-2026-10-28-策略生效语义/qa-20261028-2015-report-策略生效语义-第1轮.md`（第 1 轮修复前基线；第 2 轮待 QA 产出） |

## 2. 验收准则进度

> 正文以 `arch-20261028-2014-spec.md` v1 为准。

| AC | 契约 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 新增 allow 即时生效 | ☑ | ☑ | ☐ | 实现完成（`loadPolicy` mtime+digest），待 QA 第 2 轮 |
| AC-2 新增 deny 即时生效 | ☑ | ☑ | ☐ | 实现完成（无旧快照窗口），待 QA 第 2 轮 |
| AC-3 缺失/不可解析 fail-closed | ☑ | ☑ | ☐ | 实现完成（缺失/不可读/非法行/空策略分流），待 QA 第 2 轮 |
| AC-4 判定与当前策略一致 | ☑ | ☑ | ☐ | 实现完成（mtime+digest 重读），待 QA 第 2 轮 |
| AC-5 文案含快照标识 | ☑ | ☑ | ☐ | 实现完成（`describeVerdict` 8 位 digest + mtimeMs + 旧快照告警），待 QA 第 2 轮 |
| AC-6 guard/pre-commit 同裁决 | ☑ | ☑ | ☑ | 已通过（第 1 轮 D/D2 基线；共享 CLI 接线后本地 74/0） |

## 3. 迭代日志

- 20:15：QA 第 1 轮修复前基线 —— tests/trio-guard.test.mjs 增 6 例回归（A/B/C/C2/D/D2，fixture policy 隔离，不触真值源）；实测 guard 套件 70 项失败 4（A/B/C/C2 全红 = BUG-1 双子缺陷实锤：`:612` 终身缓存、`:630` fail-open），D/D2 绿（双执法面同裁决成立、pre-commit 面正确）；其余 6 套件回归全绿；selftest --fast 19/1（唯红色即 guard 套件 4 例的传播）；报告过校验器。修复前基线交付，转 DEV 实现。
- 22:48：DEV 修复落地 `6ac8766`（无 TRIO_ROLE 维护会话，commit body 已记 accounted）——`loadPolicy` mtime+digest、非法行整份失效、空策略 fail-closed、`describeVerdict` 快照标识；`pre-commit` 改调共享 `bin/trio-policy-eval.mjs`。真实仓库 7 套件全绿（guard 74/0、policy 140/0、align 13/0、check-report 47/0、gate-contract 12/0、pre-push 21/0、reply 28/0）；`selftest --fast` 20/0；`init-agent` 已安装新 pre-commit。DEV 交 QA 第 2 轮。

## 4. 分工（spec v1 §8）

- DEV：共享判定语义落地（mtime+digest 重读 / 非法行整份失效 / 文案带快照标识）→ guard、pre-commit 双面接线。（已完成）
- ARCH：契约补条（已落 v1）+ ADR-0011。
- QA：DEV 修复后复测 6 例回归 → 或翻绿、或按轮次熔断。

## 5. 交接备注（DEV → QA 第 2 轮）

交付说明：`dev-20261028-2248-release.md`。重点：

1. **非法行整份失效**：`allow dev src/a.py` + 任意坏行 → guard / pre-commit 双拒，文案明示 `policy 不可解析`。
2. **四种策略状态**：缺失 / 不可读 / 非法行 / 空文件或纯注释；前三种 `FailClosed`，空策略为 `rules=[]` 但受控写一律拒绝，文案分别可辨。
3. **AC-4**：`mtime` 未变但内容变，digest 必须触发重读；fixture 可用 `utimesSync` 回拨 mtime 验证。
4. **AC-5**：拦截文案含 8 位 digest + `mtimeMs`；判定后改 policy，文案出现“按旧快照执法”。
5. **AC-6**：pre-commit 必须实际走 `bin/trio-policy-eval.mjs`（非独立 shell 解析）；D/D2 矩阵继续全绿。
6. 未修改 `tests/**`；QA 直接用既有 6 例回归复测。
