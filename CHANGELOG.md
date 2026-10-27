# CHANGELOG

<!--
真值源说明（ADR-0002）：本文件是变更记录的唯一真值源；
版本号以 git tag 为准，README 中的版本描述不作数。
格式：每版本一节，条目按「新增 / 修改 / 修复 / 弃用」分组，注明关联任务或 ADR。
-->

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
