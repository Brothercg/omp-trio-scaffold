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

// TASK-007 窗口（ADR-0003）：窗口内 arch 对七个精确执行件放行；回收后 deny * 恢复。
const WINDOW_ACTIVE = POLICY.includes("BEGIN TASK-007");
const WINDOW_ARCH_ALLOW = new Set([
	".omp/hooks/pre/trio-guard.ts",
	"templates/pre-push",
	"templates/post-commit",
	"bin/trio-check-report.mjs",
	"bin/trio-mutation-check.mjs",
	"bin/trio-selftest.sh",
	"bin/init-agent.sh",
]);

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
await expectBlock("非法角色 fail-closed（BUG-3）", "intern", "write", { path: "tests/a.py", content: "x" });
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
		if (role === "arch" && WINDOW_ACTIVE && WINDOW_ARCH_ALLOW.has(target)) {
			await expectAllow(`[arch] 窗口内精确单文件放行：${target}`, role, "write",
				{ path: target, content: "x" });
			continue;
		}
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
if (WINDOW_ACTIVE) {
	for (const pattern of [
		/^# deny arch \.omp\/hooks\/\*\*$/m,
		/^# deny arch bin\/\*\*$/m,
		/^# deny \* \.omp\/hooks\/\*\*$/m,
		/^# deny \* bin\/\*\*$/m,
	]) {
		assert.ok(pattern.test(policyText), `窗口停用 deny 行缺失：${pattern}`);
	}
	assert.match(policyText, /恢复原文（回收时取消注释）/, "窗口块缺恢复原文注释");
	assert.match(policyText, /^# gate-version: 1$/m, "policy 缺 gate-version 声明");
	console.log("  ✓ 窗口核验：TASK-007 BEGIN 段 + 四条 deny 注释停用 + 恢复原文注释 + gate-version");
} else {
	assert.ok(
		/^deny\s+\*\s+\.omp\/hooks\/\*\*$/m.test(policyText),
		"deny * .omp/hooks/** 未恢复",
	);
	assert.ok(
		/^deny\s+\*\s+bin\/\*\*$/m.test(policyText),
		"deny * bin/** 未恢复",
	);
	console.log("  ✓ 回收核验：BEGIN/END TASK-00[23] 清零 + deny * .omp/hooks/** 与 deny * bin/** 恢复");
}

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
// 每次写 fixture 策略都带 gate-version，避免版本漂移 fail-closed 污染被测语义。
const setPolicy = (text) =>
	fs.writeFileSync(POLICY_FIXTURE, text.includes("gate-version") ? text : `${text}\n# gate-version: 1\n`);

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
			fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), `${tc.policy}\n# gate-version: 1\n`);
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
				fs.writeFileSync(path.join(repo, ".omp", "trio", "policy.txt"), `${tc.policy}\n# gate-version: 1\n`);
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
		fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), "deny * .omp/trio/**\n# gate-version: 1\n");
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

// 第 2 轮对抗边界（spec v1 §6）：
// E 空文件 / F 非法行整份失效 / G mtime 不变 digest 变 / H 不可读 / I 非法行不静默跳过 allow
await check("E/AC-3 policy 空文件 → 合法快照 rules=[]，write fail-closed（无 allow 命中）", async () => {
	setPolicy("");
	const r = await bugAs("dev", "write", { path: "anything.txt", content: "x" });
	assert.equal(r.blocked, true, `空文件竟被放行：${r.reason}`);
	assert.match(r.reason, /策略为空|无 allow|fail-closed/i, `空文件文案缺原因：${r.reason}`);
});

await check("F/AC-3 非法行 → 整份策略不可解析 fail-closed（含合法行也不生效）", async () => {
	setPolicy("allow dev anything.txt\nkind bad/line\n"); // 第 2 行非法 → 整份失效
	const r1 = await bugAs("dev", "write", { path: "anything.txt", content: "x" });
	assert.equal(r1.blocked, true, `合法行旁边 有非法行，竟被 allow 静默放行（fail-open）：${r1.reason}`);
	assert.match(r1.reason, /不可解析|策略缺失/i, `非法行文案原因缺失：${r1.reason}`);
	const r2 = await bugAs("dev", "write", { path: "tests/a.py", content: "x" });
	assert.equal(r2.blocked, true, "整份失效邻域判定也不放行");
});

await check("F2/AC-3 非法 kind（read）→ 整份不可解析；deny 行不得被吞", async () => {
	setPolicy("deny * secret.txt\nread dev secret.txt\n");
	const r = await bugAs("dev", "write", { path: "secret.txt", content: "x" });
	assert.equal(r.blocked, true, `非法 kind 行未被识别，deny 语义被破坏：${r.reason}`);
	assert.match(r.reason, /不可解析/i, `文案未按「-policy 不可解析」声明：${r.reason}`);
});

await check("G/AC-4 mtime 未变但内容变（digest 变）→ 以 digest 为准重用新策略", async () => {
	setPolicy("deny * g.txt\n");
	assert.equal((await bugAs("dev", "write", { path: "g.txt", content: "x" })).blocked, true, "基线 deny 拦截");
	// 不重启进程改 policy，并把 mtime 拨回以伪造「mtime 不变」
	setPolicy("allow dev g.txt\n");
	const now = Date.now() / 1000;
	fs.utimesSync(POLICY_FIXTURE, now, now);
	const r = await bugAs("dev", "write", { path: "g.txt", content: "x" });
	assert.equal(r.blocked, false, `mtime 相同 digest 变化时未重读（比对不完整）：${r.reason}`);
});

await check("H/AC-5 拦截文案含快照标识（digest 8 位 + mtimeMs）", async () => {
	setPolicy("deny * h.txt\n");
	const r = await bugAs("dev", "write", { path: "h.txt", content: "x" });
	assert.match(r.reason, /快照：[0-9a-f]{8}.mtimeMs \d+./u, `文案缺快照标识：${r.reason}`);
});

await check("I/AC-5 [dev] deny→[qa] deny：判定面换角色后访问同一目标，各自文案独立快照（不串扰）", async () => {
	setPolicy("deny * i.txt\n");
	const rDev = await bugAs("dev", "write", { path: "i.txt", content: "x" });
	assert.match(rDev.reason, /快照：[0-9a-f]{8}/u, `dev 文案缺快照标识：${rDev.reason}`);
	const rQa = await bugAs("qa", "write", { path: "i.txt", content: "x" });
	assert.equal(rQa.blocked, true, `qa 未被 deny * 拦截：${rQa.reason}`);
	assert.match(rQa.reason, /快照：[0-9a-f]{8}/u, `qa 文案缺快照标识：${rQa.reason}`);
	assert.match(rQa.reason, /命中禁止规则/, `qa 未声明 deny 命中：${rQa.reason}`);
});

await check("I2/AC-5 判定后外部变更策略 → 同 handler 下一次判定按新快照执法（旧快照不留存）", async () => {
	setPolicy("deny * i.txt\n");
	const r1 = await bugAs("dev", "write", { path: "i.txt", content: "x" });
	assert.match(r1.reason, /快照：[0-9a-f]{8}/u, `第一次文案缺快照标识：${r1.reason}`);
	const snap1 = r1.reason.match(/快照：([0-9a-f]{8})/u)[1];
	setPolicy("allow dev i.txt\n"); // 会话外变更
	const r2 = await bugAs("dev", "write", { path: "i.txt", content: "x" });
	assert.equal(r2.blocked, false, `外部变更后仍按旧快照 ${snap1} 执法（AC-4 违反）：${r2.reason}`);
});

await check("J/AC-1+AC-5 deny→allow 变更后第一次判定：文案/结果一致为放行（即时间边界）", async () => {
	setPolicy("deny * j.txt\n");
	assert.equal((await bugAs("dev", "write", { path: "j.txt", content: "x" })).blocked, true, "基线 deny 拦截");
	setPolicy("allow dev j.txt\n");
	const r = await bugAs("dev", "write", { path: "j.txt", content: "x" });
	assert.equal(r.blocked, false, `deny→allow 边界未即时换新快照：${r.reason}`);
});

// ── TASK-007 切片 A：AC-1/2/3/5/6 门禁加固回归 ──────────────────────────────

console.log("\n[TASK-007 AC-1 bash 全矩阵]");

const T7 = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t7-"));
fs.mkdirSync(path.join(T7, ".omp", "trio"), { recursive: true });
fs.mkdirSync(path.join(T7, "src"), { recursive: true });
fs.mkdirSync(path.join(T7, "tests"), { recursive: true });
fs.mkdirSync(path.join(T7, "docs", "task", "T"), { recursive: true });
fs.writeFileSync(
	path.join(T7, ".omp", "trio", "policy.txt"),
	"allow arch docs/**\nallow qa tests/**\ndeny arch src/**\n# gate-version: 1\n",
);
let t7handler = null;
registerGuard({ on: (e, fn) => (t7handler = fn) });
async function t7call(role, toolName, input) {
	const prev = process.env.TRIO_ROLE;
	if (role === null) delete process.env.TRIO_ROLE;
	else process.env.TRIO_ROLE = role;
	try {
		return await t7handler({ toolName, input }, { cwd: T7 });
	} finally {
		if (prev === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = prev;
	}
}

await check("AC-1 arch `cp /tmp/f src/x.py` 被拒（不再只查 deny）", async () => {
	const r = await t7call("arch", "bash", { command: "cp /tmp/f src/x.py" });
	assert.equal(r?.block, true, "arch 越权 bash 写 src/ 未被拦截");
	assert.match(r.reason, /src\/x\.py|白名单|禁止规则/u);
});

await check("AC-1 qa `tee tests/y.py` 允许（policy allow qa tests/**）", async () => {
	const r = await t7call("qa", "bash", { command: "tee tests/y.py" });
	assert.notEqual(r?.block, true, `qa 合法 bash 写被误拦：${r?.reason}`);
});

await check("AC-1 arch `tee docs/note.md` 允许（allow arch docs/**）", async () => {
	const r = await t7call("arch", "bash", { command: "tee docs/note.md" });
	assert.notEqual(r?.block, true, `arch 合法 bash 写被误拦：${r?.reason}`);
});

console.log("\n[TASK-007 AC-2 symlink 拒穿透]");

fs.symlinkSync("../../../src", path.join(T7, "docs", "task", "T", "l"), "dir");

await check("AC-2 write 经 symlink 落 src/ 被拒并明示 symlink 穿透", async () => {
	const r = await t7call("arch", "write", { path: "docs/task/T/l/evil.py", content: "x" });
	assert.equal(r?.block, true, "symlink 穿透未被拦截（词法 docs/ 被放行）");
	assert.match(r.reason, /symlink 穿透/u);
});

await check("AC-2 bash 经 symlink 落 src/ 被拒", async () => {
	const r = await t7call("arch", "bash", { command: "cp /tmp/f docs/task/T/l/evil.py" });
	assert.equal(r?.block, true, "bash symlink 穿透未被拦截");
	assert.match(r.reason, /symlink 穿透/u);
});

console.log("\n[TASK-007 AC-3 跨 worktree 出根]");

const WT = fs.mkdtempSync(path.join(os.tmpdir(), "trio-wt-"));
fs.mkdirSync(path.join(WT, ".omp", "trio"), { recursive: true });
fs.writeFileSync(path.join(WT, ".omp", "trio", "policy.txt"), "allow dev src/**\n# gate-version: 1\n");
const { execFileSync } = await import("node:child_process");
execFileSync("git", ["init", "-q"], { cwd: WT });
execFileSync("git", ["config", "user.email", "t@t"], { cwd: WT });
execFileSync("git", ["config", "user.name", "t"], { cwd: WT });
fs.writeFileSync(path.join(WT, "a.txt"), "x");
execFileSync("git", ["add", "a.txt"], { cwd: WT });
execFileSync("git", ["commit", "-q", "-m", "root"], { cwd: WT });
const WT2 = fs.mkdtempSync(path.join(os.tmpdir(), "trio-wt2-"));
fs.rmdirSync(WT2);
execFileSync("git", ["worktree", "add", "-q", WT2], { cwd: WT });
fs.mkdirSync(path.join(WT2, "src"), { recursive: true });
let wtHandler = null;
registerGuard({ on: (e, fn) => (wtHandler = fn) });
async function wtCall(role, input) {
	const prev = process.env.TRIO_ROLE;
	process.env.TRIO_ROLE = role;
	try {
		return await wtHandler({ toolName: "write", input }, { cwd: WT });
	} finally {
		if (prev === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = prev;
	}
}

await check("AC-3 写另一 worktree 的 src/x.py 被拒并提示跨 worktree", async () => {
	const r = await wtCall("dev", { path: path.join(WT2, "src", "x.py"), content: "x" });
	assert.equal(r?.block, true, "跨 worktree 写入未被拦截");
	assert.match(r.reason, /跨 worktree/u);
});

await check("AC-3 /tmp/x.py（非任何 worktree 根内）放行（不受管辖）", async () => {
	const r = await wtCall("dev", { path: "/tmp/x.py", content: "x" });
	assert.notEqual(r?.block, true, `系统路径被误拦：${r?.reason}`);
});

console.log("\n[TASK-007 AC-5 执法件版本自证]");

const GV = fs.mkdtempSync(path.join(os.tmpdir(), "trio-gv-"));
fs.mkdirSync(path.join(GV, ".omp", "trio"), { recursive: true });
fs.mkdirSync(path.join(GV, "src"), { recursive: true });
let gvHandler = null;
registerGuard({ on: (e, fn) => (gvHandler = fn) });
async function gvCall(policyText, toolName, input) {
	fs.writeFileSync(path.join(GV, ".omp", "trio", "policy.txt"), policyText);
	const prev = process.env.TRIO_ROLE;
	process.env.TRIO_ROLE = "dev";
	try {
		return await gvHandler({ toolName, input }, { cwd: GV });
	} finally {
		if (prev === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = prev;
	}
}

await check("AC-5 声明 gate-version: 2 ≠ EXPECTED=1 → fail-closed 明示漂移", async () => {
	const r = await gvCall("allow dev src/**\n# gate-version: 2\n", "write", { path: "src/a.py", content: "x" });
	assert.equal(r?.block, true, "版本漂移未被 fail-closed");
	assert.match(r.reason, /执法件版本漂移/u);
});

await check("AC-5 gate-version 缺失 → fail-closed 明示漂移", async () => {
	const r = await gvCall("allow dev src/**\n", "write", { path: "src/a.py", content: "x" });
	assert.equal(r?.block, true, "缺失 gate-version 未 fail-closed");
	assert.match(r.reason, /执法件版本漂移|缺 # gate-version/u);
});

await check("AC-5 版本一致 → 正常执行", async () => {
	const r = await gvCall("allow dev src/**\n# gate-version: 1\n", "write", { path: "src/a.py", content: "x" });
	assert.notEqual(r?.block, true, `版本一致却拦截：${r?.reason}`);
});

console.log("\n[TASK-007 AC-6 无身份醒目提示]");

await check("AC-6 TRIO_ROLE 未设置 → 放行且每次附醒目提示（不静默）", async () => {
	const first = await t7call(null, "write", { path: "src/a.py", content: "x" });
	assert.notEqual(first?.block, true, "无身份不应拦截");
	assert.match(String(first?.additionalContext ?? ""), /无身份运行，门禁未生效/u);
	const second = await t7call(null, "bash", { command: "cp /tmp/f src/a.py" });
	assert.notEqual(second?.block, true);
	assert.match(String(second?.additionalContext ?? ""), /无身份运行，门禁未生效/u);
});

fs.rmSync(T7, { recursive: true, force: true });
fs.rmSync(GV, { recursive: true, force: true });
try {
	execFileSync("git", ["worktree", "remove", "--force", WT2], { cwd: WT });
} catch {}
fs.rmSync(WT, { recursive: true, force: true });
fs.rmSync(WT2, { recursive: true, force: true });

fs.rmSync(BUG_PROJECT, { recursive: true, force: true });

// ── 汇总 ───────────────────────────────────────────────────────────────────

// ── TASK-007 缺陷修复回归：BUG-1/2/3 ───────────────────────────────────────

console.log("\n[BUG-1 -t/--target-directory 写目标抽取]");

async function rawAs(role, toolName, input) {
	const previous = process.env.TRIO_ROLE;
	if (role === undefined) delete process.env.TRIO_ROLE;
	else process.env.TRIO_ROLE = role;
	try {
		return await call(toolName, input);
	} finally {
		if (previous === undefined) delete process.env.TRIO_ROLE;
		else process.env.TRIO_ROLE = previous;
	}
}

for (const [label, command] of [
	["cp -t src/ /tmp/f", "cp -t src/ /tmp/f"],
	["cp --target-directory=src /tmp/f", "cp --target-directory=src /tmp/f"],
	["cp --target-directory src /tmp/f", "cp --target-directory src /tmp/f"],
	["install -t src f", "install -t src f"],
	["ln -s -t src f", "ln -s -t src f"],
	["rsync --delete src/ src/x", "rsync --delete src/ src/x"],
	["cp -- -t src（-- 后按位置参数）", "cp -- -t src"],
	["install -o USER /tmp/f src/x（选项值不吞目标）", "install -o USER /tmp/f src/x"],
]) {
	await check(`BUG-1 BLOCK：${label}`, async () => {
		const r = await rawAs("arch", "bash", { command });
		assert.equal(r?.block, true, `应拒绝：${command}`);
		assert.match(r.reason, /src/u, "原因应明示写目标 src");
	});
}

await check("BUG-1 正例不误伤：cp /tmp/f src/x 作为 dev 仍按目标 src/x 放行", async () => {
	const r = await rawAs("dev", "bash", { command: "cp /tmp/f src/x" });
	assert.notEqual(r?.block, true, `合法写被误拦：${r?.reason}`);
});

await check("BUG-1 正例不误伤：ln -s /tmp/f src/link 作为 dev 放行", async () => {
	const r = await rawAs("dev", "bash", { command: "ln -s /tmp/f src/link" });
	assert.notEqual(r?.block, true, `合法 ln 被误拦：${r?.reason}`);
});

await check("BUG-1 只读源侧：cp -t /tmp/dir src/x（目标系统路径）放行", async () => {
	const r = await rawAs("arch", "bash", { command: "cp -t /tmp/dir src/x" });
	assert.notEqual(r?.block, true, `写目标为系统路径不应按源判定：${r?.reason}`);
});

console.log("\n[BUG-2 gate-version 严格解析]");

async function withPolicy(text, fn) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-bug2-"));
	try {
		fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
		fs.mkdirSync(path.join(dir, "src"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".omp", "trio", "policy.txt"), text);
		let handler = null;
		registerGuard({ on: (e, h) => (handler = h) });
		const prev = process.env.TRIO_ROLE;
		process.env.TRIO_ROLE = "dev";
		try {
			return await fn((tool, input) => handler({ toolName: tool, input }, { cwd: dir }));
		} finally {
			if (prev === undefined) delete process.env.TRIO_ROLE;
			else process.env.TRIO_ROLE = prev;
		}
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

const basePolicy = POLICY.replace(/^# gate-version:.*$/gm, "").trimEnd() + "\n";
const gateVariants = [
	["=1.5 小数", `${basePolicy}# gate-version: 1.5\n`, /非法/u],
	["=1abc 后缀", `${basePolicy}# gate-version: 1abc\n`, /非法/u],
	["双行 1 后 2", `${basePolicy}# gate-version: 1\n# gate-version: 2\n`, /重复/u],
	["双行 2 后 1", `${basePolicy}# gate-version: 2\n# gate-version: 1\n`, /重复/u],
	["缺行", basePolicy, /缺失/u],
];
for (const [label, text, reason] of gateVariants) {
	await check(`BUG-2 BLOCK：${label}`, async () => {
		await withPolicy(text, async (write) => {
			const r = await write("write", { path: "src/a.py", content: "x" });
			assert.equal(r?.block, true, `${label} 应 fail-closed`);
			assert.match(r.reason, reason);
			assert.match(r.reason, /执法件版本漂移/u);
		});
	});
}

await check("BUG-2 合法唯一行 # gate-version: 1 → 放行", async () => {
	await withPolicy(`${basePolicy}# gate-version: 1\n`, async (write) => {
		const r = await write("write", { path: "src/a.py", content: "x" });
		assert.notEqual(r?.block, true, `合法版本被误拦：${r?.reason}`);
	});
});

console.log("\n[BUG-3 TRIO_ROLE 非法值 fail-closed]");

for (const [label, role] of [
	["devs 未知词", "devs"],
	["前导空格 \" dev\"", " dev"],
	["空串", ""],
	["尾部空格 \"qa \"", "qa "],
]) {
	await check(`BUG-3 BLOCK：${label}`, async () => {
		const r = await rawAs(role, "write", { path: "src/a.py", content: "x" });
		assert.equal(r?.block, true, `非法角色 ${JSON.stringify(role)} 未被拦截`);
		assert.match(r.reason, /TRIO_ROLE 非法/u);
	});
}

await check("BUG-3 非法角色对 bash 写同样 BLOCK", async () => {
	const r = await rawAs("devs", "bash", { command: "cp /tmp/f src/x" });
	assert.equal(r?.block, true);
	assert.match(r.reason, /TRIO_ROLE 非法/u);
});

await check("BUG-3 大写 DEV 归一化为 dev → 放行", async () => {
	const r = await rawAs("DEV", "write", { path: "src/a.py", content: "x" });
	assert.notEqual(r?.block, true, `DEV 应归一化为 dev：${r?.reason}`);
});

await check("BUG-3 pm 归一化为 arch → 按其规则判定（docs 契约放行）", async () => {
	const r = await rawAs("pm", "write", { path: `${TASK}/arch-20261025-0900-spec.md`, content: "x" });
	assert.notEqual(r?.block, true, `pm 别名未按 arch 放行：${r?.reason}`);
});

await check("BUG-3 未设置身份 → 逃生舱放行 + 醒目提示", async () => {
	const r = await rawAs(undefined, "write", { path: "src/a.py", content: "x" });
	assert.notEqual(r?.block, true, "未设置角色不应拦截");
	assert.match(String(r?.additionalContext ?? ""), /无身份运行，门禁未生效/u);
});

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
