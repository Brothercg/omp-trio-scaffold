/**
 * trio-pre-push.test.mjs —— 发布门禁 pre-push hook 的行为测试（不调用 LLM）
 *
 * 测试对象：templates/pre-push（bash 脚本），以子进程方式在临时 git 仓库中
 * 真实执行，断言退出码与关键 stderr 文案。覆盖 ADR-0001 / TASK-001
 * spec 的 AC-1 ~ AC-9 行为子集：
 *
 *   AC-1/2/3   qa / arch / pm(=arch) 拒绝 push
 *   AC-4       dev 无 QA 报告被拒
 *   AC-5       dev 报告不合规被拒
 *   AC-6       dev 报告全绿但看板未过 qa_passed 被拒
 *   AC-7       dev QA 全绿 + qa_passed / user_signed 放行
 *   AC-8       无 TRIO_ROLE 放行 + 非法角色拒绝
 *   AC-9       SKIP 毒报告被拒（hook 经校验器）
 *
 * 运行：bun tests/trio-pre-push.test.mjs
 *
 * TASK-002 v2 契约（arch-20261026-0536-spec.md AC-4/5/6）取代 TASK-001 AC-7：
 *   放行路径 A = board.qa_report → 本任务目录报告 → 校验器 → 报告基线 commit
 *                是待推 local_sha 的祖先 → 看板 qa_passed/user_signed
 *   放行路径 B = release_gate: exempt(<reason>) + 决策记录裁决引用 → 审计行
 *   全零 sha 跳过 merge-base；qa_report 跨任务目录拒绝；报告基线非法拒绝。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { payload, toolPath } from "./_layout.mjs";

// R3：tooling 布局优先安装面 hook；上游 / bin 布局回退模板源区。
const HOOK = payload("tooling/hooks/pre-push", "templates/pre-push", ".git/hooks/pre-push");
const VALIDATOR = toolPath("trio-check-report.mjs");
assert.ok(HOOK && VALIDATOR, "未找到 pre-push / trio-check-report.mjs");

// ── 断言框架 ───────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(label, fn) {
	try {
		fn();
		passed += 1;
		console.log(`  ✓ ${label}`);
	} catch (error) {
		failures.push({ label, error });
		console.log(`  ✗ ${label}`);
		console.log(`      ${error.message.split("\n")[0]}`);
	}
}

// ── 夹具：临时 git 仓库（复用本仓库的门禁真值源）──────────────────────────

function makeFakeRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-pre-push-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "f.txt"), "hi\n");
	execFileSync("git", ["add", "f.txt"], { cwd: dir });
	// 校验器随仓库走：dev 分支的放行前置 a 需要真实跑报告校验。
	// 源 hook 引用 bin/，渲染后 hook 引用 tooling/bin/，两处都放。
	for (const dirRel of ["bin", "tooling/bin"]) {
		fs.mkdirSync(path.join(dir, dirRel), { recursive: true });
		fs.copyFileSync(VALIDATOR, path.join(dir, dirRel, "trio-check-report.mjs"));
	}
	// TASK-007 AC-5：执法件版本自证依赖 policy 的 gate-version 声明。
	fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), "# gate-version: 1\n");
	return dir;
}

/** 在 fixture 内以指定角色运行 pre-push hook，返回 {code, stderr}。 */
function runHook(repo, role) {
	let code, stdout, stderr;
	try {
		const out = execFileSync("bash", [HOOK], {
			cwd: repo,
			env: { ...process.env, ...(role === undefined ? {} : { TRIO_ROLE: role }) },
			stdio: ["ignore", "pipe", "pipe"],
		});
		code = 0;
		stdout = String(out);
		stderr = "";
	} catch (error) {
		code = error.status ?? 1;
		stdout = String(error.stdout ?? "");
		stderr = String(error.stderr ?? "");
	}
	return { code, stdout, stderr };
}

// ── fixture 内容 ───────────────────────────────────────────────────────────

const GOOD_REPORT = `# 验收报告：测试

| 字段 | 值 |
|---|---|
| Task ID | \`T-1\` |
| 基线 commit | \`abc123def456789012345678901234567890abcd\` |
| 运行环境 | bun 1.4.2 / Python 3.12.13 |
| 运行时间 | 2026-10-26 04:30 |

## 1. 结果

| 用例 | 位置 | 结论 | 说明 |
|---|---|---|---|
| AC-1 | — | 通过 | ok |

## AC → 用例覆盖矩阵

| AC | 用例编号 | 备注 |
|---|---|---|
| AC-1 | AC-1 | — |

## 2. 总判定汇总

总判定：通过。覆盖度：AC-1 全覆盖，无 SKIP。
`;

const TOXIC_REPORT = GOOD_REPORT.replace(
	"| AC-1 | — | 通过 | ok |",
	"| AC-1 | — | 通过 | ok |\n| AC-2 | — | SKIP | 跳过 |",
);

const BOARD = (state) => `# 任务看板：测试

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | \`${state}\` |
`;

function setReport(repo, content, stamp = "0430") {
	fs.mkdirSync(path.join(repo, "docs", "task", "x"), { recursive: true });
	fs.writeFileSync(
		path.join(repo, "docs", "task", "x", `qa-20261026-${stamp}-report-t.md`),
		content,
	);
}

function setBoard(repo, state) {
	fs.mkdirSync(path.join(repo, "docs", "task", "x"), { recursive: true });
	fs.writeFileSync(path.join(repo, "docs", "task", "x", "board.md"), BOARD(state));
}

// ── 用例 ───────────────────────────────────────────────────────────────────

console.log("\n[AC-1/2/3 禁发角色]");

for (const [role, label] of [
	["qa", "AC-1 qa 拒绝"],
	["arch", "AC-2 arch 拒绝"],
	["pm", "AC-3 pm 别名按 arch 拒绝"],
	["QA", "AC-2b 大写归一化拒绝"],
	["ARCH", "AC-2c 大写归一化拒绝"],
]) {
	check(label, () => {
		const { code, stderr } = runHook(makeFakeRepo(), role);
		assert.equal(code, 1);
		assert.match(stderr, /无发布权|禁止/u.test(stderr) ? /./ : /无发布权|禁止/u);
	});
}

console.log("\n[AC-8 逃生舱]");

check("AC-8 无 TRIO_ROLE 放行", () => {
	delete process.env.TRIO_ROLE;
	const { code } = runHook(makeFakeRepo(), undefined);
	assert.equal(code, 0);
});

check("AC-8b 非法角色拒绝", () => {
	const { code, stderr } = runHook(makeFakeRepo(), "hacker");
	assert.equal(code, 1);
	assert.match(stderr, /取值非法/u);
});

// ── AC-4 证据绑定（qa_report + merge-base 祖先）────────────────────────────
//
// 报告基线 commit 必须是待推 local_sha 的祖先：
//   - 真 repo 里造 B(基线) -- C(待推) 祖先链 → 放行
//   - B 与 L 兄弟（非祖先）→ 拒绝且 stderr 含 merge-base 与两 hash
//   - 全零 sha（删除 ref）→ 跳过 merge-base，其余前置照常
//   - qa_report 指向他任务目录 → 拒绝（归属校验）
//   - 报告基线缺失/非法 → 拒绝（不静默放行）
//   - 旧报告不能放行新提交：基线在 L 之上（rev 说明 L 不是其后代不同场景）
//     等价于「非祖先 → 拒绝」。

/** 在 fixture 里造提交；返回 hash。 */
function commit(repo, message) {
	fs.writeFileSync(path.join(repo, "f.txt"), `${message}\n`);
	execFileSync("git", ["add", "f.txt"], { cwd: repo });
	return execFileSync("git", ["commit", "-q", "-m", message, "--allow-empty"], { cwd: repo })
		.toString() || execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

function revParse(repo, ref) {
	return execFileSync("git", ["rev-parse", ref], { cwd: repo }).toString().trim();
}

function makeLineageRepo() {
	const repo = makeFakeRepo();
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "root"], { cwd: repo });
	return repo;
}

/** 让 fixture 的报告基线指向指定 commit。 */
function reportFor(repo, baselineSha) {
	return GOOD_REPORT.replace("abc123def456789012345678901234567890abcd", baselineSha);
}

/** 以 stdin 喂 local_sha 运行 hook（模拟真实 pre-push 调用形态）。 */
function runHookWithRefs(repo, role, ...localShas) {
	let code, stdout, stderr;
	const stdin = localShas.map((sha) => `refs/heads/main ${sha} refs/heads/main ${"0".repeat(40)}`).join("\n") + "\n";
	try {
		const out = execFileSync("bash", [HOOK], {
			cwd: repo,
			env: { ...process.env, TRIO_ROLE: role },
			input: stdin,
			stdio: ["pipe", "pipe", "pipe"],
		});
		code = 0;
		stdout = String(out);
		stderr = "";
	} catch (error) {
		code = error.status ?? 1;
		stdout = String(error.stdout ?? "");
		stderr = String(error.stderr ?? "");
	}
	return { code, stdout, stderr };
}

/** BOARD 加机器可读字段。 */
function boardWith(state, extra = {}) {
	const rows = Object.entries(extra)
		.map(([key, value]) => `| ${key} | \`${value}\` |`)
		.join("\n");
	return `# 任务看板：测试

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | \`${state}\` |
| 起始日期 | \`2026-10-26\` |
${rows}
`;
}

function setBoard(repo, content) {
	fs.mkdirSync(path.join(repo, "docs", "task", "x"), { recursive: true });
	fs.writeFileSync(path.join(repo, "docs", "task", "x", "board.md"), content);
}

console.log("\n[AC-4 证据绑定：qa_report 归属 + merge-base 祖先]");

check("AC-4a 报告基线 B == 待推 L → 放行", () => {
	const repo = makeLineageRepo();
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, localSha));
	const { code, stdout } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 0);
	assert.match(stdout, /基线 == 待推/u);
});

check("AC-4a2 B != L 但 B..L delta 仅文档路径 → 免复测放行", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	fs.mkdirSync(path.join(repo, "docs", "task", "x"), { recursive: true });
	fs.writeFileSync(path.join(repo, "docs", "task", "x", "note.md"), "doc\n");
	execFileSync("git", ["add", "docs/task/x/note.md"], { cwd: repo });
	execFileSync("git", ["commit", "-q", "-m", "docs only"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, b));
	const { code, stdout } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 0);
	assert.match(stdout, /免复测放行/u);
});

check("AC-4b 基线 B != 待推 L 且 delta 含代码路径 → 拒绝且明示两 hash", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	// 在 orphan 分支上造一个与 B 无关的待推提交（必然非后代）
	execFileSync("git", ["checkout", "-q", "--orphan", "sibling"], { cwd: repo });
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "sibling-work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, b));
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /基线 .*≠ 待推/u);
	assert.match(stderr, /代码路径|需 QA 重跑|无法计算 delta/u);
	assert.ok(stderr.includes(b), `stderr 应含基线 hash ${b}`);
	assert.ok(stderr.includes(localSha), `stderr 应含待推 hash ${localSha}`);
});

check("AC-4c 全零 sha（删除 ref 等价）跳过 merge-base，其余前置照常判定", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, b));
	const { code, stdout } = runHookWithRefs(repo, "dev", "0".repeat(40));
	assert.equal(code, 0);
	assert.match(stdout, /放行/u);
});

check("AC-4c 看板未达标时全零 sha 并不放行", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	setBoard(repo, boardWith("testing", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, b));
	const { code, stderr } = runHookWithRefs(repo, "dev", "0".repeat(40));
	assert.equal(code, 1);
	assert.match(stderr, /qa_passed|user_signed/u);
});

check("AC-4d qa_report 指向他任务目录 → 拒绝（归属校验）", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	// 报告实际放在别的任务目录
	fs.mkdirSync(path.join(repo, "docs", "task", "other"), { recursive: true });
	fs.writeFileSync(
		path.join(repo, "docs", "task", "other", "qa-20261026-0430-report-t.md"),
		reportFor(repo, b),
	);
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/other/qa-20261026-0430-report-t.md" }));
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /qa_report|本任务目录/u);
});

check("AC-4e 报告基线 commit 缺失 → 拒绝（不静默放行）", () => {
	const repo = makeLineageRepo();
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, GOOD_REPORT.replace("| 基线 commit | `abc123def456789012345678901234567890abcd` |\n", ""));
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /基线/u);
});

check("AC-4f 报告不合格（SKIP 毒报告）→ 拒绝", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, TOXIC_REPORT.replace("abc123def456789012345678901234567890abcd", b));
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /未全绿/u);
});

check("AC-4g 缺 qa_report 字段 → 拒绝（stderr 含 qa_report）", () => {
	const repo = makeLineageRepo();
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("qa_passed"));
	setReport(repo, GOOD_REPORT);
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /qa_report/u);
});

check("AC-4h 看板状态 testing（未达 qa_passed）→ 拒绝", () => {
	const repo = makeLineageRepo();
	const b = revParse(repo, "HEAD");
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("testing", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, b));
	const { code, stderr } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 1);
	assert.match(stderr, /testing|qa_passed/u);
});

check("AC-4i 基线 == 待推 + 看板 user_signed → 放行", () => {
	const repo = makeLineageRepo();
	execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "work"], { cwd: repo });
	const localSha = revParse(repo, "HEAD");
	setBoard(repo, boardWith("user_signed", { qa_report: "docs/task/x/qa-20261026-0430-report-t.md" }));
	setReport(repo, reportFor(repo, localSha));
	const { code } = runHookWithRefs(repo, "dev", localSha);
	assert.equal(code, 0);
});

// ── AC-5/6 自举豁免（release_gate=exempt）──────────────────────────────────

const BOARD_EXEMPT = (reason, decisions) => `# 任务看板：自举

## 2. 状态

| 字段 | 值 |
|---|---|
| 当前状态 | \`implementing\` |
| release_gate | \`exempt(${reason})\` |

## 5. 决策记录

| 时间 | 议题 | 裁决 | 落点 |
|---|---|---|---|
${decisions}
`;

console.log("\n[AC-5 自举豁免放行 / AC-6 豁免边界]");

check("AC-5 exempt(bootstrap-fix) + 决策记录含 V-1 → 放行且 stdout 含审计行", () => {
	const repo = makeFakeRepo();
	setBoard(repo, BOARD_EXEMPT("bootstrap-fix", "| `05:00` | 写通道 | 成立 | `arch-20261026-0536-verdict-1.md` |"));
	const { code, stdout } = runHookWithRefs(repo, "dev");
	assert.equal(code, 0);
	assert.match(stdout, /release_gate=exempt\(bootstrap-fix\)/u);
});

check("AC-6a exempt() 空 reason → 拒绝", () => {
	const repo = makeFakeRepo();
	setBoard(repo, BOARD_EXEMPT("", "| `05:00` | 写通道 | 成立 | `V-1` |"));
	const { code, stderr } = runHookWithRefs(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /release_gate|格式非法/u);
});

check("AC-6b reason 含空格（非法字符）→ 拒绝", () => {
	const repo = makeFakeRepo();
	setBoard(repo, boardWith("qa_passed"));
	// boardWith 不支持含空格值，这里直接写文件
	fs.writeFileSync(path.join(repo, "docs", "task", "x", "board.md"),
		`# 任务看板\n\n## 2. 状态\n\n| 字段 | 值 |\n|---|---|\n| 当前状态 | \`qa_passed\` |\n| release_gate | \`exempt(a b)\` |\n\n## 5. 决策记录\n\n| 时间 | 议题 | 裁决 | 落点 |\n|---|---|---|---|\n| \`05:00\` | 写通道 | 成立 | \`V-1\` |\n`);
	const { code, stderr } = runHookWithRefs(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /格式非法/u);
});

check("AC-6c exempt 有 reason 但决策记录无裁决引用 → 拒绝", () => {
	const repo = makeFakeRepo();
	setBoard(repo, BOARD_EXEMPT("bootstrap-fix", "| `05:00` | 写通道 | 先斩后奏 | `docs/task/x/board.md` |"));
	const { code, stderr } = runHookWithRefs(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /决策记录/u);
});

console.log("\n[TASK-007 AC-5 执法件版本自证 / AC-7 绕过审计输出]");

check("AC-5 policy 声明 gate-version: 2 ≠ EXPECTED=1 → 拒绝并明示版本漂移", () => {
	const repo = makeFakeRepo();
	fs.writeFileSync(path.join(repo, ".omp", "trio", "policy.txt"), "# gate-version: 2\n");
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /执法件版本漂移/u);
});

check("AC-5 gate-version 缺失 → 拒绝并明示漂移", () => {
	const repo = makeFakeRepo();
	fs.writeFileSync(path.join(repo, ".omp", "trio", "policy.txt"), "allow dev src/**\n");
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /gate-version 声明缺失|执法件版本漂移/u);
});

check("AC-7 放行前输出 .git/trio-audit.log 的 bypass 行", () => {
	const repo = makeFakeRepo();
	setBoard(repo, BOARD_EXEMPT("bootstrap-fix", "| `05:00` | 写通道 | 成立 | `V-1` |"));
	fs.writeFileSync(
		path.join(repo, ".git", "trio-audit.log"),
		"2026-10-29T03:00:00Z deadbeef bypass(no-marker)\n",
	);
	const { code, stdout } = runHookWithRefs(repo, "dev");
	assert.equal(code, 0);
	assert.match(stdout, /审计 bypass：.*deadbeef bypass\(no-marker\)/u);
});

check("AC-7 audit.log 不存在 → 视为无 bypass，不报错", () => {
	const repo = makeFakeRepo();
	setBoard(repo, BOARD_EXEMPT("bootstrap-fix", "| `05:00` | 写通道 | 成立 | `V-1` |"));
	const { code, stdout } = runHookWithRefs(repo, "dev");
	assert.equal(code, 0);
	assert.match(stdout, /审计：无 bypass 记录/u);
});

// ── 汇总 ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`FAIL: ${label}\n  ${error.message}`);
	}
	process.exit(1);
}
