# 任务看板：tooling 布局安装模板与测试面补齐（v0.9.3）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-012` |
| 任务目录 | `docs/task/TASK-012-2026-10-30-安装模板与测试面/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-30` |
| qa_report | `docs/task/TASK-012-2026-10-30-安装模板与测试面/qa-20261030-2258-report-安装模板与测试面.md` |
| release_gate | `strict` |
| 远端 main hash | `c0f4e440504b5dc8e86b5c6b9a1b3185a183c474` |
| 远端 tag object | `b5ef707bdb0e4e11e00133dc5f04ed8472a9dd99`（peeled `12df23eb99fe4cd1258fbc4c6caeb667d38a3681`） |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed` |
| 最后推进人 | `DEV`（发布 v0.9.3） |
| 最后更新 | `2026-10-30 23:24` |

> 终验依据：用户终验签字 2026-10-30 23:05；QA 第 1 轮全绿 + SKIP 挂起已现记。
> v0.9.3 已发布（release commit `12df23e`，tag object `b5ef707`，main `c0f4e44`）；下游 AC-10 待复跑。

### 处置流程

| 阶段 | 状态 | 轮次 | 熔断计数（实现轮 N/3） | 根因分类 |
|---|---|---|---|---|
| ① ARCH 设计（契约 v1 + ADR-0016 + 两份提示词） | done | — | — | — |
| ② 实现（无角色执行窗口 / DEV） | done | 第 1 轮 | `0/3` | — |
| ③ QA 测试（重装/幂等/测试面对抗） | done | 第 1 轮 | `0/3` | — |
| ④ 闭环（下游重装验收 + user_signed + 挂起清零） | done（user_signed 23:05;AC-10 SKIP 挂起移交发布后触发,视为闭环前提已交待） | 第 1 轮 | — | — |

迭代日志：
- 21:33：用户呈报下游 T10 + 安装后测试面失败（16/10、66/1）→ 判契约缺口（安装面渲染 + 测试面分层未契约化）→ 契约 v1 + ADR-0016，转 ②
- 22:26：无角色窗口落 R1–R8（`3d0a069`）；tooling 夹具 17 落点禁词 0、重装 0 覆盖、安装面 6 套件全绿；全量 450 项 + selftest 28 项；转 `testing` 交 QA
- 22:58：QA 第 1 轮复测完成——30 项对抗探针（AC-1..AC-9,含混合模板名册上游/安装面双位校验、root tests 注入不倒灌、scaffold-only 旧拷贝桥、两层模板 checkText）全绿;AC-11 回归 450 项/selftest 28。AC-10 SKIP:下游 tooling/bin/init-agent.sh 实测无 render_payload（确认停留 v0.9.2），原 sed 崩点复现,按 spec §7 待 v0.9.3 发布后复跑;总判定「通过 + SKIP 1」;T12 自证 exit 0。双件 qa-20261030-2258-*
- 23:05：用户终验签字 `user_signed`——TASK-012 真闭环（§7 挂起项:AC-10 下游复跑 / 19 条 SKIP / v0.9.3 发布 / TASK-013 提案,均移交发布窗口与 ARCH）

## 3. 验收准则进度

| AC | 契约定稿 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 渲染覆盖面与禁词 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-2 bin 布局零回退 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-3 渲染幂等与重装稳定 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-4 模板逐文件候选 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-5 selftest 目录选择 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-6 scaffold-only 跳过 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-7 测试根解析 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-8 模板两层校验 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-9 部署面 | `☑` | `☑` | `☑` | 待 QA 复测 |
| AC-10 下游重装验收 | `☑` | `◐` | `☑` | 等价夹具通过；下游脚本停留 v0.9.2（实测无 render_payload/resolve_src）→ SKIP 挂起，修复发布后由下游复跑（spec §7;board §7 第 1 行） |

## 4. 阻塞与待裁决

| 编号 | 类型 | 描述 | 提出 | 待谁 | 起始时间 |
|---|---|---|---|---|---|
| — | — | 无 | — | — | — |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
| 21:33 | A 模板布局化机制 | 安装期幂等渲染（复用 create_hook 三步占位符法），否决占位符渲染 | spec §3 / R1 |
| 21:33 | B selftest 发现顺序 | 按脚本自身布局选目录；另一目录忽略+提示，不删不计失败 | spec §3 / R6 |
| 21:33 | C 测试根解析 | 单套自适应（`_layout.mjs` 地标探测 + 候选），禁安装期改写测试 | spec §3 / R4/R5/R7 |
| 21:33 | D 根 `templates/` 归属 | `*.md`=源区（authoring 领先合法，候选 1）；hook 文件=遗留回退；不进 AHEAD、--force 不作用源区 | spec §3 |
| 21:33 | E 版本与门禁 | v0.9.3 patch、CHANGELOG 新小节、`strict` + QA 双件 + 下游重装验收 | spec §1 / 本板 §1 |
| 21:33 | 测试安装策略 | 要修 3 处（源序布局优先 / `*.mjs` glob / `$TESTS_REL`），新增 `_layout.mjs`，5 套件标记 scaffold-only | spec §9 |
| 21:33 | S1 修订 | 执行件候选布局优先（重装不倒灌遗留拷贝），模板/简报源区优先 | spec §3 末 |
| 21:33 | 遗留风险 | policy glob 布局盲（tooling/bin 自保缺口等）→ 建议 TASK-013；T10 前缀不扩 | spec §8 |

## 6. 交接备注

实现已落（`3d0a069`）：安装面渲染、执行件布局优先、测试面自适应；全量 450 项与上游
selftest 28 项、tooling 安装面 6 套件全绿。交 QA 按 `arch-20261030-2133-prompt-QA.md` 出双件。

**下一步任务分配**

承接方：无角色 omp 窗口（不设 `TRIO_ROLE`）——整段粘贴
`docs/task/TASK-012-2026-10-30-安装模板与测试面/arch-20261030-2133-prompt-实施.md` 分隔线内内容。

承接方：QA 窗口（实现 commit 落账后）

```
【任务】TASK-012 对抗复测并出双件（checklist + report）
【必读】arch-20261030-2133-spec.md §4/§5/§5.1；board §3/§7
【指令】按 AC-1..AC-10 断言；对抗重点：已适配源幂等、混合模板名册、根 tests 干扰、
        scaffold-only 旧拷贝、bin 布局字节零回退、[6/6] 不倒灌
【交付】qa-<YYYYMMDD>-<HHMM>-checklist-<slug>.md + …-report-<slug>.md（同 HHMM 同 slug，
        report 过 bun bin/trio-check-report.mjs 且自身过 T12），board qa_report 回填
【纪律】只写 qa-*.md 与 board.md；不得改实现
【突出】AC-10 需下游 factor_synthesis 实跑 --force 重装 + selftest（用户/下游配合）
【完成】双件落位、看板 qa_passed；交用户终验后走 v0.9.2→v0.9.3 发布
```

## 6.5 交接

> 任务闭环,无接力。证据链:契约 v1 + ADR-0016 → R1..R8(`3d0a069`)→ QA 第 1 轮「通过 + SKIP 1」（qa-20261030-2258 双件,T12 exit 0）→ user_signed 23:05。

## 7. 挂起清单（SKIP/待解除）

| 条目 | 解除条件 | 触发者 | 解除后动作 |
|---|---|---|---|
| 下游 `--force` 重装 + selftest 全绿（AC-10） | v0.9.3 修复落地 | 用户/下游 | 复跑 `init-agent.sh . --force` + `trio-selftest.sh --fast`，回填本板 |
| 下游 19 条「上游 ⑩ 依赖」SKIP 中模板/测试面项 | 同上 | 下游 QA | 转实跑并回填下游板 §7 |
| ~~v0.9.3 发布（tag/push）~~ | — | 已完成（release commit `12df23e`；tag `b5ef707`；main `c0f4e44`） | — |
| TASK-013 提案（policy glob 布局化） | 用户批准立项 | ARCH | 补写权面契约（spec §8 遗留） |

`user_signed` + 挂起清单清零 = 真闭环；解除条件成熟 → 触发者集中补测一轮。

## 8. 发布记录

- `2026-10-30 23:24`：DEV 发布 `v0.9.3` —— `main 8a93c8e..c0f4e44`；
  release commit `12df23e`；tag `v0.9.3` object `b5ef707`
  （peeled `12df23e`）；远端 main / tag 已落地。
- 发布前核验：全量 450 项 0 失败；`trio-selftest.sh --fast` 28 项 0 失败；
  QA 报告校验 exit 0；`bash -n` exit 0。
- pre-push：TASK-012 `strict` path A 通过；基线 `e00bdcd` ≠ 待推 `c0f4e44`，
  delta 仅文档（4 个）→ 放行；审计无 bypass。
- 发布记录：`dev-20261030-2311-release-v0.9.3.md`。
- 备注：`de4a476` / `c0f4e44` 为发布门禁字段归一（`qa_report` 纯路径、
  `当前状态` 纯 `user_signed`），修复 pre-push path A 误判；tag 仍指向 release commit。
- 遗留：AC-10 下游 `factor_synthesis` 重装 + 19 条 SKIP 转实跑，待下游窗口回填。
