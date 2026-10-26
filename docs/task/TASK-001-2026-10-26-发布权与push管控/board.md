# 任务看板：三角色 push 与本机发布的权限管控

| 字段 | 值 |
|---|---|
| Task ID | `TASK-001` |
| 任务目录 | `docs/task/TASK-001-2026-10-26-发布权与push管控/` |
| 工作树 / 分支 | 本仓库 / 直接在 master |
| 起始日期 | `2026-10-26` |

## 1. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed` |
| 最后推进人 | `ARCH`（用户临时授权维护者身份执行机制层；AC 全绿待用户签字确认） |
| 最后更新 | `2026-10-26 04:35` |

> 本任务是**门禁自举任务**：改动对象（pre-push hook / init-agent.sh /
> policy.txt / tests）按 policy.txt 属于门禁自身保护范围（`deny *`），
> 不属于任何 triro 角色——由维护者直接实施，不走 dev / qa 会话。
> qa 验证等价物 = `tests/trio-policy.test.mjs` 扩展 + 手动验证，
> 落成后回填到「验证」列。

## 2. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 ~ AC-3（qa/arch/pm 拒推） | `☑` | `☑` | `☑` | `通过` |
| AC-4 ~ AC-6（dev 前置校验：报告/看板） | `☑` | `☑` | `☑` | `通过` |
| AC-7（dev 全绿+qa_passed 放行，含 user_signed） | `☑` | `☑` | `☑` | `通过` |
| AC-8（无人值守放行 + 非法角色拒绝） | `☑` | `☑` | `☑` | `通过` |
| AC-9（SKIP 毒报告拒绝） | `☑` | `☑` | `☑` | `通过` |
| AC-10（init-agent.sh 部署行） | `☑` | `☑` | `☑` | `通过` |
| AC-11（policy 收窄 qa 写 pyproject 被拒） | `☑` | `☑` | `☑` | `通过` |
| AC-12（三份 rules.md 含发布禁令） | `☑` | `☑` | `☑` | `通过` |

验证记录：`tests/trio-pre-push.test.mjs` 13/13 通过；
`trio-policy.test.mjs`（含 4 条新增发布链断言）通过；
`trio-guard.test.mjs`、`trio-check-report.test.mjs` 通过。手动验证
（/tmp fixture）复现 AC-1 ~ AC-9 结论一致。

## 3. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| 无 | | | | | |

## 4. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `04:16` | push / 发布要不要限、给谁、怎么落地 | 限；仅 dev 可发布；pre-push hook + policy 收窄 | `docs/architecture/ADR-0001-发布权与push管控.md` |

## 5. 交接备注

ARCH 已出契约 v1 与 ADR-0001。下一步：维护者按 spec 实现 AC-1 ~ AC-12，
完成后看板推到 `qa_passed`（本任务的 qa 角色等价物 = 机械测试 + 手动验证）。
