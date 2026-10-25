# 任务看板：发布门禁复盘与契约缺口

<!--
落位：docs/task/2026-10-26-发布门禁复盘/board.md
本任务由 DEV 发起：复盘 TASK-001（v0.2.0）发布过程中暴露的门禁契约缺口。
当前状态为 spec_agreed（v2）：BUG-002 已裁决（V-2），待用户落盘临时写通道
diff 后 DEV 重启会话并推进 implementing。
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
| 当前状态 | `spec_agreed`（契约 v2 定稿；实施前置 = 用户落盘 V-2 §4.1 policy diff） |
| 最后推进人 | `ARCH`（V-2 裁决 + spec v2 + ADR-0003） |
| 最后更新 | `2026-10-26 05:36` |

> 状态推进权见 `templates/board.template.md`。DEV 只负责提出缺口与证据，
> 是否立项、如何定 AC、优先级排序由 ARCH 裁决；DEV 不修改契约与测试。

## 3. 验收准则进度

> 尚无 AC。下表按缺口编号占位，ARCH 定稿时重编为 AC 编号并补正文。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1/2/3 guard 误伤消除（G-1a） | `☑`(v2) | `☐` | `☐` | 待 DEV（通道生效后） |
| AC-4 证据绑定（G-6，取代 TASK-001 AC-7） | `☑`(v2) | `☐` | `☐` | 待 DEV |
| AC-5/6 自举豁免放行（G-2） | `☑`(v2) | `☐` | `☐` | 待 DEV |
| AC-7 rules 相等断言（G-3） | `☑`(v2) | `☐` | `☐` | 待 QA 补断言（当前两侧已相等） |
| AC-8 selftest 自动发现（G-4） | `☑`(v2) | `☐` | `☐` | 待 DEV |
| AC-9 CHANGELOG 真值源（G-5） | `☑`(v2) | `☑` | `☐` | ARCH 已回补 v0.2.0，待 QA 验证 |
| AC-10 board 字段进模板（G-2/6 配套） | `☑`(v2) | `☐` | `☐` | 待 DEV |
| AC-11 临时写通道语义断言（V-2） | `☑`(v2) | `☐` | `☐` | 待 QA |
| AC-12 通道回收核验（V-2） | `☑`(v2) | `☐` | `☐` | 待 QA（user_signed 时点核验） |

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
| B-7 | `waiting_user` | spec §8 分给 DEV 的 5 个文件被 policy 拒绝（`deny *` 优先 + fail-closed）。已裁决 V-2：经任务级临时写通道放行（ADR-0003）；**待用户落盘 V-2 §4.1 的 policy diff**（唯一可写 policy 的身份），DEV 重启会话后开工 | `DEV` | `用户` | `05:19` |

> 连续 3 轮未全绿 → 停手并在此记 `blocked` 四项。本任务尚无实现轮次。

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `05:36` | BUG-002 实现入口被写策略阻断 | 成立（契约缺陷：只写了「谁做」没写「凭什么能做」）；5 文件仍由 DEV 写，经任务级临时写通道（deny 降角色级 + 5 条精确 allow，根信任永不豁免）；用户落盘 diff + user_signed 后回收 | `arch-20261026-0536-verdict-2.md`、`docs/architecture/ADR-0003-门禁自举临时写通道.md`、spec v2 |
| `05:02` | BUG-001 六项缺口逐项判定 | G-1a/1c/2/3/4/5/6 成立（G-1b 不成立）；P0=G-2/1a/6，P1=G-4/3，P2=G-5 | `arch-20261026-0502-verdict-1.md` |
| `05:02` | 效力层级 / 豁免 / 证据绑定 / 真值源 | 三层模型 + board 豁免字段 + merge-base 绑定 + profiles 真值源 | `docs/architecture/ADR-0002-门禁效力层级与发布证据绑定.md` |

## 6. 交接备注

BUG-002 已裁决（V-2），契约升 v2（实施前置与分工重写，新增 AC-11/12）。
**下一步顺序**：①用户落盘 V-2 §4.1 的 policy diff（精确 diff 见
`arch-20261026-0536-verdict-2.md` §4.1）→ ②DEV **重启会话**（guard 进程内
缓存 policy，旧会话读不到新规则）→ ③看板推 `implementing`，DEV 按 v2 §8
实现 AC-1~AC-8/10，通道外文件一律不碰、commit 显式 pathspec → ④QA 出
AC-1~AC-12 对抗用例（重点：AC-4 祖先边界、AC-6 豁免伪造、AC-11 通道越界、
AC-12 回收残留）→ ⑤user_signed 后用户回收通道，QA 按 AC-12 核验。
