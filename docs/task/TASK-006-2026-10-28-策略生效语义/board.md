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
| 当前状态 | `implementing`（QA 修复前基线已落：回归 6 例钉 AC-1..AC-6，4 红实锤缺陷签名，待 DEV 落 `loadPolicy`/`decide`/`describeVerdict` 共享实现） |
| 最后推进人 | `QA`（回归测试 + 修复前基线报告） |
| 最后更新 | `2026-10-28 20:15` |
| qa_report | `docs/task/TASK-006-2026-10-28-策略生效语义/qa-20261028-2015-report-策略生效语义-第1轮.md`（过 `bin/trio-check-report.mjs`） |

## 2. 验收准则进度

> 正文以 `arch-20261028-2014-spec.md` v1 为准。

| AC | 契约 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 新增 allow 即时生效 | ☑ | ☐ | ☐ | 未通过（qa-20261028-2015 缺陷签名 A）：`:612` 缓存短路；回归用例已钉 |
| AC-2 新增 deny 即时生效 | ☑ | ☐ | ☐ | 未通过（签名 B，与 AC-1 同根缓存）；Critical 安全向 |
| AC-3 缺失/不可解析 fail-closed | ☑ | ☐ | ☐ | 未通过（签名 C/C2）：`:630` fail-open；文案无 fail-closed 语义 |
| AC-4 判定与当前策略一致 | ☑ | ☐ | ☐ | 未通过（A/B 先后两次判定差分承载） |
| AC-5 文案含快照标识 | ☑ | ☐ | ☐ | 部分（fail-closed 语义子项缺；快照标识子项待 DEV 实现 `describeVerdict` 后补测） |
| AC-6 guard/pre-commit 同裁决 | ☑ | ☐ | ☑ | 通过（qa-20261028-2015 签名 D/D2：6 路径矩阵双面一致 + 缺失双拒；pre-commit 面本身语义正确） |

## 3. 迭代日志

- 20:15：QA 第 1 轮修复前基线 —— tests/trio-guard.test.mjs 增 6 例回归（A/B/C/C2/D/D2，fixture policy 隔离，不触真值源）；实测 guard 套件 70 项失败 4（A/B/C/C2 全红 = BUG-1 双子缺陷实锤：`:612` 终身缓存、`:630` fail-open），D/D2 绿（双执法面同裁决成立、pre-commit 面正确）；其余 6 套件回归全绿；selftest --fast 19/1（唯红色即 guard 套件 4 例的传播）；报告过校验器。修复前基线交付，转 DEV 实现。

## 4. 分工（spec v1 §8）

- DEV：共享判定语义落地（mtime+digest 重读 / 非法行整份失效 / 文案带快照标识）→ guard、pre-commit 双面接线。
- ARCH：契约补条（已落 v1）+ ADR-0011。
- QA：DEV 修复后复测 6 例回归 → 或翻绿、或按轮次熔断。
