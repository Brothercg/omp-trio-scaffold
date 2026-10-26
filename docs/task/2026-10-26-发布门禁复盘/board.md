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
| 当前状态 | `qa_passed`（第 2 轮复测全绿：AC-1 边界与 AC-9r 转绿，其余 AC 回归维持；report `qa-20261026-1201`，SKIP 2 不计 PASS） |
| 最后推进人 | `QA`（第 2 轮复测报告 `qa-20261026-1201-report-发布门禁复盘-第2轮.md`，guard 加载 commit 9d97a10 自证；机械推导与总判定一致 = 通过） |
| 最后更新 | `2026-10-26 12:01` |
| qa_report | `docs/task/2026-10-26-发布门禁复盘/qa-20261026-1201-report-发布门禁复盘-第2轮.md` |

> 状态推进权见 `templates/board.template.md`。DEV 只负责提出缺口与证据，
> 是否立项、如何定 AC、优先级排序由 ARCH 裁决；DEV 不修改契约与测试。

## 3. 验收准则进度

> 尚无 AC。下表按缺口编号占位，ARCH 定稿时重编为 AC 编号并补正文。

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1/2/3 guard 误伤消除（G-1a） | `☑`(v2) | `☑` | `☑` | `通过`（第 2 轮复测：B-10 会话内重跑全过——主路径 4 例 + 4 种拦截命令形态零拦截；B-10 关闭不立 BUG-003） |
| AC-4 证据绑定（G-6，取代 TASK-001 AC-7） | `☑`(v2) | `☑` | `☑` | `通过`（9 条对抗全过，第 1 轮 `qa-20261026-1023`；第 2 轮回归维持绿） |
| AC-5/6 自举豁免放行（G-2） | `☑`(v2) | `☑` | `☑` | `通过`（豁免放行含审计行；空/非法/无引用 3 态全红；第 2 轮回归维持） |
| AC-7 rules 相等断言（G-3） | `☑`(v2) | `QA 补` | `☑` | `通过`（三对逐字节相等；断言已入 tests/trio-gate-contract.test.mjs，第 2 轮回归维持） |
| AC-8 selftest 自动发现（G-4） | `☑`(v2) | `☑` | `☑` | `通过`（fixture 实跑：5 套件全被点名执行；init 全量部署；第 2 轮回归维持） |
| AC-9 CHANGELOG 真值源（G-5） | `☑`(v2) | `☑` | `☑` | `通过`（第 2 轮复测：README L7 标注命中、套件 AC-9 全绿，第 1 轮复测通过第 2 轮；B-9 关闭） |
| AC-10 board 字段进模板（G-2/6 配套） | `☑`(v2) | `☑` | `☑` | `通过`（qa_report / release_gate 在标识段；check-report 回归绿，第 2 轮维持） |
| AC-11 临时写通道语义断言（V-2） | `☑`(v2) | `QA 补` | `☑` | `通过`（恰 5 条锁死、第 6 条注入红、arch/qa deny、deny * 不受通道影响；第 2 轮含会话内实操佐证 2 次实拦） |
| AC-12 通道回收核验（V-2） | `☑`(v2) | `待用户` | `SKIP` | 依赖 user_signed 时点；签字后在脚手架根重跑 `bun tests/trio-gate-contract.test.mjs` 切回收断言（该套件断言基于脚手架根路径，目标仓库内运行会 ENOENT，非 AC 失败），SKIP 不计 PASS |

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
| B-9 | `已解决` | AC-9r：README 版本行未标注「版本号以 git tag 为准」。**V-4 裁决：实现缺口（非契约过严）**——AC-9 措辞是单一真值源最小闭环；README L7 标注已由 ARCH 落盘（公共维护区，不占写窗口），spec v2 不动。QA 第 2 轮复测 AC-9r | `QA` | `ARCH`（已处置） | `10:23` |
| B-10 | `已裁决` | AC-1 对抗边界：QA 会话内 `bun <脚本> --help` / `selftest --fast` 被拦 3 次。**V-4 裁决：观察成立、归因不成立，不立 BUG-003**——白盒对照实验证实 HEAD（9d97a10）对 `bun`/`bash` 不产出写目标（12 例全 pass），逐字复现 QA 报错的是 ecb0470 旧版 guard；机制 = 旧会话驻留代码（与 B-8 同类，滞留的是代码非 policy）。处置：QA 重启会话后复测 AC-1 边界；门禁变更后三会话必须重启再验收 | `QA` | `ARCH`（已处置） | `10:23` |

> 连续 3 轮未全绿 → 停手并在此记 `blocked` 四项。本任务尚无实现轮次。

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| `10:58` | B-9（AC-9r README 版本行）/ B-10（AC-1 对抗边界归因） | B-9 = 实现缺口（契约不动，ARCH 补 README L7 标注）；B-10 = 观察成立归因不成立（不立 BUG-003，机制 = 旧会话驻留 guard 代码，QA 重启后复测） | `arch-20261026-1058-verdict-4.md`（V-4；spec 保持 v2） |
| `05:52` | policy 写窗口落盘（用户授权 ARCH 代施一次） | commit `3fb519a`：两条目录 deny 降角色级 + 5 条精确 allow；根信任未动。回归：`trio-guard`/`trio-policy` 各红 2 条（钉旧语义「任何角色不得写 guard.ts/init-agent.sh」，与 AC-11 窗口语义相反）→ 由 QA 按 AC-11 更新断言 | `3fb519a` |
| `05:36` | BUG-002 实现入口被写策略阻断 | 成立（契约缺陷：只写了「谁做」没写「凭什么能做」）；5 文件仍由 DEV 写，经任务级临时写通道（deny 降角色级 + 5 条精确 allow，根信任永不豁免）；用户落盘 diff + user_signed 后回收 | `arch-20261026-0536-verdict-2.md`、`docs/architecture/ADR-0003-门禁自举临时写通道.md`、spec v2 |
| `05:02` | BUG-001 六项缺口逐项判定 | G-1a/1c/2/3/4/5/6 成立（G-1b 不成立）；P0=G-2/1a/6，P1=G-4/3，P2=G-5 | `arch-20261026-0502-verdict-1.md` |
| `05:02` | 效力层级 / 豁免 / 证据绑定 / 真值源 | 三层模型 + board 豁免字段 + merge-base 绑定 + profiles 真值源 | `docs/architecture/ADR-0002-门禁效力层级与发布证据绑定.md` |

## 6. 交接备注

**第 2 轮复测完成（QA，commit 2e1d638 基线，guard 加载 9d97a10 自证）→
全部非 SKIP 项绿 → 状态推 `qa_passed`**。报告：
`qa-20261026-1201-report-发布门禁复盘-第2轮.md`（trio-check-report 合规，
总判定 = 通过；SKIP 2 单列记账不计 PASS）。

- B-9 关闭：README L7 标注命中（`grep -n 'tag 为准' README.md` → L7），
  套件 `tests/trio-gate-contract.test.mjs` AC-9 全绿。第 1 轮复测通过。
- B-10 关闭：会话内重跑第 1 轮被拦命令形态（`--help`×2、`selftest --fast`
  ×2）+ 主路径 4 例，`bun /tmp/qa-r2-probe.mjs` ALL PASS（8/8 zero block）；
  与 V-4 白盒对照结论一致，不立 BUG-003。
- 回归属套件（59/128/21/34/11 = 253 项断言）全绿，零失败。
- QA 会话内对抗佐证：本轮 QA 自己对 policy.txt / pre-commit 型命令仍被
  guard 实拦（deny * 生效）；窗口 5 文件 DEV 仍可写；通道未提前回收。

**用户终验步骤（qa_passed 之后）**：
1. 回收 policy 写通道：整段删除 `.omp/trio/policy.txt` 的 BEGIN/END
   TASK-002 内容，并把四条角色级 deny 恢复为
   `deny * .omp/hooks/**` 与 `deny * bin/**` 两行（ADR-0003）。
2. 看板推进 `user_signed`，并在决策记录写回收动作行。
3. QA 按 AC-12 核验回收三件套：无 BEGIN/END 段、两条 deny * 恢复、决策
   记录含回收动作行 ← 在**脚手架根**重跑 `bun tests/trio-gate-contract.test.mjs`
   （该套件 AC-7/8/9/10/12 断言基于脚手架根相对路径；目标仓库内运行会
   ENOENT 自证失败，不代表 AC 失败。AC-12 用例在 user_signed 状态自动切
   回收断言；任一不满足即红）。

**流程前置（V-4 已记）**：门禁代码或 policy 变更后，三个会话全部重启
再验收——guard 进程内驻留，验收基线 commit 必须与会话内驻留代码一致。
与本轮的教训同源（V-4 白盒实验证实第 1 轮 AC-1 「误拦」为 ecb0470 旧
驻留代码所致，HEAD 12 例全 pass）。

测试资产（QA 独占，全部已 commit）：`tests/trio-guard.test.mjs`（59 项，
AC-11 通道语义）、`tests/trio-policy.test.mjs`（128 项，窗口恰 5 条 +
BEGIN/END 段断言）、`tests/trio-pre-push.test.mjs`（21 项，AC-4 四类边
界 + AC-5/6 豁免对抗）、`tests/trio-gate-contract.test.mjs`（11 项，
AC-7/8/9/10/12）。旧语义断言按 v2 重写，非删除。

