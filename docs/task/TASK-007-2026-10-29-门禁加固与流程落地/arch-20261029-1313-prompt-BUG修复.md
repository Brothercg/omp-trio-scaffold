# TASK-007 BUG-1/2/3 修复执行提示词（无角色 omp 窗口执行）

<!--
落位：docs/task/TASK-007-2026-10-29-门禁加固与流程落地/arch-20261029-1313-prompt-BUG修复.md
用法：用户开一个不设置 TRIO_ROLE 的 omp 窗口，整段粘贴以下分隔线内内容。
依据：ADR-0014（执行模式）、qa-20261029-1243-bug-1.md（缺陷单）、
arch-20261029-1110-spec.md v2（AC-1/5/6 语义不变，本单只修实现；v2 仅澄清 AC-4 白名单深度，verdict-1）。
-->

---

你在一个**无角色限制**的 omp 会话中执行 TRIO 机制仓 TASK-007 的缺陷修复：QA 对抗两轮发现的 BUG-1/2/3（全部 `[根因:实现]`）。本提示词自包含，逐步执行；缺陷单与 spec 是真值，遇冲突停在该步报告。

## 仓库与依据
- 工作目录：`/home/cg/projects/omp-trio-scaffold`（不在则先 `cd`）。
- 本窗口**不要设置** `TRIO_ROLE`（你的身份即根信任/用户授权）。
- 缺陷单（现象/期望/实际/复现/堆栈）：`docs/task/TASK-007-2026-10-29-门禁加固与流程落地/qa-20261029-1243-bug-1.md`
- 契约真值：同目录 `arch-20261029-1110-spec.md` v1 §5 AC-1/5/6（断言语义不变）；决策依据 `docs/architecture/ADR-0011`（双执法面同裁决）、`ADR-0012`。
- 证据：同目录 `qa-20261029-1256-report-门禁加固-第2轮.md`（两轮复测输出）。
- 看板：同目录 `board.md`。

## 铁律（违者即任务失败）
1. **禁止** `git push` / `git tag` / 发布（ADR-0001）。
2. commit **显式 pathspec**；禁 `git add -A` / `git add .`。
3. 只改 `.omp/hooks/pre/trio-guard.ts`、`templates/pre-commit`、`templates/pre-push`、`tests/**` 与本任务目录产物；`policy.txt` **零改动**（`# gate-version: 1` 保持原样）；不碰无关文件。
4. 自测/校验输出 **真实执行后粘贴**，禁止凭印象填写。
5. 修复只做缺陷单三件事，不顺手重构、不加新功能、不改 spec。

## 修复契约（判定标准，逐条可测）

### BUG-1 写目标抽取：`-t` / `--target-directory` 语义
对 `cp` / `mv` / `install` / `ln` / `rsync` 的位置参数按判下表定写目标；写目标进写规则矩阵（与 `write` 工具同语义，allow+deny 全矩阵）：

| 命令形态 | 写目标 | 其余位置参数 |
|---|---|---|
| `cp SRC... DEST`、`mv SRC... DEST`、`install SRC... DEST`、`ln [TGT...] DIR`、`ln -s TGT LINK`、`rsync SRC... DEST` | 末位置参数 | 为源，只做读侧校验 |
| `cp -t DIR SRC...`、`mv -t DIR SRC...`、`install -t DIR SRC...`、`ln -t DIR TGT...` | `DIR` | 全部为源 |
| `--target-directory=DIR` 与 `--target-directory DIR`（空格形态） | `DIR` | 与 `-t` 同义 |

- 带值选项（如 `install -o USER`、`cp --preserve=mode`）的**值不得计为位置参数**；`--` 之后一律按位置参数。
- `rsync` 的 `--delete` 不改变写方向（末位置参数恒为写目标）。
- 以下反例必须由 ALLOW 转 BLOCK：`cp -t src/ /tmp/f`、`cp --target-directory=src /tmp/f`、`install -t src f`、`ln -s -t src f`；`rsync --delete src/ src/x`（写目标落在 `src/` 时）。
- 不误伤：`cp /tmp/f src/x` 依旧按写目标 `src/x` 判（deny 命中即拒，白名单命中即放）。

### BUG-2 gate-version 解析：严格整型唯一行，三面同判
- `policy.txt` 必须**恰好一行**匹配 `^# gate-version: <十进制整数>$`：值仅数字（无 `+`/`-`/小数点/空白/尾随字符）。
- 缺行、多行、任一行不合法（`=1.5`、`1abc` 等）→ **fail-closed**：判定拒绝，原因文案明示（「gate-version 声明缺失 / 重复 / 非法」之类）。
- **三面同判**（ADR-0011）：guard `checkGateVersion`、`templates/pre-commit`、`templates/pre-push` 对同一 policy 必须给出相同放行/拒绝结论；双行「1 后 2」「2 后 1」同判（重复即拒，与顺序无关）。
- 合法现状：唯一一行 `# gate-version: 1`（期望版本 = 1）→ 三面放行。

### BUG-3 TRIO_ROLE 非法值 fail-closed
- **未设置**（环境变量不存在）→ 无身份逃生舱不变：放行 + 每次写判定醒目提示「无身份运行，门禁未生效」（AC-6）。
- **设置了但值非法** → 全部写判定 BLOCK，原因明示 `TRIO_ROLE 非法：<原值>`。非法集包括：空串、`devs` 等未知词、带前后空白（`" dev"`、`"qa "`）。
- 合法集：`pm` / `arch` / `dev` / `qa`，大小写不敏感（`DEV` → `dev` 归一化，与 pre-commit 一致），**不做 trim**。
- pre-commit 既有「非法值即拒」行为不变；guard 与其同判（当前 guard 静默降级为无身份放行即缺陷本体）。

## 执行步骤

### 第 0 步：读缺陷单
通读 `qa-20261029-1243-bug-1.md` 与 spec AC-1/5/6，确认三 BUG 的期望/实际/复现与上表修复契约一致。

### 第 1 步：逐项修复
按 BUG-1（guard 写目标抽取）→ BUG-2（三面解析）→ BUG-3（`normalizeRole`）顺序修；每修一项先复跑该 BUG 的反例，确认转 BLOCK 再进下一项。

### 第 2 步：回归用例（`tests/**`）
三个 BUG 的反例直译为断言，至少覆盖：
- BUG-1：`-t` / `--target-directory=DIR` / `--target-directory DIR` 三形态、`--` 截断、带值选项不吞目标、`rsync --delete` 方向、正例不误伤（≥ 7 条）。
- BUG-2：`=1.5` / `1abc` / 双行（两种顺序）拒、缺行拒、合法 `1` 放、三面同判矩阵（≥ 6 条）。
- BUG-3：`devs` / `" dev"` / `""` / `"qa "` 四例拒、`DEV`/`pm` 归一化放行、未设置走逃生舱+提示（≥ 6 条）。
- BUG-4 夹具修复（`tests/trio-post-commit.test.mjs` 显式删 `TRIO_ROLE`）不回退。

### 第 3 步：真实验证（贴输出）
- 三组反例探针全部 BLOCK：QA 复现脚本在 `/tmp/qa7/probe-cpt.mjs`、`probe-lnt2.mjs`、`probe-gate.mjs`、`probe-role.mjs`、`gate-faces.sh`——在则直接复跑，不在则按缺陷单现象重建最小复现。
- 三面一致性实证：同一 policy 下对 V3(`=1.5`)/V4(`1abc`)/V5(双行) 三面全拒，对 `# gate-version: 1` 三面全放。
- 全量回归：`bun tests/*.test.mjs` 全绿（原 374 项 0 失败 + 新增）+ `bash bin/trio-selftest.sh` 全绿。

### 第 4 步：交付与看板
- 写 `docs/task/TASK-007-2026-10-29-门禁加固与流程落地/dev-<YYYYMMDD>-<HHMM>-release.md`（按 `templates/release.template.md`）：三 BUG 修复对照 / Files Changed / 第 3 步真实输出粘贴。
- 更新 `board.md`：AC-1/5/6 进度、处置流程、状态推 `testing`、挂起清单更新。
- `git commit` 显式 pathspec，分两批：① `fix(gate): …`（guard/pre-commit/pre-push/tests）② `docs(task-007): …`（release note + 看板）。

## 完成判定
- BUG-1/2/3 全部反例转 BLOCK 且合法路径不误伤；三面同判有实证输出。
- 全量回归 + selftest 全绿；release note 落档；board 状态 `testing`。
- **不 push**。完成后停止，等 QA 第 3 轮复测。

---
（提示词结束）
