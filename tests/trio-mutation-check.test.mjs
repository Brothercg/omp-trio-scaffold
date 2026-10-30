/**
 * @trio-suite scaffold-only —— 仅上游脚手架仓适用；安装仓由 selftest 跳过。
 * trio-mutation-check.test.mjs —— TASK-007 AC-12 mutation 质量门回归
 *
 * 在临时 git 仓库造两提交 diff，真实调用 bin/trio-mutation-check.mjs：
 *   - 测试杀死全部变异 → 0；
 *   - 测试对变异不敏感 → 1 + 存活清单（文件:行）；
 *   - 空 diff / 测试命令不存在 → 2 + 原因。
 * 同时断言工具跑完后源文件被还原（不在工作树留变异）。
 *
 * 运行：bun tests/trio-mutation-check.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TOOL = path.join(ROOT, "bin", "trio-mutation-check.mjs");

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
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-mutation-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "calc.mjs"), "export const inc = (n) => n + 0;\n");
	execFileSync("git", ["add", "calc.mjs"], { cwd: dir });
	execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "calc.mjs"), "export const inc = (n) => n + 1;\n");
	execFileSync("git", ["add", "calc.mjs"], { cwd: dir });
	execFileSync("git", ["commit", "-q", "-m", "change"], { cwd: dir });
	return dir;
}

function run(repo, ...args) {
	const result = spawnSync("bun", [TOOL, ...args], { cwd: repo, encoding: "utf8" });
	return {
		code: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

console.log("\n[AC-12 mutation 质量门]");

check("测试杀死全部变异 → 退出码 0，且源文件还原", () => {
	const repo = makeRepo();
	try {
		fs.writeFileSync(
			path.join(repo, "killer.mjs"),
			'import { inc } from "./calc.mjs";\nif (inc(3) !== 4) { console.error("killed"); process.exit(1); }\n',
		);
		const before = fs.readFileSync(path.join(repo, "calc.mjs"), "utf8");
		const result = run(repo, "HEAD~1..HEAD", "--", "bun", "killer.mjs");
		assert.equal(result.code, 0, `应全杀：${result.stderr}`);
		assert.match(result.stdout, /全部杀死/u);
		assert.equal(fs.readFileSync(path.join(repo, "calc.mjs"), "utf8"), before, "变异未被还原");
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

check("测试对变异不敏感 → 退出码 1 + 存活清单含 文件:行", () => {
	const repo = makeRepo();
	try {
		fs.writeFileSync(path.join(repo, "always.mjs"), "process.exit(0);\n");
		const result = run(repo, "HEAD~1..HEAD", "--", "bun", "always.mjs");
		assert.equal(result.code, 1, `存活变异应退出 1：${result.stderr}`);
		assert.match(result.stderr, /存活变异/u);
		assert.match(result.stderr, /calc\.mjs:[0-9]+:/u);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

check("空 diff → 退出码 2 + 明示空 diff（不静默计为通过）", () => {
	const repo = makeRepo();
	try {
		const result = run(repo, "HEAD..HEAD", "--", "bun", "always.mjs");
		assert.equal(result.code, 2, result.stderr);
		assert.match(result.stderr, /空 diff/u);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

check("测试命令不存在 → 退出码 2 + 明示原因", () => {
	const repo = makeRepo();
	try {
		fs.writeFileSync(path.join(repo, "always.mjs"), "process.exit(0);\n");
		const result = run(repo, "HEAD~1..HEAD", "--", "definitely-not-a-command-xyz");
		assert.equal(result.code, 2, result.stderr);
		assert.match(result.stderr, /测试命令不存在/u);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

check("缺 -- 分隔符 → 退出码 2（用法错误）", () => {
	const repo = makeRepo();
	try {
		const result = run(repo, "HEAD~1..HEAD", "bun", "always.mjs");
		assert.equal(result.code, 2, result.stderr);
		assert.match(result.stderr, /-- 分隔符|用法/u);
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
