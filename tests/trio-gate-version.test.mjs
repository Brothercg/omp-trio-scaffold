/**
 * trio-gate-version.test.mjs —— BUG-2 三面同判矩阵（guard / pre-commit / pre-push）
 *
 * 对同一 policy 变体（=1.5 / 1abc / 双行两种顺序 / 缺行 / 合法 1），
 * 三个执法面必须给出相同放行/拒绝结论（ADR-0011 双执法面同裁决扩展至三面）。
 *
 * 运行：bun tests/trio-gate-version.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import registerGuard from "../.omp/hooks/pre/trio-guard.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PRECOMMIT = path.join(ROOT, "templates", "pre-commit");
const PREPUSH = path.join(ROOT, "templates", "pre-push");
const BASE = fs.readFileSync(path.join(ROOT, ".omp", "trio", "policy.txt"), "utf8")
	.split("\n")
	.filter((line) => !line.startsWith("# gate-version:"))
	.join("\n");

const VARIANTS = [
	{ name: "V3 =1.5", body: "# gate-version: 1.5\n", reject: true },
	{ name: "V4 =1abc", body: "# gate-version: 1abc\n", reject: true },
	{ name: "V5 双行 1 后 2", body: "# gate-version: 1\n# gate-version: 2\n", reject: true },
	{ name: "V6 双行 2 后 1", body: "# gate-version: 2\n# gate-version: 1\n", reject: true },
	{ name: "V1 缺行", body: "", reject: true },
	{ name: "V0 合法 1", body: "# gate-version: 1\n", reject: false },
];

let passed = 0;
const failures = [];

async function check(label, fn) {
	try {
		await fn();
		passed += 1;
		console.log(`  ✓ ${label}`);
	} catch (error) {
		failures.push({ label, error });
		console.log(`  ✗ ${label}`);
		console.log(`      ${error.message.split("\n")[0]}`);
	}
}

function policyFor(variant) {
	return `${BASE.trimEnd()}\n${variant.body}`;
}

// ── 面 1：guard ────────────────────────────────────────────────────────────

async function guardVerdict(variant) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-gv-guard-"));
	try {
		fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
		fs.mkdirSync(path.join(dir, "src"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), policyFor(variant));
		let handler = null;
		registerGuard({ on: (e, fn) => (handler = fn) });
		process.env.TRIO_ROLE = "dev";
		const result = await handler(
			{ toolName: "write", input: { path: "src/a.py", content: "x" } },
			{ cwd: dir },
		);
		return { blocked: result?.block === true, reason: result?.reason ?? "" };
	} finally {
		delete process.env.TRIO_ROLE;
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

// ── 面 2/3：pre-commit / pre-push（真实 git 仓库 + 真实 hook 脚本）────────

function makeRepo(variant) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-gv-repo-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
	fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), policyFor(variant));
	fs.mkdirSync(path.join(dir, "src"), { recursive: true });
	fs.writeFileSync(path.join(dir, "src", "a.py"), "x\n");
	fs.mkdirSync(path.join(dir, "docs", "task", "T"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "docs", "task", "T", "board.md"),
		"# 看板\n\n## 2. 状态\n\n| 字段 | 值 |\n|---|---|\n| 当前状态 | `implementing` |\n| release_gate | `exempt(bootstrap-fix)` |\n\n## 5. 决策记录\n\n| 时间 | 议题 | 裁决 | 落点 |\n|---|---|---|---|\n| `05:00` | 写通道 | 成立 | `V-1` |\n",
	);
	execFileSync("git", ["add", "src/a.py"], { cwd: dir });
	execFileSync("git", ["commit", "-q", "-m", "c1"], { cwd: dir });
	return dir;
}

function runShell(script, repo, role, input) {
	try {
		const out = execFileSync("bash", [script], {
			cwd: repo,
			env: { ...process.env, TRIO_ROLE: role },
			input,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { code: 0, stdout: String(out), stderr: "" };
	} catch (error) {
		return {
			code: error.status ?? 1,
			stdout: String(error.stdout ?? ""),
			stderr: String(error.stderr ?? ""),
		};
	}
}

function precommitVerdict(variant) {
	const repo = makeRepo(variant);
	try {
		fs.writeFileSync(path.join(repo, "src", "a.py"), "y\n");
		execFileSync("git", ["add", "src/a.py"], { cwd: repo });
		const r = runShell(PRECOMMIT, repo, "dev");
		return { blocked: r.code !== 0, output: r.stderr || r.stdout };
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function prepushVerdict(variant) {
	const repo = makeRepo(variant);
	try {
		const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
		const stdin = `refs/heads/main ${sha} refs/heads/main ${"0".repeat(40)}\n`;
		const r = runShell(PREPUSH, repo, "dev", stdin);
		return { blocked: r.code !== 0, output: r.stderr || r.stdout };
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

// ── 矩阵 ───────────────────────────────────────────────────────────────────

console.log("\n[BUG-2 三面同判矩阵]");

for (const variant of VARIANTS) {
	await check(`${variant.name}：guard / pre-commit / pre-push 结论一致（${variant.reject ? "全拒" : "全放"}）`, async () => {
		const guard = await guardVerdict(variant);
		const precommit = precommitVerdict(variant);
		const prepush = prepushVerdict(variant);
		assert.equal(guard.blocked, variant.reject, `guard 偏差：${guard.reason}`);
		assert.equal(precommit.blocked, variant.reject, `pre-commit 偏差：${precommit.output}`);
		assert.equal(prepush.blocked, variant.reject, `pre-push 偏差：${prepush.output}`);
		if (variant.reject) {
			assert.match(guard.reason, /执法件版本漂移/u);
			assert.match(precommit.output, /执法件版本漂移/u);
			assert.match(prepush.output, /执法件版本漂移/u);
		}
	});
}

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`FAIL: ${label}\n  ${error.message}`);
	}
	process.exit(1);
}
