# CHANGELOG

<!--
真值源说明（ADR-0002）：本文件是变更记录的唯一真值源；
版本号以 git tag 为准，README 中的版本描述不作数。
格式：每版本一节，条目按「新增 / 修改 / 修复 / 弃用」分组，注明关联任务或 ADR。
-->

## v0.6.0 — 2026-10-29

门禁加固与流程契约落地（TASK-007 / ADR-0012、ADR-0013；修复 BUG-1/2/3）。

### 新增
- `trio-guard` 的 `judgeBash` 改为 allow + deny 全矩阵判定；写目标按
  `-t` / `--target-directory` / `--delete` / 选项值解析，覆盖 `cp`、
  `install`、`ln`、`rsync` 及组合短选项。
- `normalizeFsTarget` 按 realpath 归一：symlink 穿透、跨 worktree 出根
  拒绝，`/tmp` 等系统路径不受管辖。
- `pre-push` 证据绑定：报告基线必须等于待推 sha，或 delta 仅含文档
  白名单；三执法面统一 `# gate-version` 自证，漂移 fail-closed。
- `pre-commit` 写 marker，新增 `templates/post-commit`：无 marker 记
  `bypass(no-marker)`，正常提交记 `ok`；pre-push 放行前展示 bypass 审计。
- `bin/trio-mutation-check.mjs`：diff 变异质量门，退出码 0/1/2。
- 流程契约：spec 模板可并行性/前置条件、board 熔断字段与根因列、
  report 根因机检、RUNBOOK 攒批签字与时间预算。

### 修复
- BUG-1：`cp -t` / `cp --target-directory` / `install -t` / `ln -s -t` /
  `rsync --delete` 的写方向反转，写目标不再误取源路径。
- BUG-2：`gate-version` 改为严格唯一整数行，guard / pre-commit / pre-push
  三面同判；`0001` 按数值自证等价放行，重复行仍拒绝。
- BUG-3：非法 `TRIO_ROLE` 值（拼写错误 / 空格 / 空串）fail-closed；
  未设置仍保留无身份逃生舱并附醒目提示。
- AC-13：回收 TASK-007 临时写通道，`policy.txt` 删除窗口块并恢复四条
  `deny`，审计记录留档。

### 测试
- 10 个测试套件 405 项 0 失败；QA 第 3 轮复测 BUG-1/2/3 全通过，
  第 4 轮 AC-13 回收核验 7/7 通过。

## v0.5.1 — 2026-10-28

策略生效语义与双执法面同裁决（TASK-006 / ADR-0011；修复 BUG-1）。

### 修复
- `trio-guard` 删除进程内终身策略缓存：`loadPolicy` 按 `mtimeMs` +
  `digest` 校验快照，变更即重读；新增 allow / deny 在下一个工具调用生效。
- 策略缺失 / 不可读 / 非法行整份不可解析一律 fail-closed；空策略（空文件 /
  纯注释）同样拒绝写入，文案明示原因。
- 拦截文案附 8 位策略 digest + `mtimeMs`；检测到判定后策略已变化时明示
  「按旧快照执法」。
- `pre-commit` 改为消费共享判定器 `bin/trio-policy-eval.mjs`（复用 guard 的
  `loadPolicy` / `decide` / `describeVerdict`），双执法面同裁决；判定器
  缺失或 bun 缺失时 fail-closed。
- `bin/init-agent.sh` / `bin/trio-install.sh` 部署并校验
  `bin/trio-policy-eval.mjs`。

### 测试
- `trio-guard` 74/0（含 QA A/B/C/C2/D/D2 六例回归）；`trio-policy` 140/0；
  `trio-align` 13/0；`trio-check-report` 47/0；`trio-gate-contract` 12/0；
  `trio-pre-push` 21/0；`trio-reply-conventions` 28/0。
- `bin/trio-selftest.sh --fast` 20/0。

## v0.5.0 — 2026-10-27

下游需求上下文回流机制（回流卡，TASK-005 / ADR-0010）。

### 新增
- `templates/backflow.template.md`：七段回流卡（背景 / 触发场景 /
  现状与版本 / 期望行为 / 约束 / 建议验收 AC 草案 / 附件指针），
  含绝对路径铁律、一卡一需求、自检清单；`init-agent.sh` 随
  `templates/*.md` 自动注入下游 `.omp/trio/templates/`。
- `README.md` §15「需求回流：下游 → 本仓」：触发、填卡、传递三步，
  自豁免与 feedback 双轨说明。
- ADR-0010：回流形态选型与 8 分支决策；TASK-005 spec v1。

### 修改
- `docs/RUNBOOK.md`：命令速查表 + 标题编号归位（4.5 / 子节），
  初始化 FAQ 指引细化。

### 测试
- AC-1 init 注入冒烟：目标 `.omp/trio/templates/backflow.template.md`
  与源逐字节相等；init 完成 23 项。
- `trio-gate-contract` 12/0；`bin/trio-selftest.sh --fast` 20/0；
  `trio-align.sh --check .` → `aligned`。

## v0.4.1 — 2026-10-27

验收链归档与回归补强（TASK-002 / TASK-003 / TASK-004 归档）。

### 新增
- `tests/trio-gate-contract.test.mjs` B-4 回归：脚手架根自复制 `init-agent`
  （普通 + `--force`）exit 0，policy / guard / pre-push 三执行件逐字节不变。
- TASK-004 AC-9「两树两证」口径（干净树 `--check`；初始化工作树 selftest），
  spec v4 + `arch-20261027-1151-verdict-2.md`。

### 修改
- TASK-002 AC-12 由 SKIP 回填为通过：签字后回收三件套核验成立。
- TASK-001 / TASK-002 / TASK-003 看板归档回收；TASK-001 `user_signed`
  时点补记为 2026-10-26 09:30。

### 测试
- `trio-gate-contract` 12/0；`bin/trio-selftest.sh --fast` 20/0；
  `trio-align.sh --check .` → `aligned`。

## v0.4.0 — 2026-10-27

下游项目对齐工具 `trio-align` 与 U1 升级分类覆盖（TASK-004，
ADR-0006 / ADR-0007 / ADR-0008 / ADR-0009）。

### 新增
- `bin/trio-align.sh`：`--check` / 默认 dry-run / `--apply` / `--map`，
  纯 bash ≥4；固定别名表与 policy 逐字节比对（TASK-004 AC-1~AC-5）。
- `tests/trio-align.test.mjs`：AC-1~AC-6 与边界回归，13 项。
- `README.md` §14「下游适配」：三命令、`--map`、逃生舱 policy 标注、
  四条验收链。

### 修改
- `bin/init-agent.sh` U1：`.omp/hooks/**`、`bin/**`、`templates/**`
  执行件升级覆盖；`policy.txt` 有 diff 时打印并保留本地版本。
- `trio-align.sh` 不随下游部署（V-2）：init-agent 部署清单移除该脚本。
- ADR-0009：`templates/*.template.md` 文档模板放权 ARCH；门禁执行件
  `templates/pre-commit`、`templates/pre-push` 保持全角色拒绝。

### 修复
- 清理 selftest probe 夹具残留：`docs/task/TRIO-SELFTEST/` 报告与
  `src/trio_probe.py` 移出 HEAD，新增 `src/__init__.py` tracked 占位
  （B-3；`223c218` + `b0f7689`）。

### 测试
- 7 套件 328 项 0 失败；`bin/trio-selftest.sh --fast` 20/0；
  干净 HEAD `trio-align.sh --check` exit 0。

## v0.3.0 — 2026-10-26

三角色回复规范与任务接力机制（TASK-003，ADR-0004 / ADR-0005）。

### 新增
- `docs/REPLY-CONVENTIONS.md`：结论表、失败解释、路径规范、下一步任务分配块、
  挂起清单与修订流程的单一真值源。
- `bin/trio-check-report.mjs` T10：反引号内 `docs/`、`src/`、`tests/`、`bin/`
  路径存在性校验；围栏内跳过，支持 nodeid / 行号 / 尾随斜杠剥离。
- board 模板处置流程段（4 阶段链 + 迭代日志）与 §7 挂起清单；
  `templates/report.template.md` 增加 T10、SKIP 数据源、轮次约定。
- 任务目录命名 `TASK-<NNN>-<YYYY-MM-DD>-<slug>`；QA/DEV 轮次后缀约定。

### 修改
- `profiles/{arch,dev,test}.rules.md` 与 `.omp/trio/*.rules.md` 末尾追加
  `docs/REPLY-CONVENTIONS.md` 指针块；三对逐字节相等。
- 回收 TASK-002 / TASK-003 临时写通道，恢复 `deny * .omp/hooks/**`、
  `deny * bin/**` 的 fail-closed 语义。

### 测试
- 新增 `tests/trio-reply-conventions.test.mjs`；扩展
  `tests/trio-check-report.test.mjs` T10 段；同步目录改名后的契约路径。
- QA 全量回归 299 项断言 0 失败；`bin/trio-selftest.sh --fast` 19/0。

## v0.2.0 — 2026-10-26

发布门禁：push 与本机发布的三角色权限管控（TASK-001，ADR-0001）。

### 新增
- `templates/pre-push` 发布门禁 hook：qa/arch 拒推；dev 需 QA 报告全绿 +
  看板 `qa_passed`/`user_signed`（TASK-001 AC-1~AC-9）。
- `tests/trio-pre-push.test.mjs`：发布门禁行为测试 13 项。
- ADR-0001 发布权与 push 管控；`docs/RUNBOOK.md` §4.5 发布流程与角色矩阵。

### 修改
- `policy.txt`：`pyproject.toml`/`setup.cfg`/`setup.py`/`CHANGELOG.md`
  从公共维护区收窄为 dev 独占（发布链归 dev）。
- `profiles/*.rules.md`：三角色补发布禁令与放行前置纪律。
- `bin/init-agent.sh`：部署 pre-push hook。
- `tests/trio-policy.test.mjs`：发布链 4 条断言（CHANGELOG/pyproject/setup.*）。

### 已知缺口（v0.2.0 复盘，修复中）
- guard 只读命令误伤、自举任务无放行正道、放行证据未绑定推送对象等 6 项，
  见 `docs/task/TASK-002-2026-10-26-发布门禁复盘/`（BUG-001，裁决 V-1，契约 TASK-002 v1）。
