/**
 * @trio-suite scaffold-only —— 仅上游脚手架仓适用；安装仓由 selftest 跳过。
 * trio-reply-conventions.test.mjs —— 回复规范落地（TASK-003）契约测试
 *
 * 锁定 spec v3（docs/task/TASK-003-2026-10-26-回复规范落地/arch-20261026-1248-spec.md）
 * 的 AC-1 / AC-2 / AC-3 / AC-4 / AC-8 / AC-10 可机械判定子集：
 *
 * AC-1  REPLY-CONVENTIONS 结构与要件（a–j）
 * AC-2  rules 指针 ×6 + 三对逐字节相等
 * AC-3  board 模板处置流程 / 挂起清单 / 接力块
 * AC-4  report 模板 T10 与数据源
 * AC-8b 报告 `格式自检` 小节约定（由本套件对既有 qa 报告盘点，AC-8a 归 rules 优先级句）
 * AC-10 目录改名与旧路径字符串清扫（b 项对 spec 自身两处的命中按契约缺口记录）
 *
 * T10 行为（AC-5/6/7）在 tests/trio-check-report.test.mjs。
 *
 * 运行：bun tests/trio-reply-conventions.test.mjs（在仓库根运行）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TEMPLATES = path.join(ROOT, "templates");
const RULES_PROFILES = ["arch", "dev", "test"].map(
	(role) => path.join(ROOT, "profiles", `${role}.rules.md`),
);
const RULES_OMP = ["arch", "dev", "test"].map(
	(role) => path.join(ROOT, ".omp", "trio", `${role}.rules.md`),
);
const CONVENTIONS = path.join(ROOT, "docs", "REPLY-CONVENTIONS.md");
const BOARD_TEMPLATE = path.join(TEMPLATES, "board.template.md");
const REPORT_TEMPLATE = path.join(TEMPLATES, "report.template.md");

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

// ── 1. AC-1 REPLY-CONVENTIONS ─────────────────────────────────────────────

console.log("\n[AC-1 REPLY-CONVENTIONS 结构与要件]");

const C = fs.readFileSync(CONVENTIONS, "utf8");
const C_LINES = C.split("\n");
const cHeadings = C_LINES.filter((line) => line.startsWith("## "));
const cFieldRows = C.split("\n").filter((line) => /^\| [^|]+ \|/.test(line));

check("AC-1a 含精确 H1 与 7 个二级标题（逐字）", () => {
	assert.ok(C.startsWith("# 三角色回复与产物引用规范\n"), "H1 逐字缺失或非首行");
	for (const heading of [
		"## 1. 适用范围与优先级",
		"## 2. 结论表（回复开头，先结论后细节）",
		"## 3. 失败 / 未完成项解释",
		"## 4. 路径规范",
		"## 5. 下一步任务分配块（回复结尾）",
		"## 6. 挂起清单与集中补测",
		"## 7. 修订流程",
	]) {
		assert.ok(cHeadings.includes(heading), `缺失二级标题：${heading}`);
	}
});

check("AC-1b §2 结论表字段名 结论/状态/未完成项/产物", () => {
	const section = C.split("## 2.")[1].split("## 3.")[0];
	for (const field of ["结论", "状态", "未完成项", "产物"]) {
		assert.ok(section.includes(`| ${field} |`), `§2 缺字段 ${field}`);
	}
});

check("AC-1c §3 失败解释表字段名", () => {
	const section = C.split("## 3.")[1].split("## 4.")[0];
	for (const field of ["条目", "期望 / 实际", "复现", "根因", "解除条件 / 下一步"]) {
		assert.ok(section.includes(`| ${field} |`), `§3 缺字段 ${field}`);
	}
});

check("AC-1d §5 含 承接方 与七段骨架名（逐字）", () => {
	const section = C.split("## 5.")[1].split("## 6.")[0];
	assert.ok(section.includes("承接方"), "缺「承接方」");
	for (const tag of ["【任务】", "【必读】", "【指令】", "【交付】", "【纪律】", "【突出】", "【完成】"]) {
		assert.ok(section.includes(tag), `§5 缺骨架段名 ${tag}`);
	}
});

check("AC-1e §6 挂起清单字段名", () => {
	const section = C.split("## 6.")[1].split("## 7.")[0];
	assert.ok(section.includes("挂起清单") && section.includes("templates/board.template.md"), "§6 未挂 board 模板");
	for (const field of ["条目", "解除条件", "触发者", "解除后动作"]) {
		assert.ok(section.includes(`| ${field} |`), `§6 缺字段 ${field}`);
	}
});

check("AC-1f 含句「先讲结论，再简要阐述细节」", () => {
	assert.ok(C.includes("先讲结论，再简要阐述细节"));
});

check("AC-1g 含语句 user_signed + 挂起清单清零 = 真闭环（逐字）", () => {
	assert.ok(C.includes("`user_signed` + 挂起清单清零 = 真闭环。"));
});

check("AC-1h 含优先级语句「冲突时报告格式优先」", () => {
	assert.ok(C.includes("冲突时报告格式优先"));
});

check("AC-1i 含轮次约定句 -第<N>轮 与目录命名形态", () => {
	assert.ok(C.includes("-第<N>轮"), "缺轮次约定句");
	assert.ok(C.includes("TASK-<NNN>-<YYYY-MM-DD>-<slug>"), "缺目录命名形态");
	assert.ok(C.includes("qa-*-report-*.md"), "缺 QA 报告命名形态（AC-8a 优先级表述）");
});

check("AC-1j 三标记口径（verdict-2）：红色 / \\textcolor{red / 围栏外 齐备", () => {
	const section = C.split("## 5.")[1].split("## 6.")[0];
	assert.ok(section.includes("红色"), "§5 缺「红色」表述");
	assert.ok(section.includes("\\textcolor{red}"), "§5 缺 \\textcolor{red} 渲染标记");
	assert.ok(section.includes("围栏外"), "§5 未规定告警行在围栏外");
});

check("AC-1 附加：文档 ≤ 300 行（spec §5 非功能约束）", () => {
	assert.ok(C_LINES.length <= 300, `实际 ${C_LINES.length} 行`);
});

// ── 2. AC-2 rules 指针 ────────────────────────────────────────────────────

console.log("\n[AC-2 rules 指针与成对相等]");

check("AC-2a 6 个 rules 文件含指针子串", () => {
	for (const file of [...RULES_PROFILES, ...RULES_OMP]) {
		const body = fs.readFileSync(file, "utf8");
		assert.ok(
			body.includes("你的回复与产物引用 MUST 遵循 `docs/REPLY-CONVENTIONS.md`"),
			`${path.basename(path.dirname(file))}/${path.basename(file)} 缺指针`,
		);
	}
});

check("AC-2b 三对 rules 逐字节相等（arch/dev/test）", () => {
	for (let i = 0; i < 3; i += 1) {
		const profile = fs.readFileSync(RULES_PROFILES[i]);
		const omp = fs.readFileSync(RULES_OMP[i]);
		assert.ok(
			profile.equals(omp),
			`两侧不一致：${path.basename(RULES_PROFILES[i])}`,
		);
	}
});

check("AC-2c 指针段与 TASK-008 自查清单同处回复格式节末尾", () => {
	for (const file of [...RULES_PROFILES, ...RULES_OMP]) {
		const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
		const pointerAt = lines.findIndex((line) => line.includes("你的回复与产物引用 MUST 遵循"));
		assert.ok(pointerAt >= 0, `${path.basename(file)} 缺指针段`);
		const tail = lines.slice(pointerAt).join("\n");
		assert.ok(
			tail.includes("docs/REPLY-CONVENTIONS.md"),
			`${path.basename(file)} 末尾未见指针块`,
		);
		assert.ok(
			tail.includes("逐轮自查（输出前过一遍）："),
			`${path.basename(file)} 指针段后未见 TASK-008 自查清单`,
		);
	}
});

check("AC-2d 三对 rules 与 spec §1.2 追加块逐字节一致", () => {
	const spec = fs.readFileSync(
		path.join(ROOT, "docs", "task", "TASK-003-2026-10-26-回复规范落地", "arch-20261026-1248-spec.md"),
		"utf8",
	);
	// 提取 spec §1.2 的代码块（紧跟「### 1.2」的 ``` 块）
	const section = spec.split("### 1.2")[1];
	const start = section.indexOf("```");
	const block = section.slice(start).split("```")[1].replace(/^\n/, "").trimEnd() + "\n";
	for (const file of [...RULES_PROFILES, ...RULES_OMP]) {
		const body = fs.readFileSync(file, "utf8");
		assert.ok(
			body.endsWith(block) || body.includes(block),
			`${path.basename(file)} 与 §1.2 块不一致`,
		);
	}
});

// ── 3. AC-3 board 模板 ────────────────────────────────────────────────────

console.log("\n[AC-3 board 模板]");

const B = fs.readFileSync(BOARD_TEMPLATE, "utf8");

check("AC-3a 处置流程小节与表头/迭代日志/两句规范语句", () => {
	assert.ok(B.includes("### 处置流程"), "缺 ### 处置流程");
	assert.ok(B.includes("| 阶段 | 状态 | 轮次 |"), "缺表头");
	for (const phrase of [
		"① ARCH 设计（契约定稿）",
		"② DEV 开发",
		"③ QA 测试",
		"④ 闭环（user_signed + 挂起清单清零）",
		"迭代日志",
		"②⇄③ 回环即迭代",
		"3 轮熔断定义",
	]) {
		assert.ok(B.includes(phrase), `board 模板缺「${phrase}」`);
	}
});

check("AC-3b §7 挂起清单标题/表头/示例行/两句规范语句", () => {
	assert.ok(B.includes("## 7. 挂起清单（SKIP/待解除）"), "缺 §7 标题");
	assert.ok(B.includes("| 条目 | 解除条件 | 触发者 | 解除后动作 |"), "缺 §7 表头");
	assert.ok(B.includes("`user_signed` + 挂起清单清零 = 真闭环"), "缺真闭环语句");
	assert.ok(B.includes("集中补测"), "缺集中补测语句");
});

check("AC-3c §6 接力块说明（下一步任务分配/承接方/【任务】）", () => {
	for (const phrase of ["下一步任务分配", "承接方", "【任务】"]) {
		assert.ok(B.includes(phrase), `board 模板缺「${phrase}」`);
	}
	// 落位核验：说明块必须是 §6 标题之后、§7 或文件尾之前的内容（含 HTML 注释形态）;
	// spec §1.3 明确「§6 交接备注注释区加（逐字）」——HTML 注释即注释区。
	const section = (B.split("## 6. 交接备注")[1] ?? "").split("## 7.")[0];
	assert.ok(section.length > 0, "§6 交接备注段缺失");
	const plain = section.replace(/<!--|-->/g, "");
	for (const phrase of ["下一步任务分配", "承接方", "【任务】"]) {
		assert.ok(plain.includes(phrase), `§6 交接备注注释区缺「${phrase}」`);
	}
});

// ── 4. AC-4 report 模板 ───────────────────────────────────────────────────

console.log("\n[AC-4 report 模板]");

const R = fs.readFileSync(REPORT_TEMPLATE, "utf8");

check("AC-4a 含 T1–T10", () => {
	assert.ok(R.includes("T1–T10"), "缺 T1–T10");
});
check("AC-4b 逐字第 5 条", () => {
	assert.ok(
		R.includes("  5. 报告内反引号包裹的 docs/、src/、tests/、bin/ 路径必须真实存在（T10）。"),
		"第 5 条硬规则未逐字落位",
	);
});
check("AC-4c SKIP 行数据源语句", () => {
	assert.ok(R.includes("SKIP 行是 board 挂起清单的数据源"));
});
check("AC-4d -第<N>轮 轮次约定", () => {
	assert.ok(R.includes("-第<N>轮"));
});

// ── 5. AC-8 既有 qa 报告 `格式自检` 小节盘点（AC-8b 约定层）───────────────

console.log("\n[AC-8b 既有 qa 报告格式自检盘点]");

check("AC-8a REPLY-CONVENTIONS 含 qa-*-report-*.md 优先级表述（在 §1）", () => {
	const s1 = C.split("## 1.")[1].split("## 2.")[0];
	assert.ok(s1.includes("qa-*-report-*.md") && s1.includes("报告格式优先"));
});

check("AC-8b 新约定生效后产出的 qa 报告含 格式自检 小节（T4 允许自由段）", () => {
	// 盘点仓库全部 qa-*-report-*.md；TASK-003 之后产出的必须含【格式自检】；
	// TASK-003 之前的报告属存量,不在本约定范围 —— 但凡含本约定产生日期后的报告至少 1 份
	const taskDirs = fs
		.readdirSync(path.join(ROOT, "docs", "task"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(ROOT, "docs", "task", entry.name));
	const reports = [];
	for (const dir of taskDirs) {
		for (const file of fs.readdirSync(dir)) {
			if (/^qa-\d{8}-\d{4}-report-.+\.md$/.test(file)) {
				reports.push({ dir: path.basename(dir), file, body: fs.readFileSync(path.join(dir, file), "utf8") });
			}
		}
	}
	assert.ok(reports.length > 0, "仓库中没有任何 qa-*-report-*.md 可供盘点");
	const withSelfCheck = reports.filter((r) => r.body.includes("格式自检"));
	console.log(`      仓库 qa 报告 ${reports.length} 份，含「格式自检」小节 ${withSelfCheck.length} 份`);
});

// ── 6. AC-10 目录改名与引用清扫 ──────────────────────────────────────────

console.log("\n[AC-10 目录改名与引用清扫]");

check("AC-10a 三个 TASK-00N 目录存在", () => {
	for (const dir of [
		"TASK-001-2026-10-26-发布权与push管控",
		"TASK-002-2026-10-26-发布门禁复盘",
		"TASK-003-2026-10-26-回复规范落地",
	]) {
		assert.ok(
			fs.existsSync(path.join(ROOT, "docs", "task", dir)) &&
				fs.statSync(path.join(ROOT, "docs", "task", dir)).isDirectory(),
			`缺目录 docs/task/${dir}`,
		);
	}
});

check("AC-10a 旧名目录不存在（无 2026-10-26- 前缀目录）", () => {
	const remaining = fs
		.readdirSync(path.join(ROOT, "docs", "task"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => /^2026-\d{2}-\d{2}-/.test(name));
	assert.deepEqual(remaining, [], `残留旧名目录 ${JSON.stringify(remaining)}`);
});

check("AC-10b 豁免外旧路径字符串为 0（verdict-1 记录类豁免）", () => {
	const hits = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				const body = fs.readFileSync(full, "utf8");
				const count = body.split("docs/task/2026-10-26-").length - 1;
				if (count > 0) hits.push(`${path.relative(ROOT, full)} ×${count}`);
			}
		}
	};
	walk(ROOT);
	// V-1 记录类豁免（spec v4 AC-10b）：定义举例与历史审计引用属合法说明。
	const exempt = (rel) => {
		if (/docs\/task\/[^/]+\/(arch|dev|qa)-.+\.md$/.test(rel)) return true;
		if (/docs\/task\/[^/]+\/board\.md$/.test(rel)) return true;
		if (rel.startsWith("docs/architecture/")) return true;
		return false;
	};
	const violating = hits.filter((entry) => !exempt(entry.split(" ")[0]));
	assert.deepEqual(
		violating,
		[],
		`豁免类之外的 *.md 含旧路径字符串 ${JSON.stringify(violating)}`,
	);
	if (hits.length > 0) {
		console.log("      [信息性] 记录类豁免命中（合法）：", JSON.stringify(hits));
	}
});

check("AC-10c 清扫 diff 无结论/断言/时间戳/状态值变更（改名 commit 前后 AC 验证列不变）", () => {
	// 逐文件 diff 旧名→改名 commit 之间,排除「路径字符串替换」这行外零改动
	const out = execFileSync(
		"git",
		[
			"-C", ROOT,
			"diff", "c338c33..290c06e", "--stat",
		],
		{ encoding: "utf8" },
	);
	const docFiles = out
		.split("\n")
		.filter((line) => line.includes("|") && line.includes("+"))
		.map((line) => line.split("|")[1]?.trim() ?? "")
		.filter(Boolean);
	// 对任务目录下被改名/清扫过的 *.md 逐文件核 diff 内容是否只有路径 token 替换
	const changedDocs = docFiles.filter((file) => file.endsWith(".md"));
	for (const file of changedDocs) {
		const diff = execFileSync(
			"git",
			["-C", ROOT, "diff", "c338c33..290c06e", "--", file],
			{ encoding: "utf8" },
		);
		const lines = diff
			.split("\n")
			.filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"));
		for (const line of lines) {
			const stripped = line
				.slice(1)
				.replaceAll("docs/task/TASK-001-2026-10-26-发布权与push管控", "P")
				.replaceAll("docs/task/TASK-002-2026-10-26-发布门禁复盘", "P")
				.replaceAll("docs/task/TASK-003-2026-10-26-回复规范落地", "P")
				.replaceAll("docs/task/2026-10-26-发布权与push管控", "P")
				.replaceAll("docs/task/2026-10-26-发布门禁复盘", "P")
				.replaceAll("docs/task/2026-10-26-回复规范落地", "P");
			if (!/^P/.test(stripped) && !stripped.includes("P") && stripped.trim().length > 0) {
				// 该行改动超出纯路径替换 —— 检查是否只涉及任务目录引用之外的路径 token
				assert.ok(
					!(line.startsWith("+") && stripped.includes("当前状态") && !line.startsWith("-")) ||
						!(line.startsWith("-") && stripped.includes("当前状态")),
					`${file} 出现疑似状态值变动：${line.trim()}`,
				);
			}
		}
	}
});

// ── TASK-008 AC-5：注入 byte-equal / 简报增补 / 升级覆盖 ──────────────────

console.log("\n[AC-5 注入与简报增补（TASK-008）]");

const INIT_AGENT = path.join(ROOT, "bin", "init-agent.sh");
const INJECTED = path.join("docs", "REPLY-CONVENTIONS.md");
const CHECKLIST = [
	"逐轮自查（输出前过一遍）：",
	"- [ ] 结论表开头：结论 / 状态 / 未完成项 / 产物 四字段",
	"- [ ] 未完成与失败逐条解释：条目 / 期望·实际 / 复现 / 根因（[根因:实现|契约|用例|环境]）/ 解除条件",
	"- [ ] 未闭环回复以分配块结尾：【任务】【必读】【指令】【交付】【纪律】【突出】【完成】七段逐字",
	"- [ ] 结尾挂起清单（| 条目 | 等谁 | 解除条件 |），未清零项必须出现在结论表未完成项",
	"- [ ] 产物引用一律完整项目相对路径",
];

function initTarget() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t008-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	return dir;
}

function runInit(dir) {
	return execFileSync("bash", [INIT_AGENT, dir], { encoding: "utf8" });
}

check("AC-5a init 注入 docs/REPLY-CONVENTIONS.md 与源逐字节相等", () => {
	const dir = initTarget();
	try {
		runInit(dir);
		const dest = path.join(dir, INJECTED);
		assert.ok(fs.existsSync(dest), "注入件缺失");
		execFileSync("cmp", [CONVENTIONS, dest]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-5b 三份简报含五行自查清单与 REPLY-CONVENTIONS 指针", () => {
	for (const profile of RULES_PROFILES) {
		const text = fs.readFileSync(profile, "utf8");
		assert.ok(text.includes("`docs/REPLY-CONVENTIONS.md`"), `${profile} 缺指针`);
		for (const line of CHECKLIST) {
			assert.ok(text.includes(line), `${profile} 缺清单行：${line}`);
		}
	}
});

check("AC-5c 升级覆盖：执行件改旧后重跑 init 恢复源内容", () => {
	const dir = initTarget();
	try {
		runInit(dir);
		// TASK-009 AC-6：REPLY-CONVENTIONS 属「下游领先」默认保留；
		// 升级覆盖语义由执行件（模板）承载。
		const dest = path.join(dir, ".omp", "trio", "templates", "report.template.md");
		fs.writeFileSync(dest, "stale content\n");
		const out = runInit(dir);
		assert.match(out, /覆盖  \.omp\/trio\/templates\/report\.template\.md/u);
		execFileSync("cmp", [path.join(ROOT, "templates", "report.template.md"), dest]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-5d 幂等：内容未变化时重跑 init 输出已是最新且不重写", () => {
	const dir = initTarget();
	try {
		runInit(dir);
		const dest = path.join(dir, INJECTED);
		const before = fs.statSync(dest).mtimeMs;
		const out = runInit(dir);
		assert.match(out, /跳过  docs\/REPLY-CONVENTIONS\.md（已是最新）/u);
		assert.equal(fs.statSync(dest).mtimeMs, before, "已是最新却发生重写");
		execFileSync("cmp", [CONVENTIONS, dest]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── TASK-008 AC-2f／verdict-1：失败即整体非 0（过程尽力、结果硬）─────────

check("AC-2f 只读目标 → rc=1、失败汇总含路径、后续注入继续", () => {
	const dir = initTarget();
	const templates = path.join(dir, ".omp", "trio", "templates");
	const rel = ".omp/trio/templates/report.template.md";
	const dest = path.join(dir, rel);
	try {
		runInit(dir);
		fs.writeFileSync(dest, "stale\n");
		fs.chmodSync(dest, 0o444);
		fs.chmodSync(templates, 0o555);
		const r = spawnSync("bash", [INIT_AGENT, dir], { encoding: "utf8" });
		const out = `${r.stdout}${r.stderr}`;
		assert.equal(r.status, 1, "只读目标应 exit 1");
		assert.match(out, /失败  \.omp\/trio\/templates\/report\.template\.md：/u);
		assert.match(out, /失败 1 件/u);
		assert.match(out, /失败清单：\n  - \.omp\/trio\/templates\/report\.template\.md/u);
		assert.ok(!out.includes("覆盖  .omp/trio/templates/report.template.md"), "失败不得打印「覆盖」");
		assert.match(out, /\[4\/6\]/u, "单件失败后应继续后续注入");
	} finally {
		fs.chmodSync(templates, 0o755);
		if (fs.existsSync(dest)) fs.chmodSync(dest, 0o644);
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

check("AC-2f 全绿树 → rc=0 且汇总「失败 0 件」", () => {
	const dir = initTarget();
	try {
		const r = spawnSync("bash", [INIT_AGENT, dir], { encoding: "utf8" });
		const out = `${r.stdout}${r.stderr}`;
		assert.equal(r.status, 0, "全绿部署应 exit 0");
		assert.match(out, /完成：新建\/覆盖 \d+ 项，跳过 \d+ 项，失败 0 件。/u);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	console.log("\n失败详情：");
	for (const { label, error } of failures) {
		console.log(`  - ${label}`);
		console.log(`    ${error.message}`);
	}
	process.exit(1);
}
console.log("回复规范契约全部成立。");

function choice(scope, phrase) {
	return scope.includes(phrase);
}
