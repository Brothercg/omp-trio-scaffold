# 任务看板：三角色回复规范与任务接力机制落地

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-003` |
| 任务目录 | `docs/task/TASK-003-2026-10-26-回复规范落地/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-26` |
| qa_report | —（QA 报告产出后回填完整相对路径） |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `testing`（DEV 第 1 轮交付，交 QA 验收；AC-9 仍 SKIP） |
| 最后推进人 | `DEV`（六步交付完成，交 QA） |
| 最后更新 | `2026-10-26 13:46` |

### 处置流程

| 阶段 | 状态 | 轮次 |
|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v3 |
| ② DEV 开发 | done | 第 1 轮 |
| ③ QA 测试 | 进行中 | 第 1 轮 |
| ④ 闭环（user_signed + 挂起清单清零） | 待办 | — |

迭代日志：
- 第 0 轮 12:48（设计迭代）：用户补充命名/流程标记/提示词三组需求 → grill 9 问 → spec v1 → v2 + ADR-0005
- 第 0 轮 13:19（设计迭代）：改名清扫代施完毕（AC-10 待 QA 核验）
- 第 0 轮 13:30：写通道落盘核验通过（§7-1 清零），② 交 DEV 开工
- 第 0 轮 13:43（设计迭代）：`【突出】` 围栏外标红渲染定式化，spec v2 → v3（AC-1j）
- 第 1 轮 13:46（开发迭代）：DEV 六步落盘 → ③ 交 QA 验收

②⇄③ 回环即迭代；轮次口径 = 3 轮熔断定义（「QA 判未通过 → DEV 修 → QA 复测」计 1 轮）。

## 3. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 REPLY-CONVENTIONS 结构与要件 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-2 rules 指针与成对相等 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-3 board 模板挂起清单与接力块 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-4 report 模板 T10 与数据源 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-5 T10 基本行为 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-6 T10 边界 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-7 T10 不回归 | `☑`(v3) | `☑` | `☐` | DEV 已交付，待 QA |
| AC-8 优先级与格式自检 | `☑`(v3) | `☑` | `☐` | rules 指针已落；QA 重启后自检 |
| AC-9 通道回收核验 | `☑`(v3) | `—` | `SKIP` | 挂起清单 §7-2；解除条件 `user_signed` |
| AC-10 目录改名与引用清扫核验 | `☑`(v3) | `—`（ARCH 代施） | `☐` | 待 QA 核验；AC-10b 口径见交付说明 §5 |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-1 | `已解决` | TASK-003 写通道 policy diff：用户人工落盘完成，ARCH 核验通过（10 条 `allow dev` 与 spec §7 逐字一致，diff 纯追加、既有行零改动）；§7-1 清项，交 DEV | `ARCH` | `用户`（已处置） | `12:48` |
| B-2 | `contract-gap` | AC-10b 要求全仓 `*.md` 旧路径字符串为 0，但 spec 自身（AC-10b 与 §9）含该字符串两处；DEV 对 `arch-*.md` 只读，无法清零。请 ARCH 裁决：AC-10b 是否排除 spec 的契约说明文本，或接受该两处例外 | `DEV` | `ARCH` | `13:46` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `13:43` | 重启告警渲染（用户反馈看漏） | D5-4「着重突出」定式化：`【突出】` 存在时围栏外**标红**独立告警行（`\textcolor{red}{...}`）+ 围栏内原文保留；spec v2→v3（AC-1j） | `arch-20261026-1248-spec.md`（v3） |
| `13:30` | TASK-003 写通道核验 | 用户人工落盘；ARCH 核验通过（10 条逐字一致、diff 纯追加零改动），§7-1 清项，交 DEV 开工 | board B-1 / 挂起清单 §7-1 |
| `13:24` | TASK-003 写通道落盘被 guard 拦 | 非误判（`deny * policy.txt` 根信任设计）；改走 spec §7 逃生舱由用户人工落盘，禁止 ARCH 绕路 | board B-1 / 挂起清单 §7-1 |
| `13:19` | 目录命名 / 流程标记 / 接力提示词（grill 9 问） | N1 目录 `TASK-<NNN>-<YYYY-MM-DD>-<slug>` 存量全回填；N2 文件名自由段带 `-第N轮`；N3 board 处置流程段（4 阶段链 + 迭代日志）；N4 提示词块替代三字段表（七段骨架、按需生成不预支）。改名清扫经用户授权 ARCH 代施（范围锁死，AC-10 核验） | `docs/architecture/ADR-0005-任务命名流程标记与接力提示词.md`、spec v2 |
| `12:48` | TASK-003 立项（ADR-0004 D1–D6 落地） | spec v1 定稿；写通道复用 ADR-0003 模式（挂起清单 §7-1 待用户授权） | `arch-20261026-1248-spec.md`、`docs/architecture/ADR-0004-三角色回复规范与任务接力机制.md` |

## 6. 交接备注

DEV 第 1 轮已交付，见
`docs/task/TASK-003-2026-10-26-回复规范落地/dev-20261026-1346-release.md`。
当前看板 `testing`；AC-9 仍 SKIP（`user_signed` 后核验）。

⚠ **必须重启 QA 窗口 / 会话才能执行下一步（新 rules 指针未载入前，AC-8 格式自检无效）。**

**承接方：QA**

```text
【任务】TASK-003-2026-10-26-回复规范落地 · 验收 AC-1~AC-10（第 1 轮）
【必读】docs/task/TASK-003-2026-10-26-回复规范落地/arch-20261026-1248-spec.md —— v3 契约与 AC-1~AC-10
        docs/task/TASK-003-2026-10-26-回复规范落地/dev-20261026-1346-release.md —— DEV 交付物与自测证据
        docs/REPLY-CONVENTIONS.md —— 回复格式单一真值源（AC-1/AC-8）
        docs/task/TASK-003-2026-10-26-回复规范落地/board.md —— 处置流程、挂起清单、本交接
【指令】1. 先重启 QA 会话，确认 `.omp/trio/test.rules.md` 末尾已载入 REPLY-CONVENTIONS 指针。
        2. 新建/扩展 tests：`tests/trio-reply-conventions.test.mjs`（AC-1/2/3/4/8）
           与 `tests/trio-check-report.test.mjs` T10 段（AC-5/6/7）。
        3. AC-5/6 用临时 fixture 文件树覆盖：存在/缺失、glob、`::nodeid`、`:行号`、
           fenced、非反引号、裸文件名、标点包裹、同路径多次。
        4. AC-10：核对三个 TASK-00N 目录、旧名不存在、全仓 `*.md` 旧路径字符串；
           若按字面命中 spec 自身两处，按契约缺口记录，不自行改 arch-*.md。
        5. AC-9 保持 SKIP，解除条件 `user_signed`；`user_signed` 后集中补测一轮。
        6. 复测/发现缺陷时，按 `qa-<YYYYMMDD>-<HHMM>-report-<主题>[-第<N>轮].md`
           产出报告，报告含 `格式自检` 小节。
【交付】docs/task/TASK-003-2026-10-26-回复规范落地/qa-<YYYYMMDD>-<HHMM>-report-<主题>.md
        + 看板 AC 验证列逐条回填 + `qa_report` 字段回填 + 状态推 `qa_passed` 或回退 `implementing`
【纪律】tests/** 归 QA，src/** 与 arch-*.md 只读；commit 显式 pathspec；
        不改 T1–T9 语义与文件名正则；结论/断言/时间戳/状态值零改动；
        不放宽 AC-10b 口径来制造假绿。
【突出】必须重启 QA 窗口 / 会话才能执行下一步（AC-8 格式自检依赖新 rules 指针）。
【完成】AC-1~AC-8、AC-10 逐条有正常/边界用例且全绿；AC-9 以 SKIP 记账；
        报告通过 `bun bin/trio-check-report.mjs`；看板状态与 AC 表同步。
```

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| §7-2 通道回收核验（AC-9） | `user_signed` | `QA` | 确认 BEGIN/END TASK-003 段已删且 fail-closed 恢复，跑 `bun tests/trio-policy.test.mjs` 并记 qa 报告 |
| §7-3 三窗口重启使新 rules 生效 | rules 指针落盘（spec §6 步骤 2 完成） | `用户` | 重启 arch / dev / qa 三窗口，后续回复按 `docs/REPLY-CONVENTIONS.md` |

解除条件成熟 → 触发者集中补测一轮；`user_signed` + 挂起清单清零 = 真闭环。
