/**
 * trio-guard.test.mjs —— 门禁 hook 的运行时集成测试（不调用 LLM）
 *
 * 与 trio-policy.test.mjs 的分工：
 *   - policy 测试测纯函数 decide() / 路径提取
 *   - 本文件测 **hook 的 tool_call 处理器**：真实读取 policy.txt、真实解析
 *     ctx.cwd、真实分派 write/edit/ast_edit/bash/lsp/eval
 *
 * 这样「门禁是否生效」不再依赖 omp 模型可用性 —— 模型限流时仍可验证门禁。
 *
 * 运行：bun tests/trio-guard.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import registerGuard from "../.omp/hooks/pre/trio-guard.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const POLICY = fs.readFileSync(path.join(ROOT, ".omp", "trio", "policy.txt"), "utf8");

// ── 断言框架 ───────────────────────────────────────────────────────────────

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

// ── 夹具：临时项目 + 真实 hook 实例 ────────────────────────────────────────

function makeProject() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-guard-"));
	fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), POLICY);
	return dir;
}

function makeHook(projectRoot) {
	let handler = null;
	registerGuard({ on: (event, fn) => (handler = fn) });
	assert.ok(handler !== null, "hook 未注册 tool_call 处理器");
	return (toolName, input) => handler({ toolName, input }, { cwd: projectRoot });
}

const PROJECT = makeProject();
const call = makeHook(PROJECT);

/** 以指定角色调用 hook，返回 block 布尔值。 */
async function as(role, toolName, input) {
	const previous = process.env.TRIO_ROLE;
	if (role === null) delete process.env.TRIO_ROLE;
	else process.env.TRIO_ROLE = role;
	try {
		const result = await call(toolName, input);
		return result?.block === true;
	} finally {
		if (previous === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = previous;
	}
}

function expectBlock(label, role, toolName, input) {
	return check(label, async () => {
		assert.equal(await as(role, toolName, input), true, `${role} ${toolName} 应被拦截`);
	});
}

function expectAllow(label, role, toolName, input) {
	return check(label, async () => {
		assert.equal(await as(role, toolName, input), false, `${role} ${toolName} 应被放行`);
	});
}

const TASK = "docs/task/2026-10-25-login";

// ── 1. write 通道 ──────────────────────────────────────────────────────────

console.log("\n[write 通道]");

await expectAllow("DEV 写 src/ 放行", "dev", "write", { path: "src/a.py", content: "x" });
await expectBlock("DEV 写 tests/ 拦截", "dev", "write", { path: "tests/a.py", content: "x" });
await expectBlock("DEV 写 ARCH 契约拦截", "dev", "write", {
	path: `${TASK}/arch-20261025-0900-spec.md`,
	content: "x",
});
await expectAllow("ARCH 写自己契约放行", "arch", "write", {
	path: `${TASK}/arch-20261025-0900-spec.md`,
	content: "x",
});
await expectBlock("ARCH 写 src/ 拦截", "arch", "write", { path: "src/a.py", content: "x" });
await expectAllow("QA 写 tests/ 放行", "qa", "write", { path: "tests/a.py", content: "x" });
await expectBlock("QA 写 src/ 拦截", "qa", "write", { path: "src/a.py", content: "x" });
await expectAllow("三方均可写 board.md", "dev", "write", { path: `${TASK}/board.md`, content: "x" });
await expectBlock("DEV 写无前缀文件拦截", "dev", "write", { path: `${TASK}/notes.md`, content: "x" });
await expectBlock("DEV 写已废止的 docs/specs/ 拦截", "dev", "write", {
	path: "docs/specs/T.md",
	content: "x",
});

// ── 2. 无角色 / 非法角色 ───────────────────────────────────────────────────

console.log("\n[无角色 / 非法角色]");

await expectAllow("未设置 TRIO_ROLE 时不做拦截", null, "write", { path: "tests/a.py", content: "x" });
await expectAllow("非法角色不做拦截", "intern", "write", { path: "tests/a.py", content: "x" });
await expectAllow("TRIO_ROLE=pm 别名等价 arch", "pm", "write", {
	path: `${TASK}/arch-20261025-0900-spec.md`,
	content: "x",
});
await expectBlock("TRIO_ROLE=pm 仍受 tests/ 红线", "pm", "write", { path: "tests/a.py", content: "x" });

// ── 3. 绝对路径与项目外路径 ────────────────────────────────────────────────

console.log("\n[路径归一化]");

await check("项目内绝对路径按相对路径判定", async () => {
	assert.equal(
		await as("dev", "write", { path: path.join(PROJECT, "tests", "a.py"), content: "x" }),
		true,
		"项目内绝对路径写 tests/ 应被拦",
	);
});

await check("项目外绝对路径不受管辖", async () => {
	assert.equal(
		await as("dev", "write", { path: "/tmp/outside/a.py", content: "x" }),
		false,
		"项目外路径不应拦截",
	);
});

await check("路径穿越归一化后判定", async () => {
	// docs/task/x/../../src/a.py → src/a.py → dev 允许；改用 tests 验证拦截
	assert.equal(
		await as("dev", "write", { path: "docs/task/x/../../tests/a.py", content: "x" }),
		true,
		"穿越到 tests/ 应被拦",
	);
});

await check("xd:// 设备传输不受管辖", async () => {
	assert.equal(await as("dev", "write", { path: "xd://report_issue", content: "x" }), false);
});

// ── 4. edit 通道 ───────────────────────────────────────────────────────────

console.log("\n[edit 通道]");

await expectAllow("DEV edit src/ 放行", "dev", "edit", {
	path: "src/a.py",
	old_string: "a",
	new_string: "b",
});
await expectBlock("DEV edit tests/ 拦截", "dev", "edit", {
	path: "tests/a.py",
	old_string: "a",
	new_string: "b",
});

await check("DEV 用 apply_patch 改 tests/ 拦截", async () => {
	const input = {
		input: `*** Begin Patch\n*** Update File: tests/a.py\n@@\n-a\n+b\n*** End Patch`,
	};
	assert.equal(await as("dev", "edit", input), true, "apply_patch 写 tests/ 应被拦");
});

await check("DEV 用 apply_patch 改 src/ 放行", async () => {
	const input = {
		input: `*** Begin Patch\n*** Update File: src/a.py\n@@\n-a\n+b\n*** End Patch`,
	};
	assert.equal(await as("dev", "edit", input), false, "apply_patch 写 src/ 应放行");
});

// ── 5. ast_edit / lsp / eval ───────────────────────────────────────────────

console.log("\n[ast_edit / lsp / eval]");

await expectBlock("DEV ast_edit tests/ 拦截", "dev", "ast_edit", {
	paths: ["tests/a.py"],
	transform: "x",
});
await expectAllow("DEV ast_edit src/ 放行", "dev", "ast_edit", {
	paths: ["src/a.py"],
	transform: "x",
});
await expectBlock("DEV lsp rename tests/ 拦截", "dev", "lsp", {
	action: "rename",
	file: "tests/a.py",
	new_name: "b",
});
await expectAllow("DEV lsp hover tests/ 放行（只读）", "dev", "lsp", {
	action: "hover",
	file: "tests/a.py",
});
await expectBlock("DEV eval 写 tests/ 拦截", "dev", "eval", {
	code: `open('tests/a.py','w').write('x')`,
});
await expectAllow("DEV eval 写 src/ 放行", "dev", "eval", {
	code: `open('src/a.py','w').write('x')`,
});

// ── 6. bash 通道 ───────────────────────────────────────────────────────────

console.log("\n[bash 通道]");

await expectBlock("DEV bash 重定向写 tests/ 拦截", "dev", "bash", {
	command: "echo bad > tests/a.txt",
});
await expectBlock("DEV bash tee 写 tests/ 拦截", "dev", "bash", {
	command: "cat x | tee tests/a.txt",
});
await expectBlock("DEV bash rm tests/ 拦截", "dev", "bash", { command: "rm -f tests/a.py" });
await expectBlock("DEV bash cp 到 tests/ 拦截", "dev", "bash", {
	command: "cp src/a.py tests/a.py",
});
await expectAllow("DEV bash 只读 ls 放行", "dev", "bash", { command: "ls tests/" });
await expectAllow("DEV bash pytest 放行", "dev", "bash", { command: "pytest tests/ -q" });
await expectAllow("DEV bash git status 放行", "dev", "bash", { command: "git status" });

// ── 7. 门禁自保 ────────────────────────────────────────────────────────────

console.log("\n[门禁自保与 TASK-002 临时写通道（AC-11）]");

// AC-11：root of trust 永不豁免（deny * 不受通道影响）。
for (const target of [".omp/trio/policy.txt", ".git/hooks/pre-commit"]) {
	for (const role of ["dev", "arch", "qa"]) {
		await expectBlock(`[${role}] 不得写 ${target}（deny * 不受 TASK-002 通道影响）`, role, "write",
			{ path: target, content: "x" });
	}
}

// AC-11：通道内 5 个窗口文件 → DEV 允许；arch / qa → 仍然拒绝（角色级 deny 优先）。
const WINDOW_FILES = [
	".omp/hooks/pre/trio-guard.ts",
	"templates/pre-push",
	"templates/board.template.md",
	"bin/trio-selftest.sh",
	"bin/init-agent.sh",
];
for (const target of WINDOW_FILES) {
	await expectAllow(`[dev] 窗口文件放行：${target}（TASK-002 通道）`, "dev", "write",
		{ path: target, content: "x" });
	await expectBlock(`[arch] 窗口文件仍拒绝：${target}`, "arch", "write",
		{ path: target, content: "x" });
	await expectBlock(`[qa] 窗口文件仍拒绝：${target}`, "qa", "write",
		{ path: target, content: "x" });
}

// AC-11：fail-closed —— 通道是精确文件放行，不是目录开洞。
await expectBlock("[dev] 通道外 .omp/hooks/ 文件仍拒绝（fail-closed）", "dev", "write",
	{ path: ".omp/hooks/pre/other.ts", content: "x" });
await expectBlock("[dev] 通道外 bin/ 文件仍拒绝（fail-closed）", "dev", "write",
	{ path: "bin/other.sh", content: "x" });
await expectBlock("[dev] 通道外 templates/ 文件仍拒绝（fail-closed）", "dev", "write",
	{ path: "templates/pre-commit", content: "x" });

// ── 汇总 ───────────────────────────────────────────────────────────────────

fs.rmSync(PROJECT, { recursive: true, force: true });

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	console.log("\n失败详情：");
	for (const { label, error } of failures) {
		console.log(`  - ${label}`);
		console.log(`    ${error.message}`);
	}
	process.exit(1);
}
console.log("hook 运行时门禁全部生效。");
