/**
 * trio-align.test.mjs —— 下游对齐工具行为测试
 *
 * 覆盖 TASK-004 spec AC-1..AC-6：
 *   AC-1 --check 零差异 → exit 0 / 仅 aligned
 *   AC-2 --check 检出目录映射与 policy 差异 → exit 1；工作树不变
 *   AC-3 默认 dry-run 不落盘
 *   AC-4 --apply 迁移 + 引用清扫；随后 --check 0
 *   AC-5 核验报告边界：路径字符串外零改动
 *   AC-6 init-agent U1：执行件覆盖、policy diff 保留
 *
 * 运行：bun tests/trio-align.test.mjs
 * 纯本地临时 git 仓库，无网络/时钟依赖。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ALIGN = path.join(ROOT, "bin", "trio-align.sh");
const INIT = path.join(ROOT, "bin", "init-agent.sh");
const UPSTREAM_POLICY = path.join(ROOT, ".omp", "trio", "policy.txt");

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

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
	}
}

function git(repo, args) {
	const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`);
	}
	return result.stdout;
}

function makeRepo({ policyDiff = false, withLib = true, withSrc = false, taskName = "TASK-001-2026-10-27-demo" } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-align-"));
	git(dir, ["init", "-q"]);
	git(dir, ["config", "user.email", "t@t"]);
	git(dir, ["config", "user.name", "t"]);

	for (const d of ["docs/task", "docs/architecture", "tests"]) {
		fs.mkdirSync(path.join(dir, d), { recursive: true });
	}
	fs.mkdirSync(path.join(dir, "docs/task", taskName), { recursive: true });
	if (withSrc) fs.mkdirSync(path.join(dir, "src"), { recursive: true });
	if (withLib) {
		fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
		fs.writeFileSync(path.join(dir, "lib", "a.txt"), "use lib/a.txt\n");
		fs.writeFileSync(path.join(dir, "docs", "note.md"), "lib/a.txt\nkeep me\n");
	}
	fs.mkdirSync(path.join(dir, ".omp/trio"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, ".omp/trio/policy.txt"),
		policyDiff ? "allow dev src/**\n# local escape hatch\n" : fs.readFileSync(UPSTREAM_POLICY),
	);
	git(dir, ["add", "-A"]);
	git(dir, ["commit", "-q", "-m", "fixture"]);
	return dir;
}

function run(repo, args) {
	const result = spawnSync("bash", [ALIGN, ...args], { cwd: repo, encoding: "utf8" });
	return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function status(repo) {
	return git(repo, ["status", "--porcelain"]);
}

// ── AC-1 ───────────────────────────────────────────────────────────────────
check("AC-1 已对齐布局 + policy 相等 → exit 0，stdout 仅 aligned", () => {
	const repo = makeRepo({ withLib: false, withSrc: true });
	const r = run(repo, ["--check"]);
	assertEqual(r.code, 0, "exit code");
	assertEqual(r.stdout, "aligned\n", "stdout");
});

// ── AC-2 ───────────────────────────────────────────────────────────────────
check("AC-2 lib/ 无 src/ + policy 不同 → exit 1，列出映射与 policy，工作树不变", () => {
	const repo = makeRepo({ policyDiff: true, withLib: true, withSrc: false });
	const before = status(repo);
	const r = run(repo, ["--check"]);
	assertEqual(r.code, 1, "exit code");
	assert(r.stdout.includes("lib/") && r.stdout.includes("src/"), "缺少 lib/→src/ 映射行");
	assert(r.stdout.includes("policy"), "缺少 policy 差异行");
	assertEqual(status(repo), before, "git status 必须逐字节不变");
});

// ── AC-3 ───────────────────────────────────────────────────────────────────
check("AC-3 默认 dry-run 打印操作且 git status 前后一致", () => {
	const repo = makeRepo({ withLib: true, withSrc: false });
	const before = status(repo);
	const r = run(repo, []);
	assertEqual(r.code, 0, "exit code");
	assert(r.stdout.includes("lib/") && r.stdout.includes("src/"), "缺少 dry-run 操作清单");
	assertEqual(status(repo), before, "git status 必须逐字节不变");
});

// ── AC-4（verdict-1 V-1 口径：夹具 = 目录差异 + policy 逐字节相等）───────────
check("AC-4(V-1) --apply 迁移 lib→src、清扫引用，随后 --check 0 且幂等（policy 相等夹具）", () => {
	const repo = makeRepo({ withLib: true, withSrc: false, policyDiff: false });
	const policyBefore = fs.readFileSync(path.join(repo, ".omp/trio/policy.txt"));
	assert(!Buffer.compare(policyBefore, fs.readFileSync(UPSTREAM_POLICY)), "夹具前置：policy 应与上游逐字节相等");

	const r = run(repo, ["--apply"]);
	assertEqual(r.code, 0, "apply exit code");
	assert(fs.existsSync(path.join(repo, "src", "a.txt")), "src/a.txt 未生成");
	assert(!fs.existsSync(path.join(repo, "lib")), "lib/ 未消失");
	assertEqual(fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8"), "use src/a.txt\n", "源文件引用未清扫");
	assertEqual(fs.readFileSync(path.join(repo, "docs", "note.md"), "utf8"), "src/a.txt\nkeep me\n", "文档引用未清扫");
	assert(!Buffer.compare(fs.readFileSync(path.join(repo, ".omp/trio/policy.txt")), policyBefore), "--apply 不得写 policy.txt（V-1）");

	const c = run(repo, ["--check"]);
	assertEqual(c.code, 0, "apply 后 --check 应为 0");
	assertEqual(c.stdout, "aligned\n", "apply 后 stdout");

	const second = run(repo, ["--apply"]);
	assertEqual(second.code, 0, "第二次 apply exit code");
	assertEqual(second.stdout, "aligned\n", "第二次 apply 应零操作");
});

// ── AC-4 对抗（verdict-1 语义链另一侧）────────────────────────────────────
check("对抗：policy-diff 项目 --apply 后 --check 仍 exit 1，人工同步归零", () => {
	const repo = makeRepo({ withLib: true, withSrc: false, policyDiff: true });
	const r = run(repo, ["--apply"]);
	assertEqual(r.code, 0, "apply 本身 exit 0");
	assert(fs.existsSync(path.join(repo, "src", "a.txt")), "迁移应发生");
	assert(!Buffer.compare(fs.readFileSync(path.join(repo, ".omp/trio/policy.txt")), Buffer.from("allow dev src/**\n# local escape hatch\n")), "policy 必须保留逃生舱痕迹，不得被 --apply 改写");

	const c = run(repo, ["--check"]);
	assertEqual(c.code, 1, "policy diff 残留 → --check 应为 1（不被 --apply 消除）");
	assert(c.stdout.includes("policy"), "残留差异行应是 policy 行");

	// 人工同步（模拟逃生舱消除）后，验收链闭合
	fs.copyFileSync(UPSTREAM_POLICY, path.join(repo, ".omp/trio/policy.txt"));
	const c2 = run(repo, ["--check"]);
	assertEqual(c2.code, 0, "人工同步后 --check 应为 0");
	assertEqual(c2.stdout, "aligned\n", "人工同步后应为 aligned");
});

// ── AC-5（verdict-1 V-1 口径：含 policy.txt 零写入）────────────────────────
check("AC-5(V-1) 引用清扫之外无改动：非路径行 + policy.txt 零写入", () => {
	const repo = makeRepo({ withLib: true, withSrc: false });
	const policyBefore = Buffer.from(fs.readFileSync(path.join(repo, ".omp/trio/policy.txt")));
	run(repo, ["--apply"]);
	assertEqual(
		fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8"),
		"use src/a.txt\n",
		"文件内容只应替换路径字符串",
	);
	assertEqual(
		fs.readFileSync(path.join(repo, "docs", "note.md"), "utf8"),
		"src/a.txt\nkeep me\n",
		"非路径行 keep me 必须原样保留",
	);
	const diff = git(repo, ["diff", "HEAD", "--", "docs/note.md"]);
	assert(diff.includes("-lib/a.txt") && diff.includes("+src/a.txt"), "diff 应只含路径行");
	assert(diff.includes("keep me"), "diff 不应删除非路径行");
	assert(!Buffer.compare(fs.readFileSync(path.join(repo, ".omp/trio/policy.txt")), policyBefore), "policy.txt 不在 --apply 写入范围（V-1/ADR-0006 §3.4）");
	assertEqual(git(repo, ["diff", "HEAD", "--", ".omp/trio/policy.txt"]), "", "policy.txt 的 git diff 必须为空");
});

// ── 边界 ───────────────────────────────────────────────────────────────────
check("边界：--check --apply 同给 → exit 2", () => {
	const repo = makeRepo();
	const r = run(repo, ["--check", "--apply"]);
	assertEqual(r.code, 2, "exit code");
});

check("边界：--map from 不存在 → exit 2", () => {
	const repo = makeRepo();
	const r = run(repo, ["--check", "--map", "missing:src"]);
	assertEqual(r.code, 2, "exit code");
});

check("边界：--map to 已存在 → exit 2", () => {
	const repo = makeRepo({ withLib: true, withSrc: true });
	const r = run(repo, ["--check", "--map", "lib:src"]);
	assertEqual(r.code, 2, "exit code");
});

check("边界：非 git 仓库 → exit 2", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-align-nogit-"));
	const r = run(dir, ["--check"]);
	assertEqual(r.code, 2, "exit code");
});

check("边界：半迁移 lib/ 与 src/ 并存 → exit 1 且提示人工裁定", () => {
	const repo = makeRepo({ withLib: true, withSrc: true });
	const r = run(repo, ["--check"]);
	assertEqual(r.code, 1, "exit code");
	assert(r.stdout.includes("需人工裁定"), "缺少人工裁定提示");
});

check("边界：--map 覆盖固定别名", () => {
	const repo = makeRepo({ withLib: true, withSrc: false });
	const r = run(repo, ["--check", "--map", "lib:vendor"]);
	assertEqual(r.code, 1, "exit code");
	assert(r.stdout.includes("vendor/"), "缺少显式映射目标");
	assert(!r.stdout.includes("map | lib/ | src/"), "固定别名不应覆盖 --map");
});

// ── AC-6 ───────────────────────────────────────────────────────────────────
check("AC-6 init-agent U1：执行件覆盖，policy diff 保留且 exit 0", () => {
	const repo = makeRepo({ withLib: false, withSrc: true });
	const guard = path.join(repo, ".omp/hooks/pre/trio-guard.ts");
	fs.mkdirSync(path.dirname(guard), { recursive: true });
	fs.writeFileSync(guard, "// old guard\n");
	fs.mkdirSync(path.join(repo, "bin"), { recursive: true });
	fs.writeFileSync(path.join(repo, "bin/trio-check-report.mjs"), "// old checker\n");
	const localPolicy = "allow dev src/**\n# local escape hatch\n";
	fs.writeFileSync(path.join(repo, ".omp/trio/policy.txt"), localPolicy);

	const result = spawnSync("bash", [INIT, repo], { cwd: ROOT, encoding: "utf8" });
	assertEqual(result.status, 0, "init-agent exit code");
	assertEqual(fs.readFileSync(guard, "utf8"), fs.readFileSync(path.join(ROOT, ".omp/hooks/pre/trio-guard.ts"), "utf8"), "guard 未覆盖");
	assertEqual(fs.readFileSync(path.join(repo, "bin/trio-check-report.mjs"), "utf8"), fs.readFileSync(path.join(ROOT, "bin/trio-check-report.mjs"), "utf8"), "checker 未覆盖");
	assert(!fs.existsSync(path.join(repo, "bin/trio-align.sh")), "trio-align.sh 不得随下游部署（spec v3 §2 / V-2：只从脚手架仓调用）");
	assertEqual(fs.readFileSync(path.join(repo, ".omp/trio/policy.txt"), "utf8"), localPolicy, "policy 不得覆盖");
	assert(result.stdout.includes("保留"), "缺少 policy 保留提示");
	assert(result.stdout.includes("diff"), "缺少 policy diff 提示");
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
for (const failure of failures) {
	console.error(`\nFAIL: ${failure.label}\n${failure.error.stack ?? failure.error.message}`);
}
if (failures.length > 0) process.exitCode = 1;
