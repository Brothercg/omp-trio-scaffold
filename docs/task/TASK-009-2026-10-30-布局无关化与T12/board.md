# 任务看板：安装布局无关化（⑩）与报告矩阵机检 T12（⑪）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-009` |
| 任务目录 | `docs/task/TASK-009-2026-10-30-布局无关化与T12/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-30` |
| qa_report | `—`（待 QA 双件落位后回填） |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `spec_agreed` |
| 最后推进人 | `ARCH` |
| 最后更新 | `2026-10-30 15:39` |

### 处置流程

| 阶段 | 状态 | 轮次 | 熔断计数（实现轮 N/3） | 根因分类 |
|---|---|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v1 | — | — |
| ② 实现（无角色执行窗口，ADR-0014） | 待办 | 第 1 轮 | `0/3` | — |
| ③ QA 测试（含下游夹具回放） | 待办 | — | `0/3` | — |
| ④ 闭环（user_signed + 挂起清单清零） | 待办 | — | — | — |

迭代日志：
- 15:39：ARCH 定稿 spec v1 + ADR-0015 → ② 待无角色执行窗口按提示词落地

## 3. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 干跑零写入 | `☑` | `☐` | `☐` | 待实现 |
| AC-2 auto 布局判定 | `☑` | `☐` | `☐` | 待实现 |
| AC-3 显式布局与非法值 | `☑` | `☐` | `☐` | 待实现 |
| AC-4 tooling 布局 hook 映射 | `☑` | `☐` | `☐` | 待实现 |
| AC-5 bin 布局向后兼容 | `☑` | `☐` | `☐` | 待实现 |
| AC-6 下游领先保留 | `☑` | `☐` | `☐` | 待实现 |
| AC-7 幂等 | `☑` | `☐` | `☐` | 待实现 |
| AC-8 对齐脚本自定位 | `☑` | `☐` | `☐` | 待实现 |
| AC-9 自检脚本自定位 | `☑` | `☐` | `☐` | 待实现 |
| AC-10 干跑不建目录 | `☑` | `☐` | `☐` | 待实现 |
| AC-11 缺矩阵段拒绝 | `☑` | `☐` | `☐` | 待实现 |
| AC-12 AC 行结论可解析 | `☑` | `☐` | `☐` | 待实现 |
| AC-13 SKIP 成对 | `☑` | `☐` | `☐` | 待实现 |
| AC-14 编号与空矩阵 | `☑` | `☐` | `☐` | 待实现 |
| AC-15 合规与零回归 | `☑` | `☐` | `☐` | 待实现 |
| AC-16 输出契约 | `☑` | `☐` | `☐` | 待实现 |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| — | — | 无 | — | — | — |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| 15:39 | 落点跨两种目录布局 | `--layout auto\|bin\|tooling`，auto 按目标 `tooling/bin` 存在性；hook 产物一次替换 `bin/trio-` → `<TOOLS>/trio-` | `ADR-0015` §决策 A |
| 15:39 | 矩阵行「结论值」机检口径 | 模板矩阵表无结论列：非 SKIP 行结论按**引用用例解析**成立（被引用用例结论受 T4–T6 四值约束）；若表含结论列则 M9 生效 | `arch-20261030-1539-spec.md` §2.5 D-2 |
| 15:39 | 谁落 `bin/**`（policy `deny * bin/**`、`deny dev tests/**`） | DEV 窗口机械不可写：按 `ADR-0014` 走**无角色执行窗口**执行 ARCH 提示词，QA 双件复测不变 | `ADR-0014` §3；`arch-20261030-1539-prompt-实施.md` |

## 6. 交接备注

契约与执行提示词已定稿（spec v1 / ADR-0015 / prompt-实施）。落点文件 `bin/init-agent.sh`、
`bin/trio-check-report.mjs` 受 `policy.txt` 的 `deny * bin/**` 保护，`tests/**` 为 QA 独占——
DEV 窗口无法落盘，故实现步由用户开**无角色窗口**按提示词执行；随后 QA 双件复测，用户终验。

**下一步任务分配**

承接方：用户的无角色 omp 窗口（不设 `TRIO_ROLE`）

```
【任务】按 ARCH 契约落地 TASK-009：⑩ 安装布局无关化 + ⑪ 校验器 T12，一次两主题提交
【必读】docs/task/TASK-009-2026-10-30-布局无关化与T12/arch-20261030-1539-spec.md（v1，全部 AC）
        docs/task/TASK-009-2026-10-30-布局无关化与T12/arch-20261030-1539-prompt-实施.md（本单正文）
        docs/architecture/ADR-0015-工装安装布局映射与报告矩阵机检.md
【指令】1. ⑩：bin/init-agent.sh 增 --dry-run / --layout auto|bin|tooling；落点映射与 hook
           产物单次替换；下游领先集合默认保留、--force 覆盖；bin/trio-align.sh 与
           bin/trio-selftest.sh 改 .omp/trio/policy.txt 向上探测根
        2. ⑪：bin/trio-check-report.mjs 增 checkMatrix（M1–M10）并挂进 checkText
        3. 测试：新增 tests/trio-init-layout.test.mjs（golden 临时仓）+ 扩充
           tests/trio-check-report.test.mjs（正例 1 + 反例 ≥4）；既有夹具补齐矩阵段
        4. CHANGELOG 增 `## v0.9.0 — 2026-10-30`（⑩⑪ 两条 + 下游同步指引）
        5. 三笔 commit（显式 pathspec）：feat(install) ⑩ / feat(validator) ⑪ / docs v0.9.0
【交付】dev-<YYYYMMDD>-<HHMM>-release.md（TASK-009 目录，含 Files Changed / AC 覆盖 /
        真实命令输出）+ 两笔功能 commit 号 + 版本号 v0.9.0；看板推进 implementing→testing
【纪律】禁 push / tag；禁 --no-verify；不改 .omp/trio/policy.txt、.omp/hooks/**、
        templates/pre-*、templates/report.template.md；不改下游仓；不删除任何既有文件；
        每笔 commit 显式 pathspec
【突出】AC-1/AC-10 的「零写入」必须用树快照实锤；AC-4 的 hook 替换只做一次且源副本
        必须与模板逐字节相同；T12 不得误伤既有 411 项套件（先跑基线再改）
【完成】for t in tests/*.test.mjs; do bun "$t"; done 全绿（≥411 项）+ bash bin/trio-selftest.sh --fast
        全绿；`bin/init-agent.sh --dry-run <临时仓>` 四类前缀 + 零写入；缺矩阵报告 exit≠0
        且含 [T12] 明细行；三笔 commit 落账、git status 干净
```

承接方：QA 窗口（实现 commit 落账后）

```
【任务】TASK-009 对抗复测并出双件（checklist + report）
【必读】arch-20261030-1539-spec.md §4.1 测试矩阵；ADR-0015；本看板 §3/§7
【指令】按 AC-1..AC-16 逐条写用例；重点对抗：--layout 非法值零写入、hook 替换幂等、
        SKIP 成对两侧各缺一项、引用分隔符 `、`、段重复；另回放下游 19 条原 SKIP 夹具
【交付】qa-<YYYYMMDD>-<HHMM>-checklist-<slug>.md + …-report-<slug>.md（同 HHMM 同 slug，
        report 过 bun bin/trio-check-report.mjs），board qa_report 回填
【纪律】只写 qa-*.md 与 board.md；T12 新规则本身要用「合规报告」自证不误伤
【突出】报告自身必须满足 T12（矩阵段落 + SKIP 成对）——这是新规则的第一份自证
【完成】双件落位、校验器返回 0、看板 qa_passed，挂起清单交用户终验
```

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| 下游 19 条「上游 ⑩ 依赖」SKIP | ⑩ 落地并发布（v0.9.0） | 下游 QA | 重装工装面后逐条转实跑，回填下游板 §7 |
| 下游 C-13（AC 覆盖无机器约束） | ⑪ 落地并发布（v0.9.0） | 下游板主 | 关行；后续报告按 T12 机检 |
| v0.9.0 发布（tag/push） | QA 全绿 + user_signed | DEV 窗口 | 按本仓发布规则执行 |

`user_signed` + 挂起清单清零 = 真闭环；解除条件成熟 → 触发者集中补测一轮。
