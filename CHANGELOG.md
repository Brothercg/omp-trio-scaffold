# CHANGELOG

<!--
真值源说明（ADR-0002）：本文件是变更记录的唯一真值源；
版本号以 git tag 为准，README 中的版本描述不作数。
格式：每版本一节，条目按「新增 / 修改 / 修复 / 弃用」分组，注明关联任务或 ADR。
-->

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
  见 `docs/task/2026-10-26-发布门禁复盘/`（BUG-001，裁决 V-1，契约 TASK-002 v1）。
