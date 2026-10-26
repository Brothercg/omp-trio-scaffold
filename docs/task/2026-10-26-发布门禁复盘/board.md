# 任务看板：发布门禁复盘与契约缺口

<!--
落位：docs/task/2026-10-26-发布门禁复盘/board.md
本任务由 DEV 发起：复盘 TASK-001（v0.2.0）发布过程中暴露的门禁契约缺口。
当前状态为 testing：DEV 已按 spec v2 完成实现，交 QA 验证 AC-1~AC-12。
-->

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-002`（DEV 提议，ARCH 可改） |
| 任务目录 | `docs/task/2026-10-26-发布门禁复盘/` |
| 工作树 / 分支 | 本仓库 / `main` |
| 起始日期 | `2026-10-26` |
| 复盘基线 | `v0.2.0` / commit `7e84902` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `testing` |
| 最后推进人 | `QA`（报告 `qa-20261026-1023-report-发布门禁对抗验收.md`：总判定未通过——AC-9r README 版本行缺标注，contract-gap 待 ARCH 裁决 B-9；AC-12 SKIP 待 user_signed） |
| 最后更新 | `2026-10-26 10:23` |
| qa_report | `docs/task/2026-10-26-发布门禁复盘/qa-20261026-1023-report-发布门禁对抗验收.md` |

> 状态推进权见 `templates/board.template.md`。DEV 只负责提出缺口与证据，
> 是否立项、如何定 AC、优先级排序由 ARCH 裁决；DEV 不修改契约与测试。

## 3. 验收准则进度

> 尚无 AC。下表按缺口编号占位，ARCH 定稿时重编为 AC 编号并补正文。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1/2/3 guard 误伤消除（G-1a） | `☑`(v2) | `☑` | `☑` | `半通过`：AC-2/3 通过；AC-1 主路径过但有对抗边界（只读 flag 误伤）未过，见 `qa-20261026-1023` AC-1 |
| AC-4 证据绑定（G-6，取代 TASK-001 AC-7） | `☑`(v2) | `☑` | `☑` | `通过`（9 条对抗全过，见 `qa-20261026-1023` AC-4） |
| AC-5/6 自举豁免放行（G-2） | `☑`(v2) | `☑` | `☑` | `通过`（豁免放行含审计行；空/非法/无引用 3 态全红） |
| AC-7 rules 相等断言（G-3） | `☑`(v2) | `QA 补` | `☑` | `通过`（三对逐字节相等；断言已入 tests/trio-gate-contract.test.mjs） |
| AC-8 selftest 自动发现（G-4） | `☑`(v2) | `☑` | `☑` | `通过`（fixture 实跑：5 套件全被点名执行；init 全量部署） |
| AC-9 CHANGELOG 真值源（G-5） | `☑`(v2) | `☑` | `☑` | `半通过`：CHANGELOG 含 v0.2.0 过；README 版本行未标注（AC-9r 未通过，B-9） |
| AC-10 board 字段进模板（G-2/6 配套） | `☑`(v2) | `☑` | `☑` | `通过`（qa_report / release_gate 在标识段；check-report 回归绿） |
| AC-11 临时写通道语义断言（V-2） | `☑`(v2) | `QA 补` | `☑` | `通过`（恰 5 条锁死、第 6 条注入红、arch/qa deny、deny * 不受通道影响） |
| AC-12 通道回收核验（V-2） | `☑`(v2) | `待用户` | `SKIP` | 依赖 user_signed 时点；签字后重跑 `bun tests/trio-gate-contract.test.mjs`，SKIP 不计 PASS |

> G-1b（git add 拦截）裁决为**非缺陷（设计内）**，不进 AC；G-1c（绕过面）
> 为效力层级澄清，见 ADR-0002，亦不进 AC。

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| B-1 | `contract-gap` | bash 门禁把 `bun tests/...`、`grep tests/...`、`git add -- ...` 判为写入并拒绝；同时 `--pathspec-from-file` 可绕过文本匹配 | `DEV` | `ARCH` | `04:50` |
| B-2 | `contract-gap` | 自举 / 维护任务无法产出 `qa-*-report-*.md`，pre-push 的 dev 分支永远 exit 1，只能 `unset TRIO_ROLE` 人工放行 | `DEV` | `ARCH` | `04:50` |
| B-3 | `contract-gap` | `profiles/*.rules.md` 与 `.omp/trio/*.rules.md` 双份维护，无相等断言；本次发布前已漂移而 111 项测试仍绿 | `DEV` | `ARCH` | `04:50` |
| B-4 | `contract-gap` | `trio-selftest.sh` 硬编码 3 个 suite，未跑 `trio-pre-push.test.mjs`；`init-agent.sh` 也只部署 3 个测试 | `DEV` | `ARCH` | `04:50` |
| B-5 | `contract-gap` | 无 `CHANGELOG.md` / `VERSION` / `package.json`；版本号只在 README 散文与 tag 中，发布靠手工 | `DEV` | `ARCH` | `04:50` |
| B-6 | `contract-gap` | pre-push 的报告 glob 是全仓库、看板取 mtime 最新；放行证据未绑定待推任务 / 提交，旧报告可放行新推送 | `DEV` | `ARCH` | `04:50` |
| B-7 | `已解决` | spec §8 分给 DEV 的 5 个文件被 policy 拒绝。V-2 裁决经任务级临时写通道放行（ADR-0003）；policy 窗口已由用户授权、ARCH 代落（commit `3fb519a`）。DEV 重启会话后开工 | `DEV` | `ARCH`（已处置） | `05:19` |
| B-8 | `已解决` | 旧会话 policy 缓存问题已由用户重启解决；guard 实测允许写窗口文件，实现完成 | `DEV` | 用户（已处置） | `06:04` |
| B-9 | `contract-gap` | AC-9r：README 版本行未标注「版本号以 git tag 为准」（spec AC-9 明文；L354 是写权归属非权威源声明），QA 报告 AC-9r 未通过；由 ARCH 裁决修 README 或修契约措辞（QA 从不自行修 `README.md` 的版本行语义） | `QA` | `ARCH` | `10:23` |
| B-10 | `defect-candidate` | AC-1 对抗边界：`bun <脚本> --help` 型只读命令被 guard 抽取为写意图并拦截（QA 会话对 `bin/trio-check-report.mjs --help`、`bin/trio-selftest.sh --fast` 连续误拦 3 次）。guard 是尽力而为层，主路径不受影响；是否立案由 ARCH 裁决 | `QA` | `ARCH` | `10:23` |

> 连续 3 轮未全绿 → 停手并在此记 `blocked` 四项。本任务尚无实现轮次。

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `05:52` | policy 写窗口落盘（用户授权 ARCH 代施一次） | commit `3fb519a`：两条目录 deny 降角色级 + 5 条精确 allow；根信任未动。回归：`trio-guard`/`trio-policy` 各红 2 条（钉旧语义「任何角色不得写 guard.ts/init-agent.sh」，与 AC-11 窗口语义相反）→ 由 QA 按 AC-11 更新断言 | `3fb519a` |
| `05:36` | BUG-002 实现入口被写策略阻断 | 成立（契约缺陷：只写了「谁做」没写「凭什么能做」）；5 文件仍由 DEV 写，经任务级临时写通道（deny 降角色级 + 5 条精确 allow，根信任永不豁免）；用户落盘 diff + user_signed 后回收 | `arch-20261026-0536-verdict-2.md`、`docs/architecture/ADR-0003-门禁自举临时写通道.md`、spec v2 |
| `05:02` | BUG-001 六项缺口逐项判定 | G-1a/1c/2/3/4/5/6 成立（G-1b 不成立）；P0=G-2/1a/6，P1=G-4/3，P2=G-5 | `arch-20261026-0502-verdict-1.md` |
| `05:02` | 效力层级 / 豁免 / 证据绑定 / 真值源 | 三层模型 + board 豁免字段 + merge-base 绑定 + profiles 真值源 | `docs/architecture/ADR-0002-门禁效力层级与发布证据绑定.md` |

## 6. 交接备注

QA 对抗验收完成（第 1 轮），报告 `qa-20261026-1023-report-发布门禁对抗验收.md`。
总判定**未通过**（机械推导一致）：主路径 AC-2/3/4/5/6/7/8/10/11 全绿（套件
249 项断言 0 失败）；AC-1 半通过（对抗边界——只读 flag 误伤，B-10）；
AC-9 半通过（README 版本行标注缺失，AC-9r 未通过，B-9，待 ARCH 裁决）；
AC-12 SKIP（待 user_signed 后重跑 tests/trio-gate-contract.test.mjs）。

测试资产（QA 独占，全部已 commit）：`tests/trio-guard.test.mjs`（59 项，含
AC-11 通道语义）、`tests/trio-policy.test.mjs`（128 项，含窗口恰 5 条 +
BEGIN/END 段断言）、`tests/trio-pre-push.test.mjs`（21 项，AC-4 四类边界 +
AC-5/6 豁免对抗）、`tests/trio-gate-contract.test.mjs`（新增，11 项：AC-7/8/
9/10/12）。旧语义断言（「dev 不得写 guard.ts/init-agent.sh」×4、TASK-001
AC-7 语义 ×5）已按 v2 重写，非删除。

下一步：ARCH 裁决 B-9（修 README 还是修契约）→ B-10（是否立案 BUG-003）
→ ARCH 出契约补丁或改判 → 缺陷清零后 QA 复测（第 2 轮）→ 全绿推 `qa_passed`
→ 用户终验（回收通道 + `user_signed` + QA 复核 AC-12）。

