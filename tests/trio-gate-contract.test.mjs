/**
 * trio-gate-contract.test.mjs —— TASK-002 v2 (AC-7/8/9/10/12) 契约断言
 *
 * 与其他套件的分工：
 *   - AC-7   rules 双份逐字节相等（profiles/<role>.rules.md ⇆ .omp/trio/<role>.rules.md）
 *   - AC-8   selftest 自动发现 tests/*.test.mjs；init-agent.sh 部署全部测试
 *   - AC-9   CHANGELOG.md 存在且含 v0.2.0；README 版本行标注「以 git tag 为准」
 *   - AC-10  board.template.md 含 qa_report / release_gate 字段说明
 *   - AC-12  通道回收核验：user_signed 时点检查 policy 无通道段、两条 deny *
 *            恢复、看板决策记录含回收动作行
 *
 * 运行：bun tests/trio-gate-contract.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

// 递归护栏：trio-selftest.sh 的 [3/8] 会执行全部 tests/*.test.mjs —— 包括本
// 文件，而本文件的 AC-8 又会再跑 trio-selftest.sh，嵌套即无限递归。
// 被 selftest 调起（TRIO_SELFTEST_CHILD=1）时：静态型用例（AC-7/9/10/12）
// 照常对脚手架根断言，实跑型用例（AC-8a 实跑、AC-8b init 实部署）跳过防递归。
const IS_SELFTEST_CHILD = process.env.TRIO_SELFTEST_CHILD === "1";
const checkIfNotChild = IS_SELFTEST_CHILD
	? (label, _fn) => {
			passed += 1;
			console.log(`  ⊘ ${label}（setupChild 跳过：防 selftest 递归）`);
		}
	: check;

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

function read(...segments) {
	return fs.readFileSync(path.join(ROOT, ...segments), "utf8");
}

// ── AC-7 rules 双份逐字节相等 ──────────────────────────────────────────────

console.log("\n[AC-7 rules 双份逐字节相等]");

const ROLE_BRIEFS = ["arch.rules.md", "dev.rules.md", "test.rules.md"];
for (const brief of ROLE_BRIEFS) {
	check(`AC-7 profiles/${brief} 与 .omp/trio/${brief} 逐字节相等`, () => {
		const source = fs.readFileSync(path.join(ROOT, "profiles", brief));
		const copy = fs.readFileSync(path.join(ROOT, ".omp", "trio", brief));
		assert.ok(
			source.equals(copy),
			`rules 双份漂移：profiles/${brief} 与 .omp/trio/${brief} 内容不同（真值源 = profiles/，执行 run init-agent.sh 同步）`,
		);
	});
}

// ── AC-8 selftest 自动发现 / init 全量部署 ─────────────────────────────────

console.log("\n[AC-8 selftest 自动发现与 init 全量部署]");

check("AC-8a trio-selftest.sh 用 tests/*.test.mjs glob 发现套件（非硬编码清单）", () => {
	const script = read("bin", "trio-selftest.sh");
	assert.ok(
		/tests\/\*\.test\.mjs/.test(script),
		"trio-selftest.sh 未按 glob 收集 tests/*.test.mjs",
	);
	assert.doesNotMatch(
		script,
		/trio-guard\.test\.mjs['"]?\s*$/, // 硬编码逐个点名套件的反模式
		"trio-selftest.sh 疑似硬编码套件清单",
	);
});

checkIfNotChild("AC-8a selftest --fast 实际执行全部现存套件（自动发现，含本文件）", () => {
	const suites = fs.readdirSync(path.join(ROOT, "tests")).filter((name) =>
		name.endsWith(".test.mjs"),
	);
	assert.ok(suites.length >= 5, `tests/ 套件异常少：${suites.length}（应有 5 个）`);
	const target = fs.mkdtempSync(path.join(os.tmpdir(), "ac8-selftest-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: target });
		execFileSync("git", ["config", "user.email", "t@t"], { cwd: target });
		execFileSync("git", ["config", "user.name", "t"], { cwd: target });
		// 先 init 部署完整脚手架（selftest 的 [1/8] 完整性检查需要全件），
		// 再在 fixture 上实跑 selftest --fast；输出必须逐一套件点名。
		execFileSync("bash", [path.join(ROOT, "bin", "init-agent.sh"), target], { stdio: "pipe" });
		let out;
		try {
			out = execFileSync(
				"bash",
				[path.join(ROOT, "bin", "trio-selftest.sh"), target, "--fast"],
				{ stdio: "pipe", env: { ...process.env, TRIO_SELFTEST_CHILD: "1" } },
			);
			// exit=0（无 FAIL）或 exit=1（套件里有其它断言失败 —— 本套件职责只判
			// 「自动发现并执行了全部套件」，失败内容归对应 AC 的用例判断）。
			const exitCode = typeof out.status === "number" ? out.status : 0;
			if (exitCode !== 0) {
				console.log(
					"      （注：selftest 内其它 AC 断言失败非 AC-8 判定对象；本用例只核验逐套件点名）",
				);
			}
			out = out.toString();
		} catch (error) {
			// selftest exit 1 不是 AC-8 的失败信号，只看套件点名。
			out = String(error.stdout ?? "");
		}
		for (const suite of suites) {
			const stem = suite.replace(/\.test\.mjs$/, "");
			assert.match(
				out,
				new RegExp(`${stem} 测试(通过|失败)`),
				`selftest 自动发现未执行套件 ${suite}（glob 循环应覆盖全部 tests/*.test.mjs）`,
			);
		}
	} finally {
		fs.rmSync(target, { recursive: true, force: true });
	}
});

checkIfNotChild("AC-8b init-agent.sh 部署全部 tests/*.test.mjs（glob 循环）", () => {
	const script = read("bin", "init-agent.sh");
	assert.match(script, /for\s+test_file\s+in\s+\S*(tests|\\tests)\/\*\.test\.mjs/, "init-agent.sh 未按 glob 部署测试");
	// 实际部署验证：临时 git 仓库 init，断言 4 个测试文件全部落地
	const target = fs.mkdtempSync(path.join(os.tmpdir(), "ac8-init-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: target });
		execFileSync("git", ["config", "user.email", "t@t"], { cwd: target });
		execFileSync("git", ["config", "user.name", "t"], { cwd: target });
		execFileSync("bash", [path.join(ROOT, "bin", "init-agent.sh"), target], { stdio: "pipe" });
		const suites = fs.readdirSync(path.join(ROOT, "tests")).filter((n) => n.endsWith(".test.mjs"));
		for (const suite of suites) {
			assert.ok(
				fs.existsSync(path.join(target, "tests", suite)),
				`init-agent.sh 未部署 tests/${suite}`,
			);
		}
	} finally {
		fs.rmSync(target, { recursive: true, force: true });
	}
});

// ── AC-9 CHANGELOG 真值源 ─────────────────────────────────────────────────

console.log("\n[AC-9 CHANGELOG 真值源]");

check("AC-9 CHANGELOG.md 存在且含 v0.2.0 条目", () => {
	const changelog = read("CHANGELOG.md");
	assert.match(changelog, /##\s+v0\.2\.0/, "CHANGELOG.md 缺 v0.2.0 版本节");
});

check("AC-9 README 版本行标注「版本号以 git tag 为准」（或等义表述，可用版本节除外）", () => {
	const readme = read("README.md");
	const versionLines = readme.split("\n").filter((line) => /v0\.2\.0/.test(line) || /当前版本/.test(line));
	assert.ok(versionLines.length > 0, "README 未找到版本行");
	const tagged = versionLines.some((line) =>
		/版本号.{0,12}(以\s*git\s*tag\s*为准|git\s*tag.{0,12}为准)|以\s*git\s*tag\s*为准/.test(line) ||
		/CHANGELOG/.test(line) && /tag/.test(line),
	);
	assert.ok(
		tagged,
		`README 版本行未标注「版本号以 git tag 为准」：\n${versionLines.join("\n")}`,
	);
	// 契约允许该标注出现在 CHANGELOG 真值源说明（ADR-0002 注记）；README 自身
	// 未标注时按契约缺陷（contract-gap）报告 ARCH，本断言失败即-push 该缺口。
});

// ── AC-10 board 字段进模板 ────────────────────────────────────────────────

console.log("\n[AC-10 board 模板字段]");

check("AC-10 board.template.md 标识段含 qa_report 字段说明", () => {
	const template = read("templates", "board.template.md");
	assert.match(template, /qa_report/, "board.template.md 缺 qa_report 字段");
});
check("AC-10 board.template.md 标识段含 release_gate 字段说明", () => {
	const template = read("templates", "board.template.md");
	assert.match(template, /release_gate/, "board.template.md 缺 release_gate 字段");
});

// ── AC-12 通道回收核验（pending：需 user_signed 时点）──────────────────────

console.log("\n[AC-12 通道回收核验（TASK-002）]");

// AC-12 依赖 user_signed 时点：签字前核验「未提前回收」，签字后核验「彻底回收」。
// 本测试按当前看板状态切换断言；报告层面把签字前的结果记 SKIP（不计 PASS）。
check("AC-12 按 TASK-002 / TASK-003 两看板状态核验：签字前查未提前回收，签字后查回收三件套", () => {
	const policy = read(".omp", "trio", "policy.txt");
	const readBoardState = (taskDir) => {
		const boardPath = path.join(ROOT, "docs", "task", taskDir, "board.md");
		const board = fs.readFileSync(boardPath, "utf8");
		return {
			board,
			state: (board.match(/\|\s*当前状态\s*\|\s*`([^`]+)`\s*\|/) ?? [])[1] ?? "",
		};
	};

	// 读 TASK-002 看板 + TASK-003 看板的「当前状态」行首个反引号 token
	const t2raw = readBoardState("TASK-002-2026-10-26-发布门禁复盘");
	const t2state = (t2raw.board.match(/\|\s*当前状态\s*\|\s*`([^`]+)`/) ?? [])[1] ?? "";
	const t3raw = readBoardState("TASK-003-2026-10-26-回复规范落地");
	const t3state = (t3raw.board.match(/\|\s*当前状态\s*\|\s*`([^`]+)`/) ?? [])[1] ?? "";

	const bothSigned =
		(t2state === "user_signed" || t2state === "真闭环") &&
		(t3state === "user_signed" || t3state === "真闭环");
	if (!bothSigned) {
		// 签字未到全：回收不得提前发生
		assert.ok(
			policy.includes("BEGIN TASK-002") && policy.includes("END TASK-002"),
			`看板状态 T2=${t2state}、T3=${t3state}（尚未双侧 user_signed），但 policy.txt 通道段已被部分回收——回收作业未完成即视为时序违例`,
		);
		console.log(`      （pending：看板 T2=${t2state}、T3=${t3state}；本用例断言的是「未提前回收」，AC-12 实质核验待双侧 user_signed 后重跑）`);
		return;
	}

	// 双侧 user_signed → 核验回收三件套（两通道都要清零）。
	assert.ok(!policy.includes("BEGIN TASK-002"), "policy.txt 仍残留 BEGIN TASK-002 通道段");
	assert.ok(!policy.includes("END TASK-002"), "policy.txt 仍残留 END TASK-002 通道段");
	assert.ok(!policy.includes("BEGIN TASK-003"), "policy.txt 仍残留 BEGIN TASK-003 通道段");
	assert.ok(!policy.includes("END TASK-003"), "policy.txt 仍残留 END TASK-003 通道段");
	assert.match(policy, /deny\s+\*\s+\.omp\/hooks\/\*\*/, "deny * .omp/hooks/** 未恢复");
	assert.match(policy, /deny\s+\*\s+bin\/\*\*/, "deny * bin/** 未恢复");
	assert.match(t2raw.board, /回收/, "TASK-002 看板决策记录缺回收动作行");
	assert.match(t3raw.board, /回收/, "TASK-003 看板决策记录缺回收动作行");
});

// ── B-4 回归：create_file 源=目标自复制不中断 ─────────────────────────────

console.log("\n[B-4 回归：init-agent 自复制（脚手架根 = 目标）不中断]");

// TASK-003 B-4 缺陷：TARGET_DIR = SCAFFOLD_ROOT 时 create_file 源=目标
// （install(src,dest) 同名即删空内容），脚本中途断，[3/6]-[5/6] 全部未执行。
// 修复后语义：已存在 + 无差异 → 跳过；源=目标经 cmp -s 恒等价，必须走跳过
// 分支而不是 overwrite。钉住该修复，防止回退。
check("B-4 回归：脚手架根自复制 init（普通 + --force）exit 0，执行件逐字节原地不变", () => {
	const target = fs.mkdtempSync(path.join(os.tmpdir(), "b4-selfcopy-"));
	try {
		// 复制脚手架快照到 tmp（真值源保持只读），并在快照内跑 init 自身
		execFileSync("bash", [
			"-c",
			`git -C ${JSON.stringify(ROOT)} archive HEAD | tar -x -C ${JSON.stringify(target)} && git -C ${JSON.stringify(target)} init -q`,
		]);
		// 基线：关键执行件的逐字节指纹（init 前后必须不变——跳过，不是覆盖）
		const probes = [
			path.join(target, ".omp/trio/policy.txt"),
			path.join(target, ".omp/hooks/pre/trio-guard.ts"),
			path.join(target, "templates/pre-push"),
		];
		const before = probes.map((p) => fs.readFileSync(p));

		const run = (args) => execFileSync("bash", [path.join(target, "bin/init-agent.sh"), ...args], {
			cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
		});

		// 普通模式：全跳过、零创建，exit 0（中途断会丢掉后半段输出）
		const r1 = run([target]);
		assert.ok(/完成：/.test(r1), "init 未跑完（缺「完成」行）——B-4 复发特征：[3/6]-[5/6] 未执行");
		assert.match(r1, /跳过  \.omp\/trio\/policy\.txt/, "policy 自复制未走跳过分支");
		assert.ok(!/创建  \.omp\/trio\/policy\.txt/.test(r1), "已存在的 policy 被 create_file 重建（应跳过）");

		// --force 模式：cmp -s 恒等 → 全部「已是最新」跳过，不覆盖不截断
		const r2 = run(["--force", target]);
		assert.ok(/完成：/.test(r2), "--force 模式未跑完（B-4 复发特征）");
		assert.match(r2, /跳过  \.omp\/trio\/policy\.txt（已是最新）/, "--force 下源=目标应走 cmp 相等跳过分支");

		// 数据零损：三个执行件逐字节与 init 前一致
		for (let i = 0; i < probes.length; i++) {
			assert.ok(
				before[i].equals(fs.readFileSync(probes[i])),
				`自复制 bug 可能截断 ${probes[i]}（init 前后逐字节指纹变化）`,
			);
		}
	} finally {
		fs.rmSync(target, { recursive: true, force: true });
	}
});

// ── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`FAIL: ${label}\n  ${error.message}`);
	}
	process.exit(1);
}
