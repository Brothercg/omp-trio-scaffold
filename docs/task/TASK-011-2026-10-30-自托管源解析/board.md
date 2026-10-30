# 任务看板：init-agent 源侧布局回退（反馈 ⑬）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-011` |
| 任务目录 | `docs/task/TASK-011-2026-10-30-自托管源解析/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-30` |
| qa_report | `docs/task/TASK-011-2026-10-30-自托管源解析/qa-20261030-2035-report-自托管源解析.md` |
| release_gate | `strict` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed` |
| 最后推进人 | `DEV`（发布 v0.9.2） |
| 最后更新 | `2026-10-30 21:05` |

> 终验依据：QA 第 1 轮全绿（基线 `298a103`，T12 自证 exit 0）；用户终验签字 `2026-10-30 20:56`。发布动作不属本单。

### 处置流程

| 阶段 | 状态 | 轮次 | 熔断计数（实现轮 N/3） | 根因分类 |
|---|---|---|---|---|
| ① ARCH 设计（增量契约 + 裁决） | done | spec v1 / V-13 | — | — |
| ② 实现（无角色执行窗口，ADR-0014） | done | 第 1 轮 | `0/3` | — |
| ③ QA 测试（自托管全流程 + 幂等对抗） | done | 第 1 轮 | `0/3` | — |
| ④ 闭环（user_signed + 挂起清单清零） | done（user_signed 20:56;§7 挂起项移交发布与下游面） | 第 1 轮 | — | — |

迭代日志：
- 19:52：用户实测自托管 `--dry-run` 崩溃（`sed: can't read templates/post-commit`）→ 判契约缺口 → spec 增量 v1 + V-13，转 ②
- 20:05：无角色窗口落 S1–S4（`9e8c63e`）；自托管 dry-run exit 0、缺源 exit 1、替换幂等；全量 445 项 + selftest 28 项全绿；转 `testing` 交 QA
- 20:35：QA 第 1 轮全绿（qa-20261030-2035 双件;T12 自证 exit 0）。AC-1 用「无 templates/post-commit」等价夹具补 TASK-010 验证缺口（行为级全流程 exit 0）;AC-3 混合源 6 项对抗。自证发现:selftest 并发三实例互踩夹具属探针环境并发,非实现缺陷——串行 3/3 复跑 28/28。挂起同 §7:下游重跑原命令 / v0.9.2 发布 / 19 条 SKIP
- 20:56：用户终验签字 `user_signed`——TASK-011 真闭环（§7 挂起项仅剩 v0.9.2 发布 / 下游复跑原命令 / 19 条 SKIP 转实跑,均待发布后触发）。
## 3. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 自托管 dry-run 全流程 | `☑` | `☑` | `☑` | QA 通过 |
| AC-2 hook 源回退 | `☑` | `☑` | `☑` | QA 通过 |
| AC-3 模板/简报/工具/测试回退 | `☑` | `☑` | `☑` | QA 通过 |
| AC-4 源缺失 fail-closed | `☑` | `☑` | `☑` | QA 通过 |
| AC-5 替换幂等 | `☑` | `☑` | `☑` | QA 通过 |
| AC-6 回归（445 项 / selftest 28） | `☑` | `☑` | `☑` | QA 通过 |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| — | — | 无 | — | — | — |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| 19:52 | 自托管 dry-run 崩溃：实现缺陷还是契约缺口 | **契约缺陷**：spec v1 只定义目标侧映射，源侧回退未契约化；`TASK-010` AC-2 验证面不足（只断 preflight 文案） | `arch-20261030-1952-verdict-1.md` |
| 19:52 | 替换式 `s#bin/trio-#tooling/bin/trio-#` 对已含前缀源二次替换 | 替换改为左边界感知并幂等（S4），产物不得出现 `tooling/tooling/` | `arch-20261030-1952-spec.md` §3 S4 |
| 19:52 | 本轮门禁档位 | `strict`（不放 exempt）：缺陷逃逸自 user_signed 任务，须 QA 双件 | 本板 §1 |

## 6. 交接备注

增量契约与修复提示词已定稿；实现面 `bin/init-agent.sh` 受 `deny * bin/**` 保护，
由用户开无角色窗口按提示词落地，随后 QA 双件复测。

**下一步任务分配**

承接方：用户的无角色 omp 窗口（不设 `TRIO_ROLE`）

```
【任务】修复反馈 ⑬：init-agent 源侧布局回退 + 干跑源校验 + hook 替换幂等（TASK-011）
【必读】docs/task/TASK-011-2026-10-30-自托管源解析/arch-20261030-1952-spec.md（S1–S5 + AC-1..6）
        docs/task/TASK-011-2026-10-30-自托管源解析/arch-20261030-1952-verdict-1.md
【指令】1. 在 bin/init-agent.sh 增加逐载荷源解析（候选 1 上游树 → 候选 2 自托管树），
           覆盖 hooks / 工具 / 测试 / 文档模板 / 角色简报；preflight 改用解析后的 hooks 源
        2. 缺源 fail-closed：逐件打印 `失败 <rel>：源缺失 <候选列表>` 并计入失败，
           不得在 sed/install 处整步中断；hooks 三件全缺 → stderr `未找到 hooks 源`
        3. 干跑计划行前先校验源存在（共用同一解析函数）；源缺失时干跑也 exit 1
        4. hook 产物替换加左边界（前导非 / 字母 数字 _ . -），保证幂等、无 tooling/tooling
        5. tests/trio-init-layout.test.mjs 增补自托管夹具：tooling/bin + tooling/hooks +
           无 templates/post-commit 的仓，--dry-run 全流程 exit 0；源缺失 exit 1；幂等 cmp
        6. CHANGELOG 增 `## v0.9.2 — 2026-10-30`；两笔 commit：
           fix(init-agent) 代码+测试 / docs 版本与交付说明
【交付】dev-<YYYYMMDD>-<HHMM>-release.md（TASK-011 目录）+ commit 号 + v0.9.2；看板
        §3 勾选、状态 implementing→testing
【纪律】禁 push / tag（发布另走 v0.9.2 流程）；禁 --no-verify；显式 pathspec；
        不改 .omp/trio/policy.txt、templates/pre-*、下游仓；不删除文件
【突出】AC-1 必须用「无 templates/post-commit」的等价夹具复现原崩溃点再转绿；
        AC-5 用已含 tooling/bin 前缀的 hook 源验证不二次替换
【完成】自托管夹具 --dry-run exit 0 且输出六段+汇总；源缺失 exit 1 且零写入；
        全量套件 ≥440 项全绿；selftest --fast 全绿；两笔 commit 落账、git status 干净
```

承接方：QA 窗口（实现 commit 落账后）

```
【任务】TASK-011 对抗复测并出双件（checklist + report）
【必读】arch-20261030-1952-spec.md §4/§4.1；verdict-1；本板 §3/§7
【指令】按 AC-1..AC-6 逐条断言；对抗重点：逐载荷混合源（上游/自托管各占一部分）、
        单件缺源、三件全缺、已含前缀源的幂等、ROOT==TARGET 自复制无变更
【交付】qa-<YYYYMMDD>-<HHMM>-checklist-<slug>.md + …-report-<slug>.md（同 HHMM 同 slug，
        report 过 bun bin/trio-check-report.mjs 且自身过 T12），board qa_report 回填
【纪律】只写 qa-*.md 与 board.md；不得改实现
【突出】必须补 TASK-010 的验证缺口：断言「自托管 dry-run 全流程 exit 0」而非只断文案
【完成】双件落位、看板 qa_passed，挂起清单交用户终验；user_signed 后走 v0.9.2 发布
```

## 6.5 交接

> 任务闭环,无接力。证据链:V-13 契约缺口 → S1–S4(`9e8c63e`)→ QA 第 1 轮全绿（qa-20261030-2035 双件,T12 exit 0）→ user_signed 20:56。

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| 下游重跑 `init-agent.sh . --dry-run` | 修复发布并重装 | 用户 / 下游 | 复跑本单原始命令，确认 exit 0 + 汇总 |
| 下游 19 条「上游 ⑩ 依赖」SKIP | v0.9.2 重装完成 | 下游 QA | 转实跑并回填下游板 §7 |
| ~~v0.9.2 发布（tag/push）~~ | — | 已完成（release commit `35c3b55`；tag `012566b`） | — |

`user_signed` + 挂起清单清零 = 真闭环；解除条件成熟 → 触发者集中补测一轮。

## 8. 发布记录

- `2026-10-30 21:01`：DEV 发布 `v0.9.2` —— `main 0a7f515..7402ce1`；
  release commit `35c3b55`；tag `v0.9.2` object `012566b`（peeled `35c3b55`）；
  远端 main / tag 已落地。发布记录 `dev-20261030-2101-release-v0.9.2.md`。
- pre-push：TASK-011 `strict` path A 通过；基线 `298a103` ≠ 待推 `7402ce1`，
  delta 仅文档（5 个）→ 放行；审计无 bypass。
- 门禁卫生：`7402ce1` 将 TASK-010 旧 `exempt(maintenance)` 退役为 `strict`
  （历史 V-12 保留），避免旧豁免继续全局放行后续发布。
