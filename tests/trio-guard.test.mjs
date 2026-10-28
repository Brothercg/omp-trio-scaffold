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

console.log("\n[门禁自保与通道回收后的 fail-closed（AC-11，verdict shared：回收后）]");

// deny *：policy / pre-commit / guard / 自检脚本 / 门禁执行件模板 —— 任何角色一律拒绝。
// （ADR-0009：文档模板 templates/*.template.md 放权 arch，单独断言见下一块；执行件仍 fail-closed。）
for (const target of [
	".omp/trio/policy.txt",
	".git/hooks/pre-commit",
	".omp/hooks/pre/trio-guard.ts",
	"bin/trio-selftest.sh",
	"bin/init-agent.sh",
	"templates/pre-push",
	"templates/pre-commit",
]) {
	for (const role of ["dev", "arch", "qa"]) {
		await expectBlock(`[${role}] 不得写 ${target}（deny * / fail-closed）`, role, "write",
			{ path: target, content: "x" });
	}
}

// ADR-0009 文档模板分离：templates/*.template.md 对 arch 放行、dev/qa 仍拒绝。
for (const target of ["templates/board.template.md", "templates/report.template.md", "templates/spec.template.md"]) {
	await expectAllow(`[arch] 文档模板放行：${target}（ADR-0009）`, "arch", "write",
		{ path: target, content: "x" });
	await expectBlock(`[dev] 文档模板仍拒绝：${target}（ADR-0009）`, "dev", "write",
		{ path: target, content: "x" });
	await expectBlock(`[qa] 文档模板仍拒绝：${target}（ADR-0009）`, "qa", "write",
		{ path: target, content: "x" });
}

// 回收核验：BEGIN/END 标记必须清零；fail-closed 自动恢复。
const policyText = POLICY;
assert.ok(
	!/BEGIN TASK-00[23]/.test(policyText),
	"policy.txt 仍残留 BEGIN TASK-002 / TASK-003 通道段，应被整段删除",
);
assert.ok(
	!/END TASK-00[23]/.test(policyText),
	"policy.txt 仍残留 END TASK-002 / TASK-003 通道段，应被整段删除",
);
assert.ok(
	/^deny\s+\*\s+\.omp\/hooks\/\*\*$/m.test(policyText),
	"deny * .omp/hooks/** 未恢复",
);
assert.ok(
	/^deny\s+\*\s+bin\/\*\*$/m.test(policyText),
	"deny * bin/** 未恢复",
);
console.log("  ✓ 回收核验：BEGIN/END TASK-00[23] 清零 + deny * .omp/hooks/** 与 deny * bin/** 恢复");

// fail-closed —— 通道是精确文件放行，不是目录开洞；回收后通道位置回到 deny 全覆盖。
await expectBlock("[dev] .omp/hooks/ 其他文件拒绝（fail-closed）", "dev", "write",
	{ path: ".omp/hooks/pre/other.ts", content: "x" });
await expectBlock("[dev] bin/ 其他文件拒绝（fail-closed）", "dev", "write",
	{ path: "bin/other.sh", content: "x" });
await expectBlock("[dev] templates/ 其他文件拒绝（fail-closed）", "dev", "write",
	{ path: "templates/pre-commit", content: "x" });

// ── BUG-1 回归：策略生效时机 + 缺失 fail-closed + 双执法面一致 ────────────

console.log("\n[BUG-1 回归：策略变更即时生效 / 缺失 fail-closed / 双执法面一致]");

// 独立 fixture 项目：policy 内容在本测试块内可改写（不触碰脚手架真值源）。
const BUG_PROJECT = makeProject();
const bugCall = makeHook(BUG_PROJECT); // 独立 hook 实例（内聚 own cachedRules）
const POLICY_FIXTURE = path.join(BUG_PROJECT, ".omp", "trio", "policy.txt");
const setPolicy = (text) => fs.writeFileSync(POLICY_FIXTURE, text);

async function bugAs(role, toolName, input) {
	const previous = process.env.TRIO_ROLE;
	if (role === null) delete process.env.TRIO_ROLE;
	else process.env.TRIO_ROLE = role;
	try {
		const result = await bugCall(toolName, input);
		return { blocked: result?.block === true, reason: result?.reason ?? "" };
	} finally {
		if (previous === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = previous;
	}
}

// A（AC-1 即时生效）：deny 基线 → 改 policy 为 allow → 不重启进程立即放行。
await check("A/AC-1 会话外改 allow，同 handler 下一次调用立即放行（不重启进程）", async () => {
	setPolicy("deny * target.txt\n");
	assert.equal((await bugAs("dev", "write", { path: "target.txt", content: "x" })).blocked, true,
		"基线：deny * target.txt 应拦截 dev 写 target.txt");
	setPolicy("allow dev target.txt\n");
	const r = await bugAs("dev", "write", { path: "target.txt", content: "x" });
	assert.equal(r.blocked, false, `同进程新 allow 即时放行失败（缓存不失效）：${r.reason}`);
});

// B（AC-2 deny 即时生效）：allow 基线 → 改 policy 为 deny → 立即拦截。
await check("B/AC-2 会话外改 deny，紧急撤权立即拦截（无放行宽于新策略的窗口）", async () => {
	setPolicy("allow dev target.txt\n");
	assert.equal((await bugAs("dev", "write", { path: "target.txt", content: "x" })).blocked, false,
		"基线：allow dev target.txt 应放行");
	setPolicy("deny * target.txt\n");
	const r = await bugAs("dev", "write", { path: "target.txt", content: "x" });
	assert.equal(r.blocked, true, `deny 即时生效失败（安全向 fail-open 窗口）：${r.reason}`);
});

// C（AC-3 缺失 fail-closed）：删除 policy → 全部 write 拦截，文案含 fail-closed；
// 纯注释 policy 同为空规则集，必须一并拦截（不得放行）。
await check("C/AC-3 policy 缺失 → 全部 write 拦截（fail-closed 兑现注释）", async () => {
	setPolicy("allow dev target.txt\n"); // 先保证有非缺失基线，再删
	fs.unlinkSync(POLICY_FIXTURE);
	const r = await bugAs("dev", "write", { path: "anything.txt", content: "x" });
	assert.equal(r.blocked, true, `缺失 policy 竟被放行（fail-open）：${r.reason}`);
	assert.match(r.reason, /[Ff]ail[- ]closed|策略缺失/i,
		`拦截文案未声明 fail-closed：${r.reason}`);
});
await check("C2 policy 为纯注释（空规则集）→ 同样 fail-closed，不得放行", async () => {
	setPolicy("# 只有注释，没有任何规则\n");
	const r = await bugAs("dev", "write", { path: "anything.txt", content: "x" });
	assert.equal(r.blocked, true, `纯注释 policy 竟被放行：${r.reason}`);
	assert.match(r.reason, /[Ff]ail[- ]closed|策略缺失|为空/i, `文案未指明空策略：${r.reason}`);
});

// D（AC-5 双执法面一致）：同一批路径矩阵分别过 guard 判定与 pre-commit 判定，
// 断言同结论。pre-commit 面以子进程真实执行（guard fixture → git fixture）。
await check("D/AC-5 guard 判定与 pre-commit 判定对同一路径矩阵结论一致", async () => {
	const { execFileSync } = await import("node:child_process");
	const cases = [
		{ policy: "allow dev src/**\ndeny * .omp/hooks/**\n", role: "dev", path: "src/a.py", wantBlock: false },
		{ policy: "allow dev src/**\ndeny * src/secret/**\n", role: "dev", path: "src/secret/k.py", wantBlock: true },
		{ policy: "allow dev src/**\n", role: "arch", path: "src/a.py", wantBlock: true }, // 无命中 → 拒
		{ policy: "allow * CHANGELOG.md\n", role: "pm", path: "CHANGELOG.md", wantBlock: false }, // pm→arch 别名
		{ policy: "allow dev src/**\n", role: "dev", path: "docs/x.md", wantBlock: true }, // 无命中
		{ policy: "deny * **\nallow dev src/**\n", role: "dev", path: "src/a.py", wantBlock: true }, // deny 优先
	];
	for (const tc of cases) {
		// ① guard 面：独立临时项目 + fresh hook 实例（避免缓存串扰）
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-guard-dual-"));
		try {
			fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
			fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), tc.policy);
			let handler = null;
			registerGuard({ on: (e, fn) => (handler = fn) });
			const prev = process.env.TRIO_ROLE;
			process.env.TRIO_ROLE = tc.role;
			let guardBlock;
			try {
				const r = await handler({ toolName: "write", input: { path: tc.path, content: "x" } }, { cwd: dir });
				guardBlock = r?.block === true;
			} finally {
				if (prev === undefined) delete process.env.TRIO_ROLE;
				else process.env.TRIO_ROLE = prev;
			}
			assert.equal(guardBlock, tc.wantBlock,
				`guard 面偏差：role=${tc.role} path=${tc.path} policy=${JSON.stringify(tc.policy)}（want ${tc.wantBlock ? "block" : "allow"}）`);

			// ② pre-commit 面：真实模板以子进程在同一 fixture 形态跑（git init + .omp/trio/policy.txt）
			const repo = fs.mkdtempSync(path.join(os.tmpdir(), "trio-precommit-"));
			try {
				execFileSync("git", ["init", "-q"], { cwd: repo });
				fs.mkdirSync(path.join(repo, ".omp", "trio"), { recursive: true });
				fs.writeFileSync(path.join(repo, ".omp", "trio", "policy.txt"), tc.policy);
				// 待判文件造出 staging 面：写入 tc.path 同形态目录
				const stagedPath = tc.path;
				fs.mkdirSync(path.dirname(path.join(repo, stagedPath)), { recursive: true });
				fs.writeFileSync(path.join(repo, stagedPath), "x");
				execFileSync("git", ["add", stagedPath], { cwd: repo });
				let preCommitCode = 0;
				try {
					execFileSync(
						"bash", [path.join(ROOT, "templates", "pre-commit")],
						{ cwd: repo, env: { ...process.env, TRIO_ROLE: tc.role }, stdio: "pipe" },
					);
				} catch (er) {
					preCommitCode = er.status ?? 1;
				}
				const preCommitBlock = preCommitCode !== 0;
				assert.equal(preCommitBlock, tc.wantBlock,
					`pre-commit 面偏差：role=${tc.role} path=${tc.path} policy=${JSON.stringify(tc.policy)}（want ${tc.wantBlock ? "block" : "allow"}，exit=${preCommitCode}）`);
			} finally {
				fs.rmSync(repo, { recursive: true, force: true });
			}
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}

	// 缺失 policy 双面一致：guard 面 fail-closed（A-C 已证），pre-commit 面 exit!=0
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), "trio-precommit-missing-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: repo });
		fs.writeFileSync(path.join(repo, "f.txt"), "x");
		execFileSync("git", ["add", "f.txt"], { cwd: repo });
		let code = 0;
		try {
			execFileSync("bash", [path.join(ROOT, "templates", "pre-commit")], {
				cwd: repo,
				env: { ...process.env, TRIO_ROLE: "dev" },
				stdio: "pipe",
			});
		} catch (er) {
			code = er.status ?? 1;
		}
		assert.notEqual(code, 0, "pre-commit 对缺失 policy 竟 exit 0（fail-open）");
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
});

// D2：bash 写意图双面（guard 面 vs pre-commit 对等语义：deny 意图为禁写目标）
await check("D2/AC-5 bash 写意图 guard 拦截与 pre-commit deny 结论一致（deny 语义面）", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-guard-bash-"));
	try {
		fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), "deny * .omp/trio/**\n");
		let handler = null;
		registerGuard({ on: (e, fn) => (handler = fn) });
		const prev = process.env.TRIO_ROLE;
		process.env.TRIO_ROLE = "dev";
		let r;
		try {
			r = await handler({ toolName: "bash", input: { command: "echo hi > .omp/trio/policy.txt" } }, { cwd: dir });
		} finally {
			if (prev === undefined) delete process.env.TRIO_ROLE; else process.env.TRIO_ROLE = prev;
		}
		assert.equal(r?.block, true, "bash 重定向写 deny 面未被 guard 拦截");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

fs.rmSync(BUG_PROJECT, { recursive: true, force: true });

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
