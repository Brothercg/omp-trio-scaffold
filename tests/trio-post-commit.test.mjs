/**
 * trio-post-commit.test.mjs —— TASK-007 AC-7 逃生舱绕过审计回归
 *
 * 真实安装 templates/pre-commit + templates/post-commit 到临时 git 仓库：
 *   - 正常提交（pre-commit 跑完写 marker）→ 审计 ok 行，无 bypass；
 *   - git commit --no-verify（跳过 pre-commit）→ 审计 bypass(no-marker) 行；
 *   - marker 在 post-commit 后被清除，不会跨提交误记 ok。
 *
 * 运行：bun tests/trio-post-commit.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PRECOMMIT = path.join(ROOT, "templates", "pre-commit");
const POSTCOMMIT = path.join(ROOT, "templates", "post-commit");

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

function makeRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-post-commit-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
	const hooks = path.join(dir, ".git", "hooks");
	fs.copyFileSync(PRECOMMIT, path.join(hooks, "pre-commit"));
	fs.copyFileSync(POSTCOMMIT, path.join(hooks, "post-commit"));
	fs.chmodSync(path.join(hooks, "pre-commit"), 0o755);
	fs.chmodSync(path.join(hooks, "post-commit"), 0o755);
	fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), "# gate-version: 1\n");
	return dir;
}

function commitFile(repo, content, extra = []) {
	fs.writeFileSync(path.join(repo, "f.txt"), content);
	execFileSync("git", ["add", "f.txt"], { cwd: repo });
	execFileSync("git", ["commit", "-q", "-m", content, ...extra], { cwd: repo });
	return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

function auditLines(repo) {
	const file = path.join(repo, ".git", "trio-audit.log");
	if (!fs.existsSync(file)) return [];
	return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
}

console.log("\n[AC-7 正常提交 → ok 行]");

check("pre-commit 写 marker，post-commit 追加 ok 行并清 marker", () => {
	const repo = makeRepo();
	try {
		const sha = commitFile(repo, "one\n");
		const lines = auditLines(repo);
		assert.equal(lines.length, 1, `审计行数异常：${JSON.stringify(lines)}`);
		assert.match(lines[0], new RegExp(`${sha} ok$`, "u"));
		assert.ok(!fs.existsSync(path.join(repo, ".git", "trio-last-gate-ok")), "marker 未被清除");
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

console.log("\n[AC-7 --no-verify 绕过 → bypass(no-marker)]");

check("git commit --no-verify → 审计 bypass(no-marker) 行（含 sha 与时间）", () => {
	const repo = makeRepo();
	try {
		// 先正常提交并清掉 marker，确保 bypass 判定不是 marker 残留
		commitFile(repo, "one\n");
		const sha = commitFile(repo, "two\n", ["--no-verify"]);
		const lines = auditLines(repo);
		assert.equal(lines.length, 2, `审计行数异常：${JSON.stringify(lines)}`);
		assert.match(lines[0], / ok$/u);
		assert.match(lines[1], new RegExp(`^\\S+ ${sha} bypass\\(no-marker\\)$`, "u"));
		assert.match(lines[1], /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/u, "审计行缺 ISO 时间");
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

check("未装 pre-commit 的仓库直接提交同样记 bypass（post-commit 独立生效）", () => {
	const repo = makeRepo();
	try {
		fs.rmSync(path.join(repo, ".git", "hooks", "pre-commit"));
		const sha = commitFile(repo, "one\n");
		const lines = auditLines(repo);
		assert.equal(lines.length, 1);
		assert.match(lines[0], new RegExp(`${sha} bypass\\(no-marker\\)$`, "u"));
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`FAIL: ${label}\n  ${error.message}`);
	}
	process.exit(1);
}
