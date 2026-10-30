/**
 * trio-init-layout.test.mjs —— 安装布局无关化回归（TASK-009 / AC-1..AC-10）
 *
 * 目标：init-agent.sh 的 --dry-run / --layout 映射 / 下游领先保留，
 * 以及 trio-align.sh / trio-selftest.sh 的根自定位。
 * 夹具全部为临时 git 仓，不触碰工作树。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { payload, projectRoot, toolPath } from "./_layout.mjs";

const ROOT = projectRoot();
const INIT = toolPath("init-agent.sh");
const ALIGN = toolPath("trio-align.sh");
// 安装布局用例需要安装器本身；纯消费仓（未携带 init-agent.sh）无此执行件。
if (!INIT) {
	console.log("提示  跳过 trio-init-layout：本仓无 init-agent.sh（安装布局用例不适用）");
	process.exit(0);
}

function hookSrc(name) {
	return payload(`tooling/hooks/${name}`, `templates/${name}`);
}
function templateSrc(name) {
	return payload(`templates/${name}`, `.omp/trio/templates/${name}`);
}
const TEMPLATE_DIRS = [path.join(ROOT, "templates"), path.join(ROOT, ".omp/trio/templates")]
	.filter((dir) => fs.existsSync(dir));
const BIN_HOOK_SRC = payload("templates/pre-commit");
const VALIDATOR = toolPath("trio-check-report.mjs");
assert.ok(VALIDATOR, "未找到 trio-check-report.mjs");
const { checkText } = await import(pathToFileURL(VALIDATOR).href);

// R1 渲染（与 init-agent.sh render_payload 同步）：占位符保护已含前缀的 token。
function render(text) {
	const mark = "\u0001TRIO_MARK\u0001";
	return text
		.replaceAll("tooling/bin/trio-", mark)
		.replace(/(^|[^A-Za-z0-9_.-])bin\/trio-/gu, "$1tooling/bin/trio-")
		.replaceAll(mark, "tooling/bin/trio-");
}

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

const ENV = { ...process.env };
delete ENV.TRIO_ROLE;

function runInit(args) {
	return spawnSync("bash", [INIT, ...args], { encoding: "utf8", env: ENV });
}

function newRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-layout-"));
	spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
	spawnSync("git", ["-C", dir, "config", "user.email", "qa@example.com"]);
	spawnSync("git", ["-C", dir, "config", "user.name", "QA"]);
	return dir;
}

function snap(root) {
	const rows = [];
	const walk = (dir, rel) => {
		for (const name of fs.readdirSync(dir).sort()) {
			if (rel === "" && name === ".git") continue;
			const abs = path.join(dir, name);
			const relPath = rel === "" ? name : `${rel}/${name}`;
			const stat = fs.lstatSync(abs);
			if (stat.isDirectory()) {
				rows.push(`${relPath}/`);
				walk(abs, relPath);
			} else {
				const digest = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
				rows.push(`${relPath}:${stat.size}:${digest}`);
			}
		}
	};
	walk(root, "");
	return rows.sort();
}

function assertPrefixes(out) {
	const planLines = out
		.split("\n")
		.filter((line) => /^  (将创建|将覆盖|将跳过|将保留)/u.test(line));
	assert.ok(planLines.length > 0, "干跑应输出计划行");
	for (const line of planLines) {
		assert.match(line, /^  (将创建|将覆盖|将跳过|将保留)/u, `非计划前缀：${line}`);
	}
	return new Set(planLines.map((line) => /^  (将创建|将覆盖|将跳过|将保留)/u.exec(line)[1]));
}

// ── AC-1 / AC-10 干跑零写入 ────────────────────────────────────────────────

console.log("\n[AC-1 / AC-10 干跑]");

check("AC-1 空仓库干跑：exit 0、汇总含零写入、树快照不变", () => {
	const dir = newRepo();
	try {
		const before = snap(dir);
		const r = runInit([dir, "--dry-run"]);
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /干跑：将新建 \d+ 项，将覆盖 \d+ 项，将跳过 \d+ 项，将保留 \d+ 项（零写入）/u);
		assert.match(r.stdout, /布局：bin（auto）/u);
		assertPrefixes(r.stdout);
		assert.deepEqual(snap(dir), before, "干跑不得写目标树");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-1 已装树干跑四类前缀：创建/覆盖/跳过/保留，快照不变", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir]).status, 0);
		// 将覆盖：改动执行件；将跳过：其余已最新；将保留：下游领先；将创建：删一件。
		fs.appendFileSync(path.join(dir, ".omp/trio/templates/report.template.md"), "\n<!-- local -->\n");
		fs.writeFileSync(path.join(dir, "docs/REPLY-CONVENTIONS.md"), "LOCAL\n");
		fs.rmSync(path.join(dir, ".omp/trio/templates/backflow.template.md"));
		const before = snap(dir);
		const r = runInit([dir, "--dry-run"]);
		assert.equal(r.status, 0, r.stderr);
		const prefixes = assertPrefixes(r.stdout);
		for (const expected of ["将创建", "将覆盖", "将跳过", "将保留"]) {
			assert.ok(prefixes.has(expected), `干跑缺前缀 ${expected}`);
		}
		assert.match(r.stdout, /将保留 docs\/REPLY-CONVENTIONS\.md（下游领先/u);
		assert.deepEqual(snap(dir), before, "干跑不得写目标树");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-10 空仓库 tooling 干跑：不建 tooling/.omp，不写 .git/hooks", () => {
	const dir = newRepo();
	try {
		const r = runInit([dir, "--dry-run", "--layout", "tooling"]);
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /布局：tooling（显式）/u);
		assert.ok(!fs.existsSync(path.join(dir, "tooling")), "不得创建 tooling/");
		assert.ok(!fs.existsSync(path.join(dir, ".omp")), "不得创建 .omp/");
		assert.ok(!fs.existsSync(path.join(dir, ".git/hooks/pre-commit")), "不得写 .git/hooks");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── AC-2 / AC-3 布局判定与非法值 ───────────────────────────────────────────

console.log("\n[AC-2 / AC-3 布局]");

check("AC-2 auto：有 tooling/bin 判 tooling，落点正确", () => {
	const dir = newRepo();
	try {
		fs.mkdirSync(path.join(dir, "tooling/bin"), { recursive: true });
		const r = runInit([dir]);
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /布局：tooling（auto）/u);
		assert.ok(fs.existsSync(path.join(dir, "tooling/bin/trio-check-report.mjs")));
		assert.ok(fs.existsSync(path.join(dir, "tooling/tests/trio-check-report.test.mjs")));
		assert.ok(!fs.existsSync(path.join(dir, "bin/trio-check-report.mjs")));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-2 auto：无 tooling/bin 判 bin，落点正确", () => {
	const dir = newRepo();
	try {
		const r = runInit([dir]);
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /布局：bin（auto）/u);
		assert.ok(fs.existsSync(path.join(dir, "bin/trio-check-report.mjs")));
		assert.ok(fs.existsSync(path.join(dir, "tests/trio-check-report.test.mjs")));
		assert.ok(!fs.existsSync(path.join(dir, "tooling")));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-3 显式 bin 覆盖 auto；显式 tooling 落 tooling 并替换 hook", () => {
	const dir = newRepo();
	try {
		fs.mkdirSync(path.join(dir, "tooling/bin"), { recursive: true });
		if (BIN_HOOK_SRC) {
			assert.equal(runInit([dir, "--layout", "bin"]).status, 0);
			assert.ok(fs.existsSync(path.join(dir, "bin/trio-check-report.mjs")));
			assert.ok(!fs.existsSync(path.join(dir, "tooling/bin/trio-check-report.mjs")));
			const out = fs.readFileSync(path.join(dir, ".git/hooks/pre-push"), "utf8");
			assert.match(out, /VALIDATOR_REL="bin\/trio-check-report\.mjs"/u);
		} else {
			console.log("  - 跳过 bin 交叉布局：本仓无 templates/pre-commit 源（条件注册）");
		}

		const dir2 = newRepo();
		try {
			assert.equal(runInit([dir2, "--layout", "tooling"]).status, 0);
			assert.ok(fs.existsSync(path.join(dir2, "tooling/bin/trio-check-report.mjs")));
			const push = fs.readFileSync(path.join(dir2, ".git/hooks/pre-push"), "utf8");
			assert.match(push, /VALIDATOR_REL="tooling\/bin\/trio-check-report\.mjs"/u);
			assert.ok(!push.includes('VALIDATOR_REL="bin/'), "不得残留旧 VALIDATOR_REL");
			assert.ok(!push.includes("tooling/tooling/bin"), "替换不得叠加");
		} finally {
			fs.rmSync(dir2, { recursive: true, force: true });
		}
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-3 非法/缺值 --layout → exit 2、usage、零写入", () => {
	const dir = newRepo();
	try {
		const before = snap(dir);
		for (const args of [
			[dir, "--layout", "foo"],
			[dir, "--layout", "TOOLING"],
			[dir, "--layout"],
			[dir, "--layout="],
		]) {
			const r = runInit(args);
			assert.equal(r.status, 2, `${args.join(" ")} 应 exit 2`);
			assert.match(r.stderr, /用法/);
		}
		assert.deepEqual(snap(dir), before, "非法参数不得写目标树");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── AC-4 / AC-5 hook 映射 ─────────────────────────────────────────────────

console.log("\n[AC-4 / AC-5 hook]");

check("AC-4 tooling：源副本逐字节同模板，产物路径替换正确", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir, "--layout", "tooling"]).status, 0);
		for (const hook of ["pre-commit", "pre-push", "post-commit"]) {
			const src = fs.readFileSync(path.join(dir, "tooling/hooks", hook), "utf8");
			const tpl = fs.readFileSync(hookSrc(hook), "utf8");
			assert.equal(src, render(tpl), `tooling/hooks/${hook} 应与 render(模板) 相同`);
		}
		const push = fs.readFileSync(path.join(dir, ".git/hooks/pre-push"), "utf8");
		assert.match(push, /VALIDATOR_REL="tooling\/bin\/trio-check-report\.mjs"/u);
		const commit = fs.readFileSync(path.join(dir, ".git/hooks/pre-commit"), "utf8");
		assert.match(commit, /tooling\/bin\/trio-policy-eval\.mjs/u);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-5 bin：hooks 与模板逐字节相同，新增 selftest 可执行", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir, "--layout", "bin"]).status, 0);
		for (const hook of ["pre-commit", "pre-push", "post-commit"]) {
			assert.deepEqual(
				fs.readFileSync(path.join(dir, ".git/hooks", hook)),
				fs.readFileSync(hookSrc(hook)),
				`.git/hooks/${hook} 应与模板逐字节相同`,
			);
		}
		const selftest = path.join(dir, "bin/trio-selftest.sh");
		assert.ok(fs.existsSync(selftest));
		assert.ok((fs.statSync(selftest).mode & 0o111) !== 0, "trio-selftest.sh 应可执行");
		assert.ok(fs.existsSync(path.join(dir, "bin/trio-policy-eval.mjs")));
		assert.ok(fs.existsSync(path.join(dir, "tests/trio-check-report.test.mjs")));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── AC-6 / AC-7 领先保留与幂等 ─────────────────────────────────────────────

console.log("\n[AC-6 / AC-7 覆盖策略]");

check("AC-6 领先文件默认保留，--force 覆盖；policy 不受 --force", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir]).status, 0);
		const reply = path.join(dir, "docs/REPLY-CONVENTIONS.md");
		const board = path.join(dir, ".omp/trio/templates/board.template.md");
		const policy = path.join(dir, ".omp/trio/policy.txt");
		fs.writeFileSync(reply, "LOCAL REPLY\n");
		fs.writeFileSync(board, "LOCAL BOARD\n");
		fs.writeFileSync(policy, "# LOCAL POLICY\n");

		const r = runInit([dir]);
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /保留 docs\/REPLY-CONVENTIONS\.md（下游领先/u);
		assert.match(r.stdout, /保留 \.omp\/trio\/templates\/board\.template\.md（下游领先/u);
		assert.equal(fs.readFileSync(reply, "utf8"), "LOCAL REPLY\n");
		assert.equal(fs.readFileSync(board, "utf8"), "LOCAL BOARD\n");

		const f = runInit([dir, "--force"]);
		assert.equal(f.status, 0, f.stderr);
		assert.deepEqual(fs.readFileSync(reply), fs.readFileSync(path.join(ROOT, "docs/REPLY-CONVENTIONS.md")));
		assert.deepEqual(fs.readFileSync(board), fs.readFileSync(templateSrc("board.template.md")));
		assert.equal(fs.readFileSync(policy, "utf8"), "# LOCAL POLICY\n", "policy 不受 --force 影响");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-7 同布局二次运行：0 创建/0 覆盖、字节不变", () => {
	for (const layout of ["bin", "tooling"]) {
		const dir = newRepo();
		try {
			assert.equal(runInit([dir, "--layout", layout]).status, 0);
			const before = snap(dir);
			const r = runInit([dir, "--layout", layout]);
			assert.equal(r.status, 0, r.stderr);
			assert.match(r.stdout, /完成：新建\/覆盖 0 项，跳过 \d+ 项，失败 0 件。/u);
			assert.deepEqual(snap(dir), before, `${layout} 二次运行字节应不变`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}
});

// ── AC-8 / AC-9 自定位 ────────────────────────────────────────────────────

console.log("\n[AC-8 / AC-9 自定位]");

function makeSourceRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "trio-srcroot-"));
	fs.mkdirSync(path.join(root, ".omp/trio"), { recursive: true });
	fs.copyFileSync(path.join(ROOT, ".omp/trio/policy.txt"), path.join(root, ".omp/trio/policy.txt"));
	return root;
}

if (ALIGN) {
check("AC-8 align 在 bin/ 与 tooling/bin/ 均能定位根", () => {
	const srcRoot = makeSourceRoot();
	const target = newRepo();
	try {
		for (const rel of ["bin", "tooling/bin"]) {
			const dir = path.join(srcRoot, rel);
			fs.mkdirSync(dir, { recursive: true });
			fs.copyFileSync(ALIGN, path.join(dir, "trio-align.sh"));
			const r = spawnSync("bash", [path.join(dir, "trio-align.sh"), "--check", target], {
				encoding: "utf8",
				env: ENV,
			});
			assert.ok([0, 1].includes(r.status), `root=${rel} 退出码 ${r.status}`);
			assert.ok(!r.stderr.includes("上游 policy 不存在"), `${rel}: ${r.stderr}`);
			assert.ok(!r.stderr.includes("无法定位仓库根"), `${rel}: ${r.stderr}`);
		}
	} finally {
		fs.rmSync(srcRoot, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
});

check("AC-8 align 无 policy 目录 → exit 1 + 无法定位仓库根", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-nopolicy-"));
	const target = newRepo();
	try {
		fs.copyFileSync(ALIGN, path.join(dir, "trio-align.sh"));
		const r = spawnSync("bash", [path.join(dir, "trio-align.sh"), "--check", target], {
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(r.status, 1);
		assert.match(r.stderr, /无法定位仓库根：/u);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
});
} else {
	console.log("  - 跳过 AC-8 align 根自定位：本布局无 trio-align.sh（条件注册）");
}

check("AC-8c init-agent 在 tooling/bin/ 自定位根（反馈 ⑫；缺源按 S2 报失败）", () => {
	const srcRoot = makeSourceRoot();
	const target = newRepo();
	try {
		fs.mkdirSync(path.join(srcRoot, "templates"), { recursive: true });
		fs.copyFileSync(hookSrc("pre-commit"), path.join(srcRoot, "templates/pre-commit"));
		const dir = path.join(srcRoot, "tooling/bin");
		fs.mkdirSync(dir, { recursive: true });
		fs.copyFileSync(INIT, path.join(dir, "init-agent.sh"));
		const r = spawnSync("bash", [path.join(dir, "init-agent.sh"), target, "--dry-run"], {
			encoding: "utf8",
			env: ENV,
		});
		// TASK-011 S2/S3：源不完整时 fail-closed，但根自定位必须成功。
		assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
		assert.ok(!r.stderr.includes("无法定位仓库根"), `根误判：${r.stderr}`);
		assert.ok(!r.stderr.includes("缺少 templates/pre-commit"), `根误判：${r.stderr}`);
		assert.match(r.stdout, /布局：/u);
		assert.match(r.stdout, /源缺失/u);
	} finally {
		fs.rmSync(srcRoot, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
});

function pruneSuites(dir, suiteDirRel) {
	for (const rel of ["tests", "tooling/tests"]) {
		const relDir = path.join(dir, rel);
		if (!fs.existsSync(relDir)) continue;
		for (const name of fs.readdirSync(relDir)) {
			if (name.endsWith(".test.mjs")) fs.rmSync(path.join(relDir, name));
		}
	}
	const suiteDir = path.join(dir, suiteDirRel);
	fs.mkdirSync(suiteDir, { recursive: true });
	fs.writeFileSync(path.join(suiteDir, "dummy.test.mjs"), 'console.log("通过 1 项，失败 0 项");\n');
}

check("AC-9 tooling 布局：套件解析到 tooling/tests、校验器可用、install 探针跳过", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir, "--layout", "tooling"]).status, 0);
		pruneSuites(dir, "tooling/tests");
		const r = spawnSync("bash", [path.join(dir, "tooling/bin/trio-selftest.sh"), dir, "--fast"], {
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
		assert.match(r.stdout, /tooling\/tests\/dummy\.test\.mjs/u);
		assert.match(r.stdout, /跳过：未找到 trio-install\.sh（本布局无该件）/u);
		assert.ok(!r.stdout.includes("报告校验器缺失"), "校验器应解析到 tooling/bin");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

if (BIN_HOOK_SRC) check("AC-9 bin 布局：套件解析到 tests/、校验器可用", () => {
	const dir = newRepo();
	try {
		assert.equal(runInit([dir, "--layout", "bin"]).status, 0);
		pruneSuites(dir, "tests");
		const r = spawnSync("bash", [path.join(dir, "bin/trio-selftest.sh"), dir, "--fast"], {
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
		assert.match(r.stdout, /tests\/dummy\.test\.mjs/u);
		assert.ok(!r.stdout.includes("报告校验器缺失"), "校验器应解析到 bin");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── TASK-011 自托管源解析（AC-1..AC-5）─────────────────────────────────────

console.log("\n[TASK-011 自托管源解析]");

const RULES = ["arch.rules.md", "dev.rules.md", "test.rules.md"];
const TOOLS = ["trio-check-report.mjs", "trio-policy-eval.mjs", "trio-selftest.sh"];

function copyInto(src, dest) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
}

/**
 * 自托管夹具：源树按下游等价形态布置。
 * withTemplatesHooks=true 时保留 templates/pre-commit|pre-push（无 post-commit），
 * 用于复现「单件缺失回退」；false 时只剩 tooling/hooks。
 */
function makeSelfHosted({ withTemplatesHooks = true, withTemplatesMd = true } = {}) {
	const root = newRepo();
	copyInto(INIT, path.join(root, "tooling/bin/init-agent.sh"));
	for (const tool of TOOLS) {
		const src = toolPath(tool);
		if (src) copyInto(src, path.join(root, "tooling/bin", tool));
	}
	for (const hook of ["pre-commit", "pre-push", "post-commit"]) {
		copyInto(hookSrc(hook), path.join(root, "tooling/hooks", hook));
	}
	fs.mkdirSync(path.join(root, "tooling/tests"), { recursive: true });
	fs.writeFileSync(path.join(root, "tooling/tests/dummy.test.mjs"), 'console.log("ok");\n');
	for (const rule of RULES) {
		copyInto(path.join(ROOT, ".omp/trio", rule), path.join(root, ".omp/trio", rule));
	}
	copyInto(path.join(ROOT, ".omp/trio/policy.txt"), path.join(root, ".omp/trio/policy.txt"));
	for (const name of fs.readdirSync(path.join(ROOT, ".omp/trio/templates"))) {
		if (!name.endsWith(".md")) continue;
		copyInto(
			path.join(ROOT, ".omp/trio/templates", name),
			path.join(root, ".omp/trio/templates", name),
		);
	}
	copyInto(path.join(ROOT, "docs/REPLY-CONVENTIONS.md"), path.join(root, "docs/REPLY-CONVENTIONS.md"));
	copyInto(
		path.join(ROOT, ".omp/hooks/pre/trio-guard.ts"),
		path.join(root, ".omp/hooks/pre/trio-guard.ts"),
	);
	copyInto(
		path.join(ROOT, ".omp/extensions/trio-session-name.ts"),
		path.join(root, ".omp/extensions/trio-session-name.ts"),
	);
	if (withTemplatesHooks) {
		fs.mkdirSync(path.join(root, "templates"), { recursive: true });
		copyInto(hookSrc("pre-commit"), path.join(root, "templates/pre-commit"));
		copyInto(hookSrc("pre-push"), path.join(root, "templates/pre-push"));
	}
	if (withTemplatesMd) {
		fs.mkdirSync(path.join(root, "templates"), { recursive: true });
		for (const dir of TEMPLATE_DIRS) {
			for (const name of fs.readdirSync(dir)) {
				if (!name.endsWith(".md")) continue;
				copyInto(path.join(dir, name), path.join(root, "templates", name));
			}
		}
	}
	return root;
}

function runSelf(root, args) {
	return spawnSync("bash", [path.join(root, "tooling/bin/init-agent.sh"), ...args], {
		cwd: root,
		encoding: "utf8",
		env: ENV,
	});
}

check("AC-1 自托管 dry-run 全流程：exit 0、六段、汇总、无 sed 报错", () => {
	const root = makeSelfHosted();
	try {
		const before = snap(root);
		const r = runSelf(root, [".", "--dry-run"]);
		const out = `${r.stdout}${r.stderr}`;
		assert.equal(r.status, 0, out);
		for (const section of ["[1/6]", "[2/6]", "[3/6]", "[4/6]", "[5/6]", "[6/6]"]) {
			assert.ok(out.includes(section), `缺段落 ${section}`);
		}
		assert.match(out, /干跑：将新建 \d+ 项，将覆盖 \d+ 项，将跳过 \d+ 项，将保留 \d+ 项（零写入）/u);
		assert.ok(!out.includes("sed:"), "不得出现 sed 报错");
		assert.deepEqual(snap(root), before, "dry-run 零写入");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

check("AC-2 单件 hook 缺失回退 tooling/hooks；产物无双重前缀", () => {
	const root = makeSelfHosted();
	const marker = "# MARKER-TOOLING-POST-COMMIT\n";
	try {
		fs.writeFileSync(path.join(root, "tooling/hooks/post-commit"), marker);
		const dry = runSelf(root, [".", "--dry-run"]);
		assert.equal(dry.status, 0, `${dry.stdout}${dry.stderr}`);
		assert.match(dry.stdout, /将创建  \.git\/hooks\/post-commit/u);

		const real = runSelf(root, [".", "--force"]);
		assert.equal(real.status, 0, `${real.stdout}${real.stderr}`);
		const product = fs.readFileSync(path.join(root, ".git/hooks/post-commit"), "utf8");
		assert.equal(product, marker, "post-commit 应逐字节取 tooling/hooks 源");
		assert.ok(!product.includes("tooling/tooling"), "不得双重前缀");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

check("AC-3 仅自托管源：模板/简报/工具/测试落点 cmp -s", () => {
	const src = makeSelfHosted({ withTemplatesHooks: false, withTemplatesMd: false });
	const target = newRepo();
	try {
		const r = spawnSync("bash", [path.join(src, "tooling/bin/init-agent.sh"), target, "--layout", "tooling"], {
			cwd: src,
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		const pairs = [
			["tooling/bin/trio-check-report.mjs", "tooling/bin/trio-check-report.mjs", false],
			["tooling/tests/dummy.test.mjs", "tooling/tests/dummy.test.mjs", false],
			[".omp/trio/arch.rules.md", ".omp/trio/arch.rules.md", true],
			[".omp/trio/templates/board.template.md", ".omp/trio/templates/board.template.md", true],
		];
		for (const [rel, srcRel, rendered] of pairs) {
			const source = fs.readFileSync(path.join(src, srcRel));
			assert.deepEqual(
				fs.readFileSync(path.join(target, rel)),
				rendered ? Buffer.from(render(source.toString("utf8"))) : source,
				`${rel} 应与${rendered ? " render(源)" : "自托管源"}逐字节相同`,
			);
		}
	} finally {
		fs.rmSync(src, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
});

check("AC-4 hooks 三件源全缺 → exit 1、未找到 hooks 源、零写入", () => {
	const root = makeSelfHosted();
	try {
		for (const hook of ["pre-commit", "pre-push", "post-commit"]) {
			fs.rmSync(path.join(root, "tooling/hooks", hook));
			fs.rmSync(path.join(root, "templates", hook), { force: true });
		}
		const before = snap(root);
		const r = runSelf(root, [".", "--dry-run"]);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /未找到 hooks 源/u);
		assert.deepEqual(snap(root), before, "缺源干跑零写入");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

check("AC-5 已含 tooling/bin 前缀的 hook 源 → 产物 cmp 源、无 tooling/tooling", () => {
	const root = makeSelfHosted();
	const source = '#!/usr/bin/env bash\nreadonly VALIDATOR_REL="tooling/bin/trio-check-report.mjs"\n';
	try {
		fs.writeFileSync(path.join(root, "tooling/hooks/post-commit"), source);
		const r = runSelf(root, [".", "--force"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		const product = fs.readFileSync(path.join(root, ".git/hooks/post-commit"), "utf8");
		assert.equal(product, source, "已含前缀的源应逐字节保留");
		assert.ok(!product.includes("tooling/tooling"), "不得出现 tooling/tooling");
		for (const hook of ["pre-commit", "pre-push"]) {
			const text = fs.readFileSync(path.join(root, ".git/hooks", hook), "utf8");
			assert.ok(!text.includes("tooling/tooling"), `${hook} 不得出现 tooling/tooling`);
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});


// ── TASK-012 安装面渲染与测试面（AC-1..AC-9）─────────────────────────────

console.log("\n[TASK-012 安装面渲染与测试面]");

function fillReportTemplate(file) {
	return fs
		.readFileSync(file, "utf8")
		.replaceAll("<YYYYMMDD>", "20261025")
		.replaceAll("<HHMM>", "1510")
		.replaceAll("<主题>", "demo")
		.replaceAll("<x.y.z>", "1.0.0")
		.replaceAll("<hash>", "3b6f308")
		.replaceAll("<YYYY-MM-DD HH:MM>", "2026-10-25 15:10")
		.replaceAll("<N>", "1")
		.replaceAll("`<用例编号>`", "AC-1");
}

function assertRenderedRefs(file, label) {
	const text = fs.readFileSync(file, "utf8");
	assert.ok(!text.includes("tooling/tooling/"), `${label} 出现 tooling/tooling/`);
	const all = text.match(/bin\/trio-/gu) ?? [];
	const prefixed = text.match(/tooling\/bin\/trio-/gu) ?? [];
	const naked = text.match(/(?<!tooling\/)bin\/trio-/gu) ?? [];
	assert.deepEqual(naked, [], `${label} 存在未加 tooling/ 前缀的 bin/trio-`);
	assert.equal(all.length, prefixed.length, `${label} 的 bin/trio- 计数与前缀计数不一致`);
}

check("AC-1/AC-8 tooling 安装：全部落点渲染，禁词为零，安装件模板可校验", () => {
	const dir = newRepo();
	try {
		const r = runInit([dir, "--layout", "tooling"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		const files = [];
		for (const name of fs.readdirSync(path.join(dir, ".omp/trio/templates"))) {
			if (name.endsWith(".md")) files.push(path.join(dir, ".omp/trio/templates", name));
		}
		for (const role of ["arch", "dev", "test"]) files.push(path.join(dir, `.omp/trio/${role}.rules.md`));
		files.push(path.join(dir, "docs/REPLY-CONVENTIONS.md"));
		for (const hook of ["pre-commit", "pre-push", "post-commit"]) {
			files.push(path.join(dir, "tooling/hooks", hook), path.join(dir, ".git/hooks", hook));
		}
		for (const file of files) assertRenderedRefs(file, file.slice(dir.length + 1));

		const template = path.join(dir, ".omp/trio/templates/report.template.md");
		const violations = checkText("qa-20261025-1510-report-demo.md", fillReportTemplate(template), dir);
		assert.deepEqual(
			violations.map((v) => `${v.rule}: ${v.message}`),
			[],
			"安装件 report.template.md 填充后应零违规",
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-3 已适配源 --force 二次安装 0 覆盖；根 tests 不倒灌 tooling/tests", () => {
	const src = makeSelfHosted();
	const target = newRepo();
	try {
		fs.mkdirSync(path.join(src, "tests"), { recursive: true });
		fs.writeFileSync(path.join(src, "tests", "fail-bleed.test.mjs"), 'console.log("FAIL"); process.exit(1);\n');
		let r = runSelf(src, [target, "--layout", "tooling"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		assert.ok(!fs.existsSync(path.join(target, "tooling/tests/fail-bleed.test.mjs")), "根 tests 被倒灌");
		assert.ok(fs.existsSync(path.join(target, "tooling/tests/dummy.test.mjs")));
		const before = snap(path.join(target, "tooling/tests"));
		r = runSelf(src, [target, "--layout", "tooling", "--force"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		assert.match(r.stdout, /完成：新建\/覆盖 0 项，跳过 \d+ 项，失败 0 件。/u);
		assert.deepEqual(snap(path.join(target, "tooling/tests")), before, "tooling/tests 快照被改写");

		fs.mkdirSync(path.join(target, "tests"), { recursive: true });
		fs.writeFileSync(path.join(target, "tests", "fail-bleed.test.mjs"), 'console.log("FAIL"); process.exit(1);\n');
		fs.writeFileSync(
			path.join(target, "tooling/tests/marked.test.mjs"),
			'// @trio-suite scaffold-only\nconsole.log("FAIL"); process.exit(1);\n',
		);
		const st = spawnSync("bash", [path.join(target, "tooling/bin/trio-selftest.sh"), target, "--fast"], {
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(st.status, 0, `${st.stdout}\n${st.stderr}`);
		assert.match(st.stdout, /提示  忽略 tests\/（1 个 \.test\.mjs，与本布局不符，保留未删除）/u);
		assert.match(st.stdout, /跳过  marked（脚手架自检套件，不适用本仓）/u);
	} finally {
		fs.rmSync(src, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
});

check("AC-4 模板名册并集安装齐全；单件缺源逐件失败不中断", () => {
	const src = makeSelfHosted({ withTemplatesMd: false });
	const target = newRepo();
	const target2 = newRepo();
	try {
		fs.mkdirSync(path.join(src, "templates"), { recursive: true });
		for (const name of fs.readdirSync(path.join(src, ".omp/trio/templates"))) {
			if (name.endsWith(".md")) {
				fs.rmSync(path.join(src, ".omp/trio/templates", name), { force: true });
			}
		}
		copyInto(templateSrc("report.template.md"), path.join(src, "templates/report.template.md"));
		copyInto(templateSrc("bug.template.md"), path.join(src, "templates/bug.template.md"));
		copyInto(templateSrc("board.template.md"), path.join(src, ".omp/trio/templates/board.template.md"));

		let r = runSelf(src, [target, "--layout", "tooling"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		for (const name of ["report.template.md", "bug.template.md", "board.template.md"]) {
			assert.ok(fs.existsSync(path.join(target, ".omp/trio/templates", name)), `缺模板 ${name}`);
		}

		// 单件候选全缺：目录条目仍在名册，但两个候选都不是可读文件。
		fs.rmSync(path.join(src, "templates/bug.template.md"));
		fs.mkdirSync(path.join(src, "templates/bug.template.md"));
		r = runSelf(src, [target2, "--layout", "tooling"]);
		assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
		assert.match(r.stdout, /失败  \.omp\/trio\/templates\/bug\.template\.md：源缺失/u);
		assert.ok(fs.existsSync(path.join(target2, ".omp/trio/templates/report.template.md")), "其余件应继续");
		assert.ok(fs.existsSync(path.join(target2, ".omp/trio/templates/board.template.md")), "其余件应继续");
	} finally {
		fs.rmSync(src, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
		fs.rmSync(target2, { recursive: true, force: true });
	}
});

check("AC-5 首选目录为空时回退另一目录并提示", () => {
	const dir = newRepo();
	try {
		const r = runInit([dir, "--layout", "tooling"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		for (const name of fs.readdirSync(path.join(dir, "tooling/tests"))) {
			if (name.endsWith(".test.mjs")) fs.rmSync(path.join(dir, "tooling/tests", name));
		}
		fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
		fs.writeFileSync(path.join(dir, "tests", "fallback.test.mjs"), 'console.log("通过 1 项，失败 0 项");\n');
		const st = spawnSync("bash", [path.join(dir, "tooling/bin/trio-selftest.sh"), dir, "--fast"], {
			encoding: "utf8",
			env: ENV,
		});
		assert.equal(st.status, 0, `${st.stdout}\n${st.stderr}`);
		assert.match(st.stdout, /提示  tooling\/tests\/ 无套件，回退 tests\/（1 个 \.test\.mjs）/u);
		assert.match(st.stdout, /tests\/fallback\.test\.mjs/u);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-9 tooling 部署面：建 tooling/tests、携带 _layout.mjs、测试逐字节=源", () => {
	const dir = newRepo();
	try {
		const r = runInit([dir, "--layout", "tooling"]);
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		assert.ok(fs.existsSync(path.join(dir, "tooling/tests")), "未创建 tooling/tests");
		assert.ok(!fs.existsSync(path.join(dir, "tests")), "不应再固定创建 tests/");
		assert.ok(fs.existsSync(path.join(dir, "tooling/tests/_layout.mjs")), "未部署 _layout.mjs");
		const srcTests = fs.existsSync(path.join(ROOT, "tooling/tests"))
			? path.join(ROOT, "tooling/tests")
			: path.join(ROOT, "tests");
		for (const name of fs.readdirSync(srcTests)) {
			if (!name.endsWith(".mjs")) continue;
			assert.deepEqual(
				fs.readFileSync(path.join(dir, "tooling/tests", name)),
				fs.readFileSync(path.join(srcTests, name)),
				`${name} 应与源逐字节相同（零渲染）`,
			);
		}
		assert.ok(!fs.existsSync(path.join(dir, "tooling/tests/repro")), "tests/repro 不应部署");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── 汇总 ───────────────────────────────────────────────────────────────────

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	console.log("\n失败详情：");
	for (const { label, error } of failures) {
		console.log(`  - ${label}`);
		console.log(`    ${error.message}`);
	}
	process.exit(1);
}
console.log("安装布局契约全部成立。");
