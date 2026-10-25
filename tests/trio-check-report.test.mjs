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
