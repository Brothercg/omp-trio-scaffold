# 任务看板：三角色回复规范与任务接力机制落地

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-003` |
| 任务目录 | `docs/task/TASK-003-2026-10-26-回复规范落地/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-26` |
| qa_report | `docs/task/TASK-003-2026-10-26-回复规范落地/qa-20261026-1358-report-回复规范落地.md` |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `qa_passed`（QA 第 1 轮：AC-1~8/10 全绿、AC-9 SKIP 计账；报告 `qa-20261026-1358-report-回复规范落地.md`，校验器 0 违规） |
| 最后推进人 | `QA`（验收 AC-1~10；测试资产 3 件已 commit；contract-gap B-2 主记录 + 扩展候选 + AC-1j 附注已记入报告，仍挂 ARCH 裁决） |
| 最后更新 | `2026-10-26 13:58` |

### 处置流程

| 阶段 | 状态 | 轮次 |
|---|---|---|
| ① ARCH 设计（契约定稿） | done | spec v3 |
| ② DEV 开发 | done | 第 1 轮 |
| ③ QA 测试 | done | 第 1 轮 |
| ④ 闭环（user_signed + 挂起清单清零） | 待办 | — |

迭代日志：
- 第 0 轮 12:48（设计迭代）：用户补充命名/流程标记/提示词三组需求 → grill 9 问 → spec v1 → v2 + ADR-0005
- 第 0 轮 13:19（设计迭代）：改名清扫代施完毕（AC-10 待 QA 核验）
- 第 0 轮 13:30：写通道落盘核验通过（§7-1 清零），② 交 DEV 开工
- 第 0 轮 13:43（设计迭代）：`【突出】` 围栏外标红渲染定式化，spec v2 → v3（AC-1j）
- 第 1 轮 13:46（开发迭代）：DEV 六步落盘 → ③ 交 QA 验收
- 第 1 轮 14:12：③ QA 报告提 B-2/B-3 contract-gap → ARCH 联裁决（V-1/V-2，均判契约缺陷）→ spec v4；QA 依裁决改 tests 断言后复跑

②⇄③ 回环即迭代；轮次口径 = 3 轮熔断定义（「QA 判未通过 → DEV 修 → QA 复测」计 1 轮）。

## 3. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 REPLY-CONVENTIONS 结构与要件 | `☑`(v3) | `☑` | `☑` | `通过`（附录 A 逐字节 cmp = BYTE-EQUAL；a–j 过；AC-1j 字面「标红」vs 附录 A「红色」为 contract-gap，报告附注已记） |
| AC-2 rules 指针与成对相等 | `☑`(v3) | `☑` | `☑` | `通过`（指针子串 ×6；三对 cmp 相等；末尾追加位置过；与 spec §1.2 块一致） |
| AC-3 board 模板挂起清单与接力块 | `☑`(v3) | `☑` | `☑` | `通过`（处置流程 / §7 挂起清单 / §6 HTML 注释区接力块说明全部过） |
| AC-4 report 模板 T10 与数据源 | `☑`(v3) | `☑` | `☑` | `通过`（AC-4a–d 逐字命中） |
| AC-5 T10 基本行为 | `☑`(v3) | `☑` | `☑` | `通过`（AC-5a 0 违例；AC-5b 恰 1 条 T10 逐字，含行号/消息形态） |
| AC-6 T10 边界 | `☑`(v3) | `☑` | `☑` | `通过`（glob/fenced/非反引号/裸文件名 0 违例；::nodeid 与 :行号 剥后缀；标点包裹恰 1；同行同路径 2 条；空报告 0 违例；Docs/ 大小写不识别） |
| AC-7 T10 不回归 | `☑`(v3) | `☑` | `☑` | `通过`（47/0；--help 不变；既有 qa 报告 0 误伤；无网络/时钟/随机） |
| AC-8 优先级与格式自检 | `☑`(v3) | `☑` | `☑` | `通过`（AC-8a 优先级句在 §1；AC-8b 报告「格式自检」小节在，见 `qa-20261026-1358` §6） |
| AC-9 通道回收核验 | `☑`(v3) | `—` | `SKIP` | `SKIP`（解除条件 `user_signed`；触发者 QA；解除后动作 = 仓库根重跑 `bun tests/trio-policy.test.mjs` + 核验通道回收三件套；挂起清单 §7-2 记账，不计 PASS） |
| AC-10 目录改名与引用清扫核验 | `☑`(v3) | `—`（ARCH 代施） | `☑` | `通过`（三目录在、旧名 0 目录；字符串命中 spec×2 + dev×2 属 contract-gap B-2/扩展候选，未自行改 arch-*/dev-*；AC-10c diff 审通过） |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-1 | `已解决` | TASK-003 写通道 policy diff：用户人工落盘完成，ARCH 核验通过（10 条 `allow dev` 与 spec §7 逐字一致，diff 纯追加、既有行零改动）；§7-1 清项，交 DEV | `ARCH` | `用户`（已处置） | `12:48` |
| B-2 | `已裁决` | AC-10b 口径欠限定（V-1：`契约缺陷`）：字面「全仓为 0」与自身定义载体矛盾。裁定记录类豁免（arch-*/dev-*/qa-*/board.md/docs/architecture/**），豁免外为 0；spec v4 已落，QA 按 V-1 §4 改 AC-10b 断言 | `DEV` | `ARCH`（已裁决） | `13:46` |
| B-3 | `已裁决` | AC-1j 字面 `标红` 与附录 A 用词矛盾（V-2：`契约缺陷`）：断言对齐基准，改三标记口径（`红色`/`\textcolor{red`/`围栏外`）；附录 A 与 REPLY-CONVENTIONS 零改动，BYTE-EQUAL 保持；QA 按 V-2 §4 收紧断言、删桥接用例 | `QA` | `ARCH`（已裁决） | `13:58` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `14:12` | B-2/B-3 contract-gap 联裁决 | 两案均判 `契约缺陷`：V-1 AC-10b 改记录类豁免口径（豁免外为 0）；V-2 AC-1j 改三标记口径对齐附录 A（基准零改动、BYTE-EQUAL 保持）。spec v3→v4；tests 断言由 QA 按裁决处置表修正 | `arch-20261026-1412-verdict-1.md`、`arch-20261026-1412-verdict-2.md`、spec v4 |
| `13:58` | TASK-003 QA 第 1 轮验收 | AC-1~8/10 通过 + AC-9 SKIP 计账；测试资产 3 件 commit（trio-reply-conventions 新建 29 项、trio-check-report T10 段 13 项、trio-gate-contract 改名后路径同步）；contract-gap B-2 主记录 + 扩展候选 + B-3（AC-1j）上报，挂 ARCH 裁决 | `docs/task/TASK-003-2026-10-26-回复规范落地/qa-20261026-1358-report-回复规范落地.md` |
| `13:43` | 重启告警渲染（用户反馈看漏） | D5-4「着重突出」定式化：`【突出】` 存在时围栏外**标红**独立告警行（`\textcolor{red}{...}`）+ 围栏内原文保留；spec v2→v3（AC-1j） | `arch-20261026-1248-spec.md`（v3） |
| `13:30` | TASK-003 写通道核验 | 用户人工落盘；ARCH 核验通过（10 条逐字一致、diff 纯追加零改动），§7-1 清项，交 DEV 开工 | board B-1 / 挂起清单 §7-1 |
| `13:24` | TASK-003 写通道落盘被 guard 拦 | 非误判（`deny * policy.txt` 根信任设计）；改走 spec §7 逃生舱由用户人工落盘，禁止 ARCH 绕路 | board B-1 / 挂起清单 §7-1 |
| `13:19` | 目录命名 / 流程标记 / 接力提示词（grill 9 问） | N1 目录 `TASK-<NNN>-<YYYY-MM-DD>-<slug>` 存量全回填；N2 文件名自由段带 `-第N轮`；N3 board 处置流程段（4 阶段链 + 迭代日志）；N4 提示词块替代三字段表（七段骨架、按需生成不预支）。改名清扫经用户授权 ARCH 代施（范围锁死，AC-10 核验） | `docs/architecture/ADR-0005-任务命名流程标记与接力提示词.md`、spec v2 |
| `12:48` | TASK-003 立项（ADR-0004 D1–D6 落地） | spec v1 定稿；写通道复用 ADR-0003 模式（挂起清单 §7-1 待用户授权） | `arch-20261026-1248-spec.md`、`docs/architecture/ADR-0004-三角色回复规范与任务接力机制.md` |

## 6. 交接备注

QA 第 1 轮已完成，见
`docs/task/TASK-003-2026-10-26-回复规范落地/qa-20261026-1358-report-回复规范落地.md`。
当前看板 `qa_passed`；AC-9 仍 SKIP（`user_signed` 后核验）；contract-gap
B-2 / B-3 挂 ARCH 裁决（并行可执行，无先后依赖）。

⚠ **必须重启 ARCH 窗口 / 会话才能执行下一步（新 rules 指针未载入前，ARCH 回复格式自检不生效）。**

**承接方：ARCH**

```text
【任务】TASK-003-2026-10-26-回复规范落地 · 裁决 contract-gap B-2 / B-3（第 1 轮）
【必读】docs/task/TASK-003-2026-10-26-回复规范落地/qa-20261026-1358-report-回复规范落地.md —— 契约缺口机械记录与 AC 逐条结论
        docs/task/TASK-003-2026-10-26-回复规范落地/arch-20261026-1248-spec.md —— v3 契约原文（AC-1j / AC-10b / §9）
        docs/REPLY-CONVENTIONS.md —— 逐字落位基准（附录 A cmp = BYTE-EQUAL）
【指令】1. 裁决 B-2：AC-10b「全仓 *.md 旧路径字符串为 0」是否限定为「除 spec 契约说明文本与 dev-*/qa-* 报告正文引用外为 0」；
        2. 裁决 B-3：AC-1j 字面「标红」改口径为「红色 + \textcolor{red} 渲染定式」或以 verdict 修正 appendix A；
        3. 裁决结果以 verdict-N 文档 + spec 版本号 +1 落盘，同步修正对应 tests 断言口径（tests/** 归 QA，需出联裁决行）。
【交付】docs/task/TASK-003-2026-10-26-回复规范落地/arch-<YYYYMMDD>-<HHMM>-verdict-N.md + spec 版本升级
【纪律】tests/** 归 QA，src/** 与 qa-* / dev-* 只读；commit 显式 pathspec；
        结论/断言/时间戳/状态值零改动。
【突出】必须重启 ARCH 窗口 / 会话才能执行下一步（新 rules 指针未载入前，回复格式自检不生效）。
【完成】B-2 / B-3 裁决落盘 + spec 版本升级；回写 board §4 编号处置与 §5 决策记录。
```

**承接方：用户**

```text
【任务】TASK-003-2026-10-26-回复规范落地 · 终验签字（AC-9 解除前置）（第 1 轮）
【必读】docs/task/TASK-003-2026-10-26-回复规范落地/qa-20261026-1358-report-回复规范落地.md —— QA 第 1 轮结论与 SKIP 计账
        docs/task/TASK-003-2026-10-26-回复规范落地/board.md —— §2 状态 + §7 挂起清单
【指令】1. 终验：QA 全绿 + B-2/B-3 已裁决后方可签字；
        2. 以 `user_signed` 推进看板 §2 状态；
        3. 回收 .omp/trio/policy.txt 的 BEGIN/END TASK-003 段（整段删除，fail-closed 自动恢复），并在 §5 决策记录落回收动作行；
        4. 三窗口（arch/dev/qa）重启使新 rules 生效，后续回复按 docs/REPLY-CONVENTIONS.md。
【交付】board §2 状态 `user_signed` + §5 决策记录回收行 + 挂起清单 §7-3 清零
【纪律】不加新的 policy 段；不改 qa/dev/arch 产物；执行后跑一遍 `bun bin/trio-selftest.sh --fast` 自检。
【突出】必须重启三窗口 / 会话才能使新 rules 生效（不重启则回复格式自检不生效，属挂起清单 §7-3 解除动作）。
【完成】`user_signed` + 挂起清单清零 = 真闭环；QA 集中补测 AC-9（触发者重新领任务）。
```

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| §7-2 通道回收核验（AC-9） | `user_signed` | `QA` | 确认 BEGIN/END TASK-003 段已删且 fail-closed 恢复，在仓库根跑 `bun tests/trio-policy.test.mjs` 并记 qa 报告 |
| §7-3 三窗口重启使新 rules 生效 | rules 指针落盘（spec §6 步骤 2 已完成） | `用户` | 重启 arch / dev / qa 三窗口，后续回复按 `docs/REPLY-CONVENTIONS.md` |
| §7-4 B-2 / B-3 裁决后测试断言同步 | ARCH verdict 落盘 + spec 版本升级 | `QA` | 按 verdict 修正 `tests/trio-reply-conventions.test.mjs` 中 AC-1j / AC-10b 对应断言口径，集中补测一轮并记 qa 报告 |

解除条件成熟 → 触发者集中补测一轮；`user_signed` + 挂起清单清零 = 真闭环。
