/**
 * trio-policy.test.mjs —— 门禁策略的回归测试
 *
 * 这是**永久测试**：它锁定「什么角色能写什么路径」这条契约。
 * 任何对 .omp/trio/policy.txt 的修改都必须同步更新本文件的期望值，
 * 否则 CI 会失败 —— 这正是「开发严禁修改测试」的对称约束：
 * 门禁的期望值由测试独占，策略文件的修改必须经过显式的测试更新。
 *
 * 运行：
 *   bun tests/trio-policy.test.mjs
 *   或 node --test tests/trio-policy.test.mjs
 *
 * 依赖：bun（omp 的运行时，本仓库的 hook 也由 bun 直接 import）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD_ROOT = path.resolve(HERE, "..");
const POLICY_PATH = path.join(SCAFFOLD_ROOT, ".omp", "trio", "policy.txt");
const HOOK_PATH = path.join(SCAFFOLD_ROOT, ".omp", "hooks", "pre", "trio-guard.ts");

// ── 载入 hook 的纯函数 ────────────────────────────────────────────────────

const hookSource = fs.readFileSync(HOOK_PATH, "utf8");
const hookBody = hookSource.replace(/^export default function[\s\S]*$/m, "");
const hookModule = await import(
	"data:text/javascript;base64," +
		Buffer.from(
			hookBody +
				"\nexport { bashTargetsForbidden, extractPathsFromPatchInput, extractPathsFromCode, inputPaths };",
		).toString("base64")
);

const {
	decide,
	parsePolicy,
	bashTargetsForbidden,
	extractPathsFromPatchInput,
	extractPathsFromCode,
	inputPaths,
} = hookModule;

// 直接复用 hook 的解析器 —— 测试与生产代码不存在镜像实现，不会漂移。
const rules = parsePolicy(fs.readFileSync(POLICY_PATH, "utf8"));

// ── 断言helper ─────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(label, fn) {
	try {
		fn();
		passed++;
		console.log(`  ✓ ${label}`);
	} catch (error) {
		failures.push({ label, error });
		console.log(`  ✗ ${label}`);
		console.log(`      ${error.message.split("\n")[0]}`);
	}
}

function assertAllowed(role, filePath) {
	const verdict = decide(rules, role, filePath);
	assert.equal(
		verdict.allowed,
		true,
		`期望 ${role} 允许写 ${filePath}，实际拒绝：${verdict.allowed ? "" : verdict.reason}`,
	);
}

function assertDenied(role, filePath) {
	const verdict = decide(rules, role, filePath);
	assert.equal(
		verdict.allowed,
		false,
		`期望 ${role} 拒绝写 ${filePath}，实际允许`,
	);
}

// ── 1. 角色隔离矩阵 ────────────────────────────────────────────────────────

console.log("\n[角色隔离矩阵]");

check("DEV 可写 src/", () => assertAllowed("dev", "src/a.py"));
check("DEV 可写 src/ 深层目录", () => assertAllowed("dev", "src/deep/nested/b.py"));
check("DEV 可写 docs/releases/", () => assertAllowed("dev", "docs/releases/TASK-1.md"));
check("DEV 禁写 tests/", () => assertDenied("dev", "tests/a.py"));
check("DEV 禁写 docs/specs/", () => assertDenied("dev", "docs/specs/TASK-1.md"));
check("DEV 禁写 docs/architecture/", () => assertDenied("dev", "docs/architecture/x.md"));
check("DEV 禁写 docs/bugs/", () => assertDenied("dev", "docs/bugs/BUG-1.md"));

check("ARCH 可写 docs/specs/", () => assertAllowed("arch", "docs/specs/TASK-1.md"));
check("ARCH 可写 docs/architecture/", () => assertAllowed("arch", "docs/architecture/x.md"));
check("ARCH 禁写 src/（硬红线）", () => assertDenied("arch", "src/a.py"));
check("ARCH 禁写 tests/（硬红线）", () => assertDenied("arch", "tests/a.py"));
check("ARCH 禁写 docs/releases/", () => assertDenied("arch", "docs/releases/TASK-1.md"));
check("ARCH 禁写 docs/bugs/", () => assertDenied("arch", "docs/bugs/BUG-1.md"));

check("QA 可写 tests/", () => assertAllowed("qa", "tests/test_a.py"));
check("QA 可写 docs/bugs/", () => assertAllowed("qa", "docs/bugs/BUG-1.md"));
check("QA 禁写 src/", () => assertDenied("qa", "src/a.py"));
check("QA 禁写 docs/specs/", () => assertDenied("qa", "docs/specs/TASK-1.md"));

// ── 2. 公共维护区 ──────────────────────────────────────────────────────────

console.log("\n[公共维护区]");

const COMMON = [
	".omp/trio/CURRENT_TASK.md",
	"README.md",
	"CHANGELOG.md",
	"pyproject.toml",
	"setup.cfg",
	"setup.py",
	"requirements.txt",
	"requirements-dev.txt",
	"uv.lock",
	"poetry.lock",
	"pytest.ini",
	".pytest.ini",
	"ruff.toml",
	".ruff.toml",
	"pyrightconfig.json",
	".gitignore",
	".gitattributes",
	".github/workflows/ci.yml",
];
for (const file of COMMON) {
	check(`三方均可写 ${file}`, () => {
		assertAllowed("arch", file);
		assertAllowed("dev", file);
		assertAllowed("qa", file);
	});
}

// ── 3. 门禁自身保护 ───────────────────────────────────────────────────────

console.log("\n[门禁自身保护]");

for (const file of [".omp/hooks/pre/trio-guard.ts", ".omp/trio/policy.txt", "bin/init-agent.sh"]) {
	check(`任何角色都不得写 ${file}`, () => {
		assertDenied("arch", file);
		assertDenied("dev", file);
		assertDenied("qa", file);
	});
}

// ── 4. fail-closed ─────────────────────────────────────────────────────────

console.log("\n[fail-closed]");

check("白名单外的路径一律拒绝", () => {
	assertDenied("dev", "unknown/file.txt");
	assertDenied("dev", "docs/other/x.md");
	assertDenied("arch", "docs/releases/x.md");
	assertDenied("qa", "docs/releases/x.md");
});

// ── 5. bash 写意图 ─────────────────────────────────────────────────────────

console.log("\n[bash 写意图]");

const FORBIDDEN = ["tests/**", "docs/specs/**", "src/**"];
const MUST_BLOCK = [
	"echo bad > tests/a.txt",
	"echo bad >> tests/a.txt",
	"sed -i s/x/y/ tests/a.py",
	"cp src/a.py tests/a.py",
	"cp -r src tests/",
	"mv tests/a.py src/a.py",
	"rm -f tests/a.py",
	"cat foo | tee tests/a.txt",
	`python -c "open('tests/a.py','w')"`,
	`python -c 'open("tests/a.py","w")'`,
	'echo x > "tests/a.txt"',
	"git add tests/a.py && git commit -m x",
	"patch tests/a.py",
	"chmod 777 tests/a.py",
];
for (const cmd of MUST_BLOCK) {
	check(`拦：${cmd}`, () => {
		assert.ok(
			bashTargetsForbidden(cmd, FORBIDDEN).length > 0,
			`期望拦截「${cmd}」，实际放行`,
		);
	});
}

const MUST_ALLOW = [
	"ls tests/",
	"cat tests/a.py",
	"grep -r foo tests/",
	"git status",
	"git log --oneline",
	"pytest -q",
	"pytest tests/",
	"ruff check src/",
	"cat docs/specs/TASK-1.md",
	"head -20 src/a.py",
	"npm run build",
	"make test",
	"python -m pytest tests/",
	"wc -l src/a.py",
];
for (const cmd of MUST_ALLOW) {
	check(`放行：${cmd}`, () => {
		assert.equal(
			bashTargetsForbidden(cmd, FORBIDDEN).length,
			0,
			`期望放行「${cmd}」，实际被拦`,
		);
	});
}

// ── 6. edit / eval 路径提取 ───────────────────────────────────────────────

console.log("\n[路径提取]");

check("apply_patch 提取文件标记", () => {
	assert.deepEqual(
		extractPathsFromPatchInput(
			"*** Begin Patch\n*** Add File: tests/new_test.py\n+def t(): pass\n*** Update File: src/a.py\n*** Delete File: docs/specs/old.md\n*** End Patch",
		),
		["tests/new_test.py", "src/a.py", "docs/specs/old.md"],
	);
});

check("apply_patch 提取 Move to", () => {
	assert.deepEqual(
		extractPathsFromPatchInput("*** Begin Patch\n*** Update File: src/a.py\n*** Move to: tests/b.py\n*** End Patch"),
		["src/a.py", "tests/b.py"],
	);
});

check("hashline 头部提取路径", () => {
	assert.deepEqual(extractPathsFromPatchInput("[tests/trio_probe.py#a1b2]\n1:def t():"), [
		"tests/trio_probe.py",
	]);
});

check("eval 代码提取写路径", () => {
	assert.deepEqual(extractPathsFromCode(`open('tests/a.py','w').write('x')`), ["tests/a.py"]);
	assert.deepEqual(extractPathsFromCode(`writeFileSync("src/a.ts", data)`), ["src/a.ts"]);
});

check("lsp 只读动作不视为写", () => {
	assert.deepEqual(inputPaths("lsp", { action: "hover", file: "tests/a.py" }), []);
	assert.deepEqual(inputPaths("lsp", { action: "diagnostics", file: "tests/a.py" }), []);
});

check("lsp 写动作视为写", () => {
	assert.deepEqual(inputPaths("lsp", { action: "rename", file: "tests/a.py" }), ["tests/a.py"]);
	assert.deepEqual(inputPaths("lsp", { action: "code_actions", file: "tests/a.py", apply: true }), [
		"tests/a.py",
	]);
});

// ── 7. 角色别名兼容（pm → arch）──────────────────────────────────────────

console.log("\n[角色别名兼容]");

check("TRIO_ROLE=pm 与 arch 判定等价（docs/specs/ 可写）", () => {
	assert.deepEqual(decide(rules, "pm", "docs/specs/T.md"), decide(rules, "arch", "docs/specs/T.md"));
	assertAllowed("pm", "docs/specs/T.md");
});

check("TRIO_ROLE=pm 仍受 src/ 硬红线约束", () => assertDenied("pm", "src/a.py"));
check("TRIO_ROLE=pm 仍受 tests/ 硬红线约束", () => assertDenied("pm", "tests/a.py"));

check("别名大小写不敏感（PM / Pm）", () => {
	assertAllowed("PM", "docs/architecture/x.md");
	assertAllowed("Pm", "docs/architecture/x.md");
});

check("未知角色按 fail-closed 拒绝", () => assertDenied("intern", "README.md"));

check("旧版 policy.txt 的 allow pm 行对新角色 arch 生效", () => {
	const legacy = parsePolicy("allow pm docs/specs/**\ndeny * src/**\n");
	assert.equal(decide(legacy, "arch", "docs/specs/T.md").allowed, true);
	assert.equal(decide(legacy, "arch", "src/a.py").allowed, false);
});

check("旧版 policy.txt 的 deny pm 行对新角色 arch 生效", () => {
	const legacy = parsePolicy("allow * docs/**\ndeny pm docs/secret.md\n");
	assert.equal(decide(legacy, "arch", "docs/secret.md").allowed, false);
});

// ── 8. 角色简报文件名映射（start-agent.sh 与 init-agent.sh 必须一致）─────

console.log("\n[角色简报映射]");

const SCAFFOLD_PROFILES = path.join(SCAFFOLD_ROOT, "profiles");
const EXPECTED_BRIEFS = { arch: "arch.rules.md", dev: "dev.rules.md", qa: "test.rules.md" };

for (const [role, brief] of Object.entries(EXPECTED_BRIEFS)) {
	check(`${role} 的简报文件存在：profiles/${brief}`, () => {
		assert.ok(fs.existsSync(path.join(SCAFFOLD_PROFILES, brief)), `缺少 profiles/${brief}`);
	});
	check(`${role} 的运行时副本存在：.omp/trio/${brief}`, () => {
		assert.ok(
			fs.existsSync(path.join(SCAFFOLD_ROOT, ".omp", "trio", brief)),
			`缺少 .omp/trio/${brief}`,
		);
	});
}

check("start-agent.sh 使用 arch → arch.rules.md 映射", () => {
	const script = fs.readFileSync(path.join(SCAFFOLD_ROOT, "bin", "start-agent.sh"), "utf8");
	assert.match(script, /arch\)\s*ROLE_BRIEF="arch"/, "start-agent.sh 缺少 arch → arch 的映射");
});

check("start-agent.sh 使用 qa → test.rules.md 映射", () => {
	const script = fs.readFileSync(path.join(SCAFFOLD_ROOT, "bin", "start-agent.sh"), "utf8");
	assert.match(script, /qa\)\s*ROLE_BRIEF="test"/, "start-agent.sh 缺少 qa → test 的映射");
});

check("init-agent.sh 部署 arch.rules.md 到 .omp/trio/", () => {
	const script = fs.readFileSync(path.join(SCAFFOLD_ROOT, "bin", "init-agent.sh"), "utf8");
	assert.match(script, /\.omp\/trio\/arch\.rules\.md/, "init-agent.sh 未部署 arch.rules.md");
});

check("init-agent.sh 部署 test.rules.md 到 .omp/trio/", () => {
	const script = fs.readFileSync(path.join(SCAFFOLD_ROOT, "bin", "init-agent.sh"), "utf8");
	assert.match(script, /\.omp\/trio\/test\.rules\.md/, "init-agent.sh 未部署 test.rules.md");
});

check("已不存在 profiles/pm.rules.md（旧角色已改名）", () => {
	assert.ok(!fs.existsSync(path.join(SCAFFOLD_PROFILES, "pm.rules.md")), "profiles/pm.rules.md 仍存在");
});

// ── 汇总 ───────────────────────────────────────────────────────────────────

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	console.log("\n失败详情：");
	for (const failure of failures) {
		console.log(`  - ${failure.label}`);
		console.log(`    ${failure.error.message}`);
	}
	process.exit(1);
}
console.log("门禁策略契约全部成立。");
