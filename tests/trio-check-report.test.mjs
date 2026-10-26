/**
 * trio-check-report.test.mjs —— 验收报告校验器的回归测试
 *
 * 永久测试：锁定「什么算一份合规的验收报告」这条契约。
 * 校验器本身是门禁的一部分（pre-commit 会调用它），所以它必须自己有测试覆盖 ——
 * 一个零覆盖的机械门禁是「看起来有门禁」的最坏形态。
 *
 * 运行：bun tests/trio-check-report.test.mjs
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import {
	checkText,
	checkName,
	checkCompanions,
	checkT10,
	main,
	VERDICTS,
} from "../bin/trio-check-report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TEMPLATES = path.join(ROOT, "templates");

const GOOD_NAME = "qa-20261025-1510-report-登录改造.md";

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

// ── 夹具 ───────────────────────────────────────────────────────────────────

const GOOD = `# 登录改造 · 验收报告

> 运行环境：bun 1.4.2 / Python 3.12.13
> 基线 commit：3b6f308
> 运行时间：2026-10-25 15:10

| 用例 | 位置 | 结论 | 说明 |
|---|---|---|---|
| AC-1 | — | 通过 | — |
| AC-2 | src/login.py:42 | 半通过 | 期望 200；实际 500；复现 pytest tests/test_login.py::test_ok |
| AC-3 | tests/test_net.py | SKIP | 跳过原因 缺外部网络；解除条件 提供 mock server |

## 汇总

总判定：半通过。覆盖度：对照契约 3 条，通过 1、半通过 1、未通过 0、SKIP 1（SKIP 不计 PASS，单列计账）。
`;

function rules(violations) {
	return new Set(violations.map((violation) => violation.rule));
}

function expectRule(text, rule, name = GOOD_NAME) {
	const found = rules(checkText(name, text));
	assert.ok(found.has(rule), `期望命中 ${rule}，实际 [${[...found].join(",") || "无违规"}]`);
}

// ── 1. 合规路径 ────────────────────────────────────────────────────────────

console.log("\n[合规路径]");

check("完整合规报告零违规", () => {
	assert.deepEqual(checkText(GOOD_NAME, GOOD), []);
});

check("结论值域恰为四值", () => {
	assert.deepEqual(VERDICTS, ["通过", "半通过", "未通过", "SKIP"]);
});

check("templates 目录下的模板文件被豁免", () => {
	const out = main(["--", path.join(TEMPLATES, "report.template.md")]);
	assert.equal(out, 0, "模板应豁免且退出码 0");
});

check("下划线前缀文件被豁免", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	const file = path.join(dir, "_draft.md");
	fs.writeFileSync(file, "anything");
	assert.equal(main(["--", file]), 0);
});

check("相对路径调用可用", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	fs.writeFileSync(path.join(dir, GOOD_NAME), GOOD);
	const cwd = process.cwd();
	process.chdir(dir);
	try {
		assert.equal(main(["--", GOOD_NAME]), 0);
	} finally {
		process.chdir(cwd);
	}
});

// ── 2. CLI 退出码 ──────────────────────────────────────────────────────────

console.log("\n[CLI 退出码]");

check("文件不存在 → exit 2", () => {
	assert.equal(main(["--", "/nonexistent/x.md"]), 2);
});

check("验收清单 → exit 2（清单不是报告）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	const file = path.join(dir, "qa-20261025-1510-checklist-x.md");
	fs.writeFileSync(file, GOOD);
	assert.equal(main(["--", file]), 2);
});

check("违规报告 → exit 1", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	const file = path.join(dir, GOOD_NAME);
	fs.writeFileSync(file, GOOD.replace("| AC-1 | — | 通过 | — |", "| AC-1 | — | PASS | — |"));
	assert.equal(main(["--", file]), 1);
});

// ── 3. T1 命名 ─────────────────────────────────────────────────────────────

console.log("\n[T1 命名]");

check("缺 report 段的文件名被拒", () => {
	assert.deepEqual(rules(checkName("qa-20261025-1510-登录.md")), new Set(["T1"]));
});

check("日期未压缩（带连字符）的文件名被拒", () => {
	assert.deepEqual(rules(checkName("qa-2026-10-25-1510-report-x.md")), new Set(["T1"]));
});

check("未带 qa- 前缀的文件名被拒", () => {
	assert.deepEqual(rules(checkName("arch-20261025-1510-report-x.md")), new Set(["T1"]));
});

// ── 4. T2 表头 ─────────────────────────────────────────────────────────────

console.log("\n[T2 表头]");

check("缺运行环境表头 → T2", () => {
	expectRule(GOOD.replace("> 运行环境：bun 1.4.2 / Python 3.12.13\n", ""), "T2");
});

check("运行环境缺版本号 → T2", () => {
	expectRule(GOOD.replace("bun 1.4.2 / Python 3.12.13", "bun / python"), "T2");
});

check("基线 commit 非十六进制 → T2", () => {
	expectRule(GOOD.replace("3b6f308", "not-a-hash"), "T2");
});

check("汇总后重复表头字段 → T2", () => {
	expectRule(`${GOOD}\n> 运行时间：2026-10-25 15:10\n`, "T2");
});

// ── 5. T3 结果表 ───────────────────────────────────────────────────────────

console.log("\n[T3 结果表]");

check("缺 4 列表头 → T3", () => {
	expectRule(GOOD.replace("| 用例 | 位置 | 结论 | 说明 |", "| 用例 | 结论 |"), "T3");
});

check("缺分隔行 → T3", () => {
	expectRule(GOOD.replace("|---|---|---|---|\n", ""), "T3");
});

// ── 6. T4 / T5 ─────────────────────────────────────────────────────────────

console.log("\n[T4 主键 / T5 位置]");

check("用例列重复 → T4", () => {
	expectRule(GOOD.replace("| AC-3 | tests/test_net.py |", "| AC-2 | tests/test_net.py |"), "T4");
});

check("用例列为空 → T4", () => {
	expectRule(GOOD.replace("| AC-1 | — | 通过 | — |", "|  | — | 通过 | — |"), "T4");
});

check("通过项位置不是 — → T5", () => {
	expectRule(GOOD.replace("| AC-1 | — | 通过 | — |", "| AC-1 | src/a.py:1 | 通过 | — |"), "T5");
});

check("SKIP 项位置为空 → T5", () => {
	expectRule(GOOD.replace("| AC-3 | tests/test_net.py |", "| AC-3 | — |"), "T5");
});

// ── 7. T6 结论值域 ─────────────────────────────────────────────────────────

console.log("\n[T6 结论值域]");

check("PASS/FAIL 第二套词 → T6", () => {
	expectRule(GOOD.replace("| AC-1 | — | 通过 | — |", "| AC-1 | — | PASS | — |"), "T6");
});

check("复测通过 → T6，且提示并入「通过」", () => {
	const violations = checkText(
		GOOD_NAME,
		GOOD.replace("| AC-1 | — | 通过 | — |", "| AC-1 | — | 复测通过 | — |"),
	);
	const hit = violations.find((violation) => violation.rule === "T6");
	assert.ok(hit, "应命中 T6");
	assert.match(hit.message, /复测通过请记「通过」/, "应给出并入「通过」的提示");
});

// ── 8. T7 说明要件 ─────────────────────────────────────────────────────────

console.log("\n[T7 说明要件]");

check("未通过缺 期望/实际/复现 → T7", () => {
	expectRule(
		GOOD.replace("| AC-2 | src/login.py:42 | 半通过 | 期望 200；实际 500；复现 pytest tests/test_login.py::test_ok |", "| AC-2 | src/login.py:42 | 未通过 | 挂了 |"),
		"T7",
	);
});

check("SKIP 缺解除条件 → T7", () => {
	expectRule(
		GOOD.replace("跳过原因 缺外部网络；解除条件 提供 mock server", "跳过原因 缺外部网络"),
		"T7",
	);
});

// ── 9. T8 汇总 ─────────────────────────────────────────────────────────────

console.log("\n[T8 汇总]");

check("总判定与行值推导不一致 → T8", () => {
	expectRule(GOOD.replace("总判定：半通过", "总判定：通过"), "T8");
});

check("SKIP 条数与行值不一致 → T8", () => {
	expectRule(GOOD.replace("SKIP 1（", "SKIP 0（"), "T8");
});

check("SKIP 计入通过 → T8", () => {
	expectRule(GOOD.replace("（SKIP 不计 PASS，单列计账）", "（SKIP 计入通过）"), "T8");
});

check("缺覆盖度 → T8", () => {
	expectRule(GOOD.replace("覆盖度：对照契约 3 条", "对照契约 3 条"), "T8");
});

check("汇总进表格 → T8", () => {
	expectRule(
		GOOD.replace(
			"总判定：半通过。覆盖度：对照契约 3 条，通过 1、半通过 1、未通过 0、SKIP 1（SKIP 不计 PASS，单列计账）。",
			"| 总判定 | 半通过 |\n|---|---|\n| 覆盖度 | 3 条，SKIP 1 不计 PASS |",
		),
		"T8",
	);
});

// ── 10. T9 载体 ────────────────────────────────────────────────────────────

console.log("\n[T9 载体]");

check("存在同名 .csv 伴随文件 → T9", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	const file = path.join(dir, GOOD_NAME);
	fs.writeFileSync(file, GOOD);
	fs.writeFileSync(file.replace(/\.md$/, ".csv"), "a,b\n");
	assert.deepEqual(rules(checkCompanions(file)), new Set(["T9"]));
});

check("无伴随文件 → 零违规", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-rpt-"));
	const file = path.join(dir, GOOD_NAME);
	fs.writeFileSync(file, GOOD);
	assert.deepEqual(checkCompanions(file), []);
});

// ── 11. 模板联动 ───────────────────────────────────────────────────────────

console.log("\n[模板联动]");

check("report.template.md 存在且命名为模板（不占记录命名位）", () => {
	const template = path.join(TEMPLATES, "report.template.md");
	assert.ok(fs.existsSync(template), "缺少 templates/report.template.md");
	assert.match(path.basename(template), /\.template\.md$/, "模板应以 .template.md 结尾");
});

check("填充后的模板可通过校验", () => {
	const template = fs.readFileSync(path.join(TEMPLATES, "report.template.md"), "utf8");
	const filled = template
		.replaceAll("<YYYYMMDD>", "20261025")
		.replaceAll("<HHMM>", "1510")
		.replaceAll("<主题>", "demo")
		.replaceAll("<x.y.z>", "1.0.0")
		.replaceAll("<hash>", "3b6f308")
		.replaceAll("<YYYY-MM-DD HH:MM>", "2026-10-25 15:10")
		.replaceAll("<N>", "1");
	const violations = checkText("qa-20261025-1510-report-demo.md", filled);
	assert.deepEqual(
		violations.map((violation) => `${violation.rule}: ${violation.message}`),
		[],
		"填充后的模板应零违规",
	);
});

// ── 12. T10 路径存在性（TASK-003 / spec §1.5、AC-5/6/7）────────────────────

console.log("\n[T10 路径存在性]");

// fixture：在临时目录建一个带真实文件的树，报告正文用单反引号引用路径。
// 用例同时覆盖 AC-5（基本行为）与 AC-6（边界口径），逐字按 spec §1.5 算法断言。

/**
 * 建一份可过 T1–T9 的最小合法报告正文；`body` 为结果表前面的扩展正文。
 */
function t10Report(body) {
	return `# T10 夹具 · 验收报告

> 运行环境：bun 1.4.2 / git 2.51.0
> 基线 commit：0425e60
> 运行时间：2026-10-25 15:10

${body}

| 用例 | 位置 | 结论 | 说明 |
|---|---|---|---|
| AC-1 | — | 通过 | — |

## 汇总

总判定：通过。覆盖度：对照契约 1 条，通过 1、SKIP 0。
`;
}

check("AC-5a 引用真实存在的路径 → 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
	fs.writeFileSync(path.join(dir, "tests", "x.py"), "def test_x(): pass\n");
	const text = t10Report("见 `tests/x.py`。");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), []);
});

check("AC-5b 引用不存在的路径 → 恰 1 条 T10、规则号/行号/消息逐字", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
	fs.writeFileSync(path.join(dir, "tests", "x.py"), "def test_x(): pass\n");
	const text = t10Report("见 `docs/nope/missing.md`。");
	const violations = checkText(GOOD_NAME, text, dir);
	assert.equal(violations.length, 1, `期望恰 1 条违例，实际 ${JSON.stringify(violations)}`);
	const [violation] = violations;
	assert.equal(violation.rule, "T10");
	const missingLine = text.split("\n").findIndex((l) => l.includes("docs/nope/missing.md")) + 1;
	assert.equal(violation.line, missingLine);
	assert.equal(violation.message, "引用路径不存在：docs/nope/missing.md");
});

check("AC-6a glob 字符 token 不校验 → 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	for (const body of [
		"匹配 `docs/task/*/board.md` 与 `tests/*`。",
		"范围 `tests/?.py` 与字符类 `docs/[a-z].md`。",
	]) {
		assert.deepEqual(checkText(GOOD_NAME, t10Report(body), dir), []);
	}
});

check("AC-6b ::nodeid 与 :行号 剥后缀后校验（存在 → 0；删源 → 恰 1）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	fs.mkdirSync(path.join(dir, "src"), { recursive: true });
	fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
	fs.writeFileSync(path.join(dir, "src", "a.py"), "def f(): pass\n");
	fs.writeFileSync(path.join(dir, "tests", "a.py"), "def test_x(): pass\n");
	const text = t10Report("入口 `tests/a.py::test_x` 与 `src/a.py:42`。");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), [], "两路径存在时应为 0 违例");
	fs.unlinkSync(path.join(dir, "src", "a.py"));
	const violations = checkText(GOOD_NAME, text, dir);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, "T10");
	assert.equal(violations[0].message, "引用路径不存在：src/a.py");
});

check("AC-6c 三反引号 fenced 块内不存在路径 → 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const text = t10Report("示例：\n\n```text\n$ bun bin/trio-check-report.mjs docs/nope/fenced.md\n```\n");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), []);
});

check("AC-6d 非反引号正文出现不存在路径 → 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const text = t10Report("见 docs/nope/bare.md（无反引号）。\n");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), []);
});

check("AC-6e 裸文件名（无四前缀）→ 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const text = t10Report("见 `missing.md` 与 `x.py`。\n");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), []);
});

check("AC-6f 标点包裹 → 剥标点后识别（中文括号 → 恰 1）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const text = t10Report("见 `（src/gone.py）`。\n");
	const violations = checkText(GOOD_NAME, text, dir);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, "T10");
	assert.equal(violations[0].message, "引用路径不存在：src/gone.py");
});

check("spec §3 同行同路径多次出现 → 逐 token 逐条报违例（2 次 → 2 条）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
	fs.writeFileSync(path.join(dir, "tests", "x.py"), "def test_x(): pass\n");
	const text = t10Report("见 `docs/nope/missing.md` 与 `docs/nope/missing.md`。\n");
	const violations = checkText(GOOD_NAME, text, dir);
	assert.equal(violations.length, 2, `期望 2 条（不去重），实际 ${violations.length}`);
	assert.ok(violations.every((v) => v.rule === "T10" && v.message.endsWith("docs/nope/missing.md")));
});

check("spec §3 空报告/仅表头 → T10 0 违例（不新增失败面）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	assert.deepEqual(checkT10([], dir), []);
	assert.deepEqual(checkT10(["| 用例 | 位置 | 结论 | 说明 |", "|---|---|---|---|"], dir), []);
});

check("spec §3 大小写敏感：Docs/ 前缀不识别 → 0 违例", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const text = t10Report("见 `Docs/whatever.md`。\n");
	assert.deepEqual(checkText(GOOD_NAME, text, dir), []);
});

check("第四参 Violation 构造器可注入（审计钩子签名）", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trio-t10-"));
	const seen = [];
	class FakeViolation {
		constructor(line, rule, message) {
			this.line = line;
			this.rule = rule;
			this.message = message;
			seen.push(rule);
		}
	}
	checkT10(["见 `docs/nope/x.md`"], dir, FakeViolation);
	assert.deepEqual(seen, ["T10"]);
});

check("AC-7 CLI --help 行为不变（T1–T10 更新后仍只校验一个文件参数）", () => {
	const out = main(["--", path.join(TEMPLATES, "report.template.md")]);
	assert.equal(out, 0);
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
console.log("验收报告契约全部成立。");
