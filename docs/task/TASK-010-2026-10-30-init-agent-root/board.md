# 任务看板：init-agent 根自定位（下游反馈 ⑫）

## 1. 标识

| 字段 | 值 |
|---|---|
| Task ID | `TASK-010` |
| 任务目录 | `docs/task/TASK-010-2026-10-30-init-agent-root/` |
| 工作树 / 分支 | 主工作树 / `main` |
| 起始日期 | `2026-10-30` |
| qa_report | `—` |
| release_gate | `exempt(maintenance)` |

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | `user_signed` |
| 最后推进人 | `ARCH` |
| 最后更新 | `2026-10-30 18:16` |

> 下游 `factor_synthesis` 反馈 ⑫：`init-agent.sh` 落 `tooling/bin/` 后把源目录算成
> `tooling/`，`--dry-run` 报「缺少 templates/pre-commit」。用户直派维护补丁：
> 只改根解析 + 补一条回归，不动 `--layout` / `--dry-run` 语义。

## 3. 验收准则

| AC | 契约 | 实现 | 验证 | 状态 |
|---|---|---|---|---|
| AC-1 | `init-agent.sh` 复用 `trio-align.sh` 的 `resolve_root`：`SELF_DIR/..` → `../..`，取含 `.omp/trio/policy.txt` 的物理根；找不到报错 exit 1 | `[OK]` | `[OK]` | 通过 |
| AC-2 | 脚本置于 `<root>/tooling/bin/` 时，`--dry-run` 不报「缺少 templates/pre-commit」 | `[OK]` | `[OK]` | 通过 |
| AC-3 | 增加上述场景的回归用例，不改既有 `--layout` / `--dry-run` 断言 | `[OK]` | `[OK]` | 通过 |
| AC-4 | 发布 `v0.9.1`（patch），tag + push | `[OK]` | `[OK]` | 通过 |

## 4. 决策记录

- `V-12`：接受下游 `factor_synthesis` 反馈 ⑫，按维护补丁处理。
  `release_gate=exempt(maintenance)`：单函数根解析修复，不新建 QA 报告；
  验证由 `tests/trio-init-layout.test.mjs` 的新增回归 + 全量套件直接承载。
- 边界：不修改 `--layout` / `--dry-run` 语义，不改下游仓，不迁移既有布局。
- 版本选择 `v0.9.1`（patch），不升 `v0.10.0`。

## 5. 证据

- 旧版复现：`HEAD` 的 `init-agent.sh` 复制到 `<root>/tooling/bin/` 后
  `--dry-run` exit 1，stderr「脚手架不完整，缺少 templates/pre-commit（源目录：…/tooling）」。
- 新版：同一夹具 exit 0，stdout「布局：bin（auto）」「干跑：将新建 15 项…」。
- 全量：11 个套件 440 项通过 / 0 失败；`trio-selftest.sh` 28 项通过 / 0 失败。

## 6. 发布记录

- `2026-10-30 18:09`：DEV 发布 `v0.9.1` —— `main 0cb7565..b3a7b85`；
  release commit `b3a7b85`；tag `v0.9.1` object `bfa137f`（peeled `b3a7b85`）；
  pre-push 走 `release_gate=exempt(maintenance)` + `V-12`，审计无 bypass。
