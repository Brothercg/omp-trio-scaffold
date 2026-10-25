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
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const HOOK = path.join(ROOT, "templates", "pre-push");
const VALIDATOR = path.join(ROOT, "bin", "trio-check-report.mjs");

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
	// 校验器随仓库走：dev 分支的放行前置 a 需要真实跑报告校验
	fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
	fs.copyFileSync(VALIDATOR, path.join(dir, "bin", "trio-check-report.mjs"));
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

console.log("\n[AC-4/5 dev 前置 a：报告]");

check("AC-4 无报告拒绝", () => {
	const repo = makeFakeRepo();
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /未找到任何 QA/u);
});

console.log("\n[AC-5 报告不合规 / AC-6 看板未达标 / AC-7 放行 / AC-9 毒报告]");

check("AC-5 报告不合规拒绝", () => {
	const repo = makeFakeRepo();
	setReport(repo, "not a valid report");
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /未全绿/u);
});

check("AC-6 报告全绿但看板 testing 拒绝", () => {
	const repo = makeFakeRepo();
	setReport(repo, GOOD_REPORT);
	setBoard(repo, "testing");
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /testing/u);
});

check("AC-7 QA 全绿 + qa_passed 放行", () => {
	const repo = makeFakeRepo();
	setReport(repo, GOOD_REPORT);
	setBoard(repo, "qa_passed");
	const { code, stdout } = runHook(repo, "dev");
	assert.equal(code, 0);
	assert.match(stdout, /qa_passed/u);
});

check("AC-7b QA 全绿 + user_signed 放行", () => {
	const repo = makeFakeRepo();
	setReport(repo, GOOD_REPORT);
	setBoard(repo, "user_signed");
	const { code } = runHook(repo, "dev");
	assert.equal(code, 0);
});

check("AC-9 SKIP 毒报告拒绝", () => {
	const repo = makeFakeRepo();
	setReport(repo, TOXIC_REPORT, "0500");
	setBoard(repo, "qa_passed");
	const { code, stderr } = runHook(repo, "dev");
	assert.equal(code, 1);
	assert.match(stderr, /未全绿/u);
});

// ── 汇总 ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`FAIL: ${label}\n  ${error.message}`);
	}
	process.exit(1);
}
