#!/usr/bin/env bun
/**
 * trio-check-report.mjs —— 验收报告的机械校验器
 *
 * 为什么需要它：验收报告是「任务通过」的唯一凭据。如果它可以自由书写，
 * 就会出现「SKIP 计入 PASS」「总判定与逐条结论不一致」这类假绿 ——
 * 这类事故在迁移来源仓真实发生过（22 项 SKIP 被计为 passed）。
 *
 * 规则（T1–T10）：
 *   T1 文件名     qa-<YYYYMMDD>-<HHMM>-report-<主题>.md
 *   T2 表头       运行环境 / 基线 commit / 运行时间 各一次，且运行时间与文件名同源
 *   T3 结果表     唯一 4 列表头 用例|位置|结论|说明 + 分隔行 + 至少一行
 *   T4 主键       用例非空且不重复
 *   T5 位置       通过 → '—'；其余 → 必填（文件:行 或 函数）
 *   T6 结论值域   通过 / 半通过 / 未通过 / SKIP（复测通过并入「通过」并注明轮次）
 *   T7 说明要件   未通过/半通过 → 期望/实际/复现；SKIP → 跳过原因/解除条件
 *   T8 汇总       非表格短文；总判定须与行值机械推导一致；SKIP 单列计账
 *   T9 载体       仅 Markdown，禁伴随 .json/.csv/.xlsx/.parquet
 *   T10 路径     反引号 docs//src//tests//bin/ 路径必须真实存在
 *   T11 根因     结论为「未通过」的说明必须含 [根因:实现]/[根因:契约]/[根因:用例]/[根因:环境] 之一
 *                （ADR-0013 §2.3：无分类不计熔断轮，机检件即本规则）
 *
 * 用法：
 *   bun bin/trio-check-report.mjs docs/task/<slug>/qa-20261025-1510-report-x.md
 *
 * 退出码：0 合规 / 1 有违规 / 2 用法或读取失败（清单亦归此类）
 *
 * 注意：所有正则用 [0-9] 而非 \d —— Python 的 \d 匹配 Unicode 数字，
 * JS 的 \d 只匹配 ASCII；显式写出区间，避免移植时语义漂移。
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** 结论值域。四值 —— '复测通过' 不是独立结论，而是「通过」的一个轮次注记。 */
export const VERDICTS = ["通过", "半通过", "未通过", "SKIP"];

export const TABLE_HEADER = ["用例", "位置", "结论", "说明"];

/** 位置列在「通过」时允许的占位符。 */
const PLACEHOLDERS = new Set(["—", "-"]);

const COMPANION_SUFFIXES = [".json", ".csv", ".xlsx", ".parquet"];

/** T1 命名：qa-YYYYMMDD-HHMM-report-<主题>.md */
const NAMING = /^qa-(?<date>[0-9]{8})-(?<hhmm>[0-9]{4})-report-(?<topic>.+)\.md$/;

/** T2 运行时间：YYYY-MM-DD HH:MM */
const RUN_TIME = /(?<date>[0-9]{4}-[0-9]{2}-[0-9]{2})\s+(?<hh>[0-9]{1,2}):(?<mm>[0-9]{2})/;

/** T2 运行环境：须含至少一个 x.y 形态的版本号（Python 3.12.13 / bun 1.4.2 / Node 22.0.0） */
const ENV_VERSION = /[0-9]+\.[0-9]+/;

/** T2 基线 commit：7–40 位十六进制 */
const COMMIT = /\b[0-9a-f]{7,40}\b/;

/** T8 总判定 */
const TOTAL_VERDICT = /总判定[：:]\s*\**\s*(半通过|未通过|通过)/;

/** T8 SKIP 条数 */
const SKIP_COUNT = /SKIP\s*([0-9]+)/;

/** T11 未通过行的根因分类标签（ADR-0013 §2.3）。 */
export const ROOT_CAUSE_TAGS = ["[根因:实现]", "[根因:契约]", "[根因:用例]", "[根因:环境]"];

/** T8 禁止把 SKIP 当作通过 */
const SKIP_AS_PASS = /SKIP[^\n]{0,16}(计入|算作|视为)\s*通过/;

/** 表格分隔行单元格：--- / :--- / ---: / :---: */
const SEPARATOR_CELL = /^:?-{3,}:?$/;

export class Violation {
	constructor(line, rule, message) {
		this.line = line;
		this.rule = rule;
		this.message = message;
	}

	render(name) {
		return `${name}:${this.line} [${this.rule}] ${this.message}`;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown 表格工具
// ─────────────────────────────────────────────────────────────────────────────

function cells(line) {
	const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return body.split("|").map((cell) => cell.trim());
}

function isTableRow(line) {
	const stripped = line.trim();
	return stripped.startsWith("|") && stripped.endsWith("|");
}

function findFirstTable(lines) {
	return lines.findIndex((line) => isTableRow(line));
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 · 文件名
// ─────────────────────────────────────────────────────────────────────────────

export function checkName(filePath) {
	const name = path.basename(filePath);
	if (NAMING.test(name)) return [];
	return [
		new Violation(
			0,
			"T1",
			`文件名不合规：${name}（应为 qa-<YYYYMMDD>-<HHMM>-report-<主题>.md）`,
		),
	];
}

// ─────────────────────────────────────────────────────────────────────────────
// T2 · 表头
// ─────────────────────────────────────────────────────────────────────────────

export function checkHeader(lines, firstTable, filePath) {
	const out = [];
	const labels = [
		["运行环境", "运行环境"],
		["基线 commit", "基线 commit"],
		["运行时间", "运行时间"],
	];
	const found = new Map();

	for (const [label] of labels) {
		const hits = [];
		lines.forEach((line, index) => {
			if (line.includes(label)) hits.push(index);
		});
		if (hits.length === 0) {
			out.push(new Violation(1, "T2", `缺表头字段：${label}`));
			continue;
		}
		const beforeTable = hits.filter((index) => index < firstTable);
		if (beforeTable.length === 0) {
			out.push(new Violation(hits[0] + 1, "T2", `表头字段 ${label} 未出现在结果表之前`));
		} else if (beforeTable.length > 1) {
			out.push(
				new Violation(
					beforeTable[1] + 1,
					"T2",
					`表头字段 ${label} 在表头区出现 ${beforeTable.length} 次（应一次）`,
				),
			);
		}
		// 表头字段不得逐行重复（`>` 引用行形式）—— 那是把环境信息摊到每一行。
		const repeated = hits.filter(
			(index) => index >= firstTable && lines[index].trimStart().startsWith(">"),
		);
		if (repeated.length > 0) {
			out.push(
				new Violation(repeated[0] + 1, "T2", `表头字段 ${label} 在结果表之后重复出现（MUST NOT 逐行重复）`),
			);
		}
		found.set(label, hits[0]);
	}

	const envAt = found.get("运行环境");
	if (envAt !== undefined && !ENV_VERSION.test(lines[envAt])) {
		out.push(new Violation(envAt + 1, "T2", "运行环境缺版本号（形如 Python 3.12.13 / bun 1.4.2）"));
	}

	const commitAt = found.get("基线 commit");
	if (commitAt !== undefined && !COMMIT.test(lines[commitAt])) {
		out.push(new Violation(commitAt + 1, "T2", "基线 commit 缺 hash（7–40 位十六进制）"));
	}

	const timeAt = found.get("运行时间");
	if (timeAt !== undefined) {
		const stamp = RUN_TIME.exec(lines[timeAt]);
		if (stamp === null) {
			out.push(new Violation(timeAt + 1, "T2", "运行时间缺日期时刻（形如 2026-10-22 14:30）"));
		} else {
			const name = NAMING.exec(path.basename(filePath));
			if (name !== null) {
				const { date, hhmm } = name.groups;
				const expectedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
				const expectedTime = `${expectedDate} ${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
				const actualDate = stamp.groups.date;
				const actualTime = `${actualDate} ${String(Number(stamp.groups.hh)).padStart(2, "0")}:${stamp.groups.mm}`;
				if (actualTime !== expectedTime) {
					out.push(
						new Violation(
							timeAt + 1,
							"T2",
							`文件名时间戳与表头运行时间不同源：${expectedTime} vs ${actualTime}`,
						),
					);
				}
			}
		}
	}

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// T3 · 结果表形态
// ─────────────────────────────────────────────────────────────────────────────

export function checkResultTable(lines) {
	const out = [];
	const headerIndexes = [];
	lines.forEach((line, index) => {
		if (isTableRow(line) && cells(line).join("|") === TABLE_HEADER.join("|")) {
			headerIndexes.push(index);
		}
	});

	if (headerIndexes.length === 0) {
		const near = lines.findIndex((line) => isTableRow(line) && cells(line).includes("结论"));
		const detail = near >= 0 ? `（发现近似表头：${lines[near].trim()}）` : "";
		return {
			violations: [
				new Violation(1, "T3", `缺 4 列结果表表头 | 用例 | 位置 | 结论 | 说明 |${detail}`),
			],
			rows: [],
			headerIndex: -1,
		};
	}

	if (headerIndexes.length > 1) {
		out.push(
			new Violation(
				headerIndexes[1] + 1,
				"T3",
				`结果表表头重复 ${headerIndexes.length} 次（一份报告只应有一张结果表）`,
			),
		);
	}

	const head = headerIndexes[0];
	const separator = lines[head + 1];
	if (separator === undefined || !isTableRow(separator) || !cells(separator).every((c) => SEPARATOR_CELL.test(c))) {
		out.push(new Violation(head + 2, "T3", "结果表缺分隔行（|---| 形式）"));
	}

	const rows = [];
	let index = head + 2;
	while (index < lines.length && isTableRow(lines[index])) {
		const rowCells = cells(lines[index]);
		if (rowCells.length !== TABLE_HEADER.length) {
			out.push(new Violation(index + 1, "T3", `结果行 ${rowCells.length} 列（应为 4 列）`));
		} else {
			rows.push({ line: index + 1, cells: rowCells });
		}
		index += 1;
	}

	if (rows.length === 0) {
		out.push(new Violation(head + 2, "T3", "结果表无数据行"));
	}

	return { violations: out, rows, headerIndex: head };
}

// ─────────────────────────────────────────────────────────────────────────────
// T4–T7 · 逐行要件
// ─────────────────────────────────────────────────────────────────────────────

export function checkRows(rows) {
	const out = [];
	const seen = new Map();

	for (const { line, cells: [caseId, location, verdict, note] } of rows) {
		// T4 主键
		if (!caseId || PLACEHOLDERS.has(caseId)) {
			out.push(new Violation(line, "T4", "用例列必填（主键不得为空）"));
		} else if (seen.has(caseId)) {
			out.push(
				new Violation(line, "T4", `用例主键重复：${caseId}（首次出现于第 ${seen.get(caseId)} 行）`),
			);
		} else {
			seen.set(caseId, line);
		}

		// T6 结论值域
		if (!VERDICTS.includes(verdict)) {
			const hint =
				verdict === "复测通过"
					? "（复测通过请记「通过」并在说明中注明第 N 轮复测）"
					: /\b(PASS|FAIL)\b/.test(verdict)
						? "（勿混用 PASS/FAIL 第二套词）"
						: "";
			out.push(
				new Violation(
					line,
					"T6",
					`结论值域非法：${verdict || "(空)"}，仅允许 ${VERDICTS.join("/")}${hint}`,
				),
			);
			continue;
		}

		// T5 位置
		if (verdict === "通过") {
			if (!PLACEHOLDERS.has(location)) {
				out.push(new Violation(line, "T5", "结论为通过时位置应填 —"));
			}
		} else if (!location || PLACEHOLDERS.has(location)) {
			out.push(new Violation(line, "T5", `结论为${verdict}时位置必填（文件:行 / 函数）`));
		}

		// T11 根因分类（仅「未通过」强制；ADR-0013 §2.3）
		if (verdict === "未通过" && !ROOT_CAUSE_TAGS.some((tag) => note.includes(tag))) {
			out.push(
				new Violation(
					line,
					"T11",
					`结论为未通过时说明缺根因分类（${ROOT_CAUSE_TAGS.join(" / ")} 之一）`,
				),
			);
		}

		// T7 说明要件
		if (verdict === "未通过" || verdict === "半通过") {
			const missing = ["期望", "实际", "复现"].filter((token) => !note.includes(token));
			if (missing.length > 0) {
				out.push(new Violation(line, "T7", `结论为${verdict}时说明缺：${missing.join("/")}`));
			}
		} else if (verdict === "SKIP") {
			const missing = ["跳过原因", "解除条件"].filter((token) => !note.includes(token));
			if (missing.length > 0) {
				out.push(new Violation(line, "T7", `SKIP 时说明缺：${missing.join("/")}`));
			}
		}
	}

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// T8 · 汇总
// ─────────────────────────────────────────────────────────────────────────────

export function checkSummary(lines, rows) {
	const starts = [];
	lines.forEach((line, index) => {
		if (/^#{1,6}\s+.*汇总/.test(line)) starts.push(index);
	});

	if (starts.length === 0) {
		return [new Violation(1, "T8", "缺汇总段（总判定 + 覆盖度，一句话短文）")];
	}

	const out = [];
	const body = lines.slice(starts[0] + 1);

	const firstTable = body.findIndex((line) => isTableRow(line));
	if (firstTable >= 0) {
		out.push(
			new Violation(starts[0] + firstTable + 2, "T8", "汇总 MUST NOT 进表格（一句话短文 + 数字）"),
		);
	}

	const text = body.join("\n");
	const verdicts = rows.map((row) => row.cells[2]);

	// 机械推导：未通过 > 半通过 > 通过
	const derived = verdicts.includes("未通过")
		? "未通过"
		: verdicts.includes("半通过")
			? "半通过"
			: "通过";

	const declared = TOTAL_VERDICT.exec(text);
	if (declared === null) {
		out.push(new Violation(starts[0] + 1, "T8", "汇总缺「总判定：<通过/半通过/未通过>」"));
	} else if (declared[1] !== derived) {
		out.push(
			new Violation(
				starts[0] + 1,
				"T8",
				`汇总总判定「${declared[1]}」与行值推导「${derived}」不一致`,
			),
		);
	}

	if (!text.includes("覆盖度")) {
		out.push(new Violation(starts[0] + 1, "T8", "汇总缺覆盖度对照结论"));
	}
	if (!text.includes("SKIP")) {
		out.push(new Violation(starts[0] + 1, "T8", "汇总未单列 SKIP 计账"));
	}
	if (!/[0-9]/.test(text)) {
		out.push(new Violation(starts[0] + 1, "T8", "汇总缺数字（覆盖度需给计数）"));
	}

	const skipRows = verdicts.filter((verdict) => verdict === "SKIP").length;
	if (skipRows > 0) {
		const match = SKIP_COUNT.exec(text);
		if (match === null) {
			out.push(new Violation(starts[0] + 1, "T8", `汇总未给出 SKIP 条数（实际 ${skipRows}）`));
		} else if (Number(match[1]) !== skipRows) {
			out.push(
				new Violation(
					starts[0] + 1,
					"T8",
					`汇总 SKIP 条数 ${match[1]} 与行值 ${skipRows} 不一致`,
				),
			);
		}
	}

	if (SKIP_AS_PASS.test(text)) {
		out.push(new Violation(starts[0] + 1, "T8", "SKIP 不得计入通过（须单列计账）"));
	}

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// T9 · 载体
// ─────────────────────────────────────────────────────────────────────────────

export function checkCompanions(filePath) {
	return COMPANION_SUFFIXES.filter((suffix) =>
		fs.existsSync(filePath.slice(0, -path.extname(filePath).length) + suffix),
	).map(
		(suffix) =>
			new Violation(
				0,
				"T9",
				`记录载体仅 Markdown，发现伴随文件 ${path.basename(filePath, path.extname(filePath)) + suffix}`,
			),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// T10 · 反引号路径存在性
// ─────────────────────────────────────────────────────────────────────────────

const T10_PREFIXES = ["docs/", "src/", "tests/", "bin/"];
const T10_GLOB_CHARS = /[*?[\]<>~]/;
const T10_LEADING = new Set(["(", "（", '"', "'"]);
const T10_TRAILING = new Set([")", "）", '"', "'", ".", "，", ",", ";", "；", "：", ":"]);

function stripT10Affixes(token) {
	let start = 0;
	let end = token.length;
	while (start < end && T10_LEADING.has(token[start])) start += 1;
	while (end > start && T10_TRAILING.has(token[end - 1])) end -= 1;
	return token.slice(start, end);
}

export function checkT10(lines, root, ViolationCtor = Violation) {
	const out = [];
	let fenced = false;

	lines.forEach((line, index) => {
		if (line.trimStart().startsWith("```")) {
			fenced = !fenced;
			return;
		}
		if (fenced) return;

		for (const match of line.matchAll(/`([^`]+)`/g)) {
			for (const raw of match[1].split(/\s+/)) {
				const token = stripT10Affixes(raw);
				if (!T10_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
				if (T10_GLOB_CHARS.test(token) || /\s/.test(token)) continue;

				const referenced = token
					.replace(/::.*$/, "")
					.replace(/:[0-9]+$/, "")
					.replace(/\/+$/, "");
				if (referenced.length === 0) continue;
				if (!fs.existsSync(path.resolve(root, referenced))) {
					out.push(new ViolationCtor(index + 1, "T10", "引用路径不存在：" + referenced));
				}
			}
		}
	});

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// T12 · AC → 用例覆盖矩阵
// ─────────────────────────────────────────────────────────────────────────────

const MATRIX_HEADING = /^#{1,6}\s*AC\s*(?:→|->)\s*用例覆盖矩阵\s*$/u;
const MATRIX_AC = /^AC-[0-9A-Za-z._-]+$/u;
const MATRIX_SKIP = /^SKIP(?:\b|[：:（(])/u;
const MATRIX_REF_SEP = /[,，、;；\/\s]+/u;

function headingIndex(line) {
	return /^#{1,6}\s/u.test(line.trim());
}

/**
 * 校验「AC → 用例覆盖矩阵」段（spec §2.5 M1–M10）。
 * rows 为结果表数据行（{ line, cells: [用例, 位置, 结论, 说明] }）。
 */
export function checkMatrix(lines, rows) {
	const out = [];
	const headings = [];
	lines.forEach((line, index) => {
		if (MATRIX_HEADING.test(line.trim())) headings.push(index);
	});

	if (headings.length === 0) {
		out.push(
			new Violation(
				1,
				"T12",
				"覆盖矩阵段缺失（须含标题「AC → 用例覆盖矩阵」）",
			),
		);
		return out;
	}

	if (headings.length > 1) {
		for (const index of headings.slice(1)) {
			out.push(
				new Violation(index + 1, "T12", `覆盖矩阵段重复 ${headings.length} 次`),
			);
		}
	}

	const knownCases = new Set(rows.map((row) => row.cells[0]));

	for (const heading of headings) {
		let end = lines.length;
		for (let index = heading + 1; index < lines.length; index += 1) {
			if (headingIndex(lines[index])) {
				end = index;
				break;
			}
		}
		const body = lines.slice(heading + 1, end);

		const tableStart = body.findIndex((line) => isTableRow(line));
		if (tableStart < 0) {
			out.push(new Violation(heading + 1, "T12", "覆盖矩阵段内无表格"));
			continue;
		}
		const headerIndex = heading + 1 + tableStart;
		const header = cells(lines[headerIndex]);
		const acCol = header.indexOf("AC");
		const caseCol = header.indexOf("用例编号");
		const noteCol = header.indexOf("备注");
		const verdictCol = header.indexOf("结论");

		const separatorIndex = headerIndex + 1;
		const separator = lines[separatorIndex];
		if (
			separator === undefined ||
			!isTableRow(separator) ||
			!cells(separator).every((cell) => SEPARATOR_CELL.test(cell))
		) {
			out.push(new Violation(separatorIndex + 1, "T12", "覆盖矩阵缺分隔行"));
			continue;
		}

		if (acCol < 0 || caseCol < 0) {
			out.push(
				new Violation(
					headerIndex + 1,
					"T12",
					`覆盖矩阵表头须含「AC」「用例编号」两列（现为：${header.join(" | ")}）`,
				),
			);
			continue;
		}

		const dataRows = [];
		let index = separatorIndex + 1;
		while (index < lines.length && isTableRow(lines[index])) {
			dataRows.push({ line: index + 1, cells: cells(lines[index]) });
			index += 1;
		}

		if (dataRows.length === 0) {
			out.push(new Violation(separatorIndex + 1, "T12", "覆盖矩阵无 AC 数据行"));
			continue;
		}

		const seen = new Map();
		for (const data of dataRows) {
			const ac = (data.cells[acCol] ?? "").trim();
			const caseCell = (data.cells[caseCol] ?? "").trim();
			const note = (data.cells[noteCol] ?? "").trim();
			const verdict = (data.cells[verdictCol] ?? "").trim();
			const isSkip = MATRIX_SKIP.test(caseCell);

			if (!MATRIX_AC.test(ac)) {
				out.push(new Violation(data.line, "T12", `AC 编号非法：${ac || "(空)"}`));
			} else if (seen.has(ac)) {
				out.push(
					new Violation(
						data.line,
						"T12",
						`AC 编号重复：${ac}（首次出现于第 ${seen.get(ac)} 行）`,
					),
				);
			} else {
				seen.set(ac, data.line);
			}

			if (caseCell === "") {
				out.push(new Violation(data.line, "T12", "AC 行缺用例编号或 SKIP"));
			} else if (isSkip) {
				const missing = [];
				if (!["理由", "跳过原因", "原因"].some((token) => note.includes(token))) {
					missing.push("理由/跳过原因/原因");
				}
				if (!["解除条件", "挂起登记"].some((token) => note.includes(token))) {
					missing.push("解除条件/挂起登记");
				}
				if (missing.length > 0) {
					out.push(new Violation(data.line, "T12", `SKIP 行缺：${missing.join("、")}`));
				}
				if (verdictCol >= 0 && verdict !== "" && verdict !== "SKIP") {
					out.push(
						new Violation(
							data.line,
							"T12",
							`结论值域非法：${verdict || "(空)"}`,
						),
					);
				}
			} else {
				for (const token of caseCell.split(MATRIX_REF_SEP)) {
					if (token === "") continue;
					if (!knownCases.has(token)) {
						out.push(
							new Violation(
								data.line,
								"T12",
								`引用用例不存在：${token}（结果表无此用例编号）`,
							),
						);
					}
				}
				if (verdictCol >= 0 && !VERDICTS.includes(verdict)) {
					out.push(
						new Violation(
							data.line,
							"T12",
							`结论值域非法：${verdict || "(空)"}`,
						),
					);
				}
			}
		}
	}

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 汇总入口
// ─────────────────────────────────────────────────────────────────────────────

export function checkText(filePath, text, root = process.cwd()) {
	const lines = text.split("\n");
	const violations = [...checkName(filePath)];

	const table = checkResultTable(lines);
	if (table.violations.length === 0) {
		violations.push(...checkHeader(lines, table.headerIndex, filePath));
		violations.push(...checkRows(table.rows));
		violations.push(...checkMatrix(lines, table.rows));
		violations.push(...checkSummary(lines, table.rows));
	}
	violations.push(...table.violations);
	violations.push(...checkCompanions(filePath));
	violations.push(...checkT10(lines, root));

	return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `用法: bun bin/trio-check-report.mjs <验收报告.md>
  校验 qa-<YYYYMMDD>-<HHMM>-report-<主题>.md 的命名 / 表头 / 4 列结果表 /
  结论值域 / 说明要件 / 汇总推导 / 载体。`;

export function main(argv) {
	if (argv.length !== 2 || argv[1] === "-h" || argv[1] === "--help") {
		console.log(USAGE);
		return argv.length === 2 ? 0 : 2;
	}

	const filePath = path.resolve(argv[1]);

	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		console.log(`trio-check-report: 文件不存在：${argv[1]}`);
		return 2;
	}

	const base = path.basename(filePath);
	if (base.startsWith("_") || filePath.includes(`${path.sep}templates${path.sep}`)) {
		console.log(`trio-check-report: 跳过模板文件（下划线前缀 / templates 目录不占记录命名位）：${base}`);
		return 0;
	}
	if (base.includes("-checklist-")) {
		console.log(
			`trio-check-report: ${base} 是验收清单（报告的配对输入），本校验器只受理 …-report-….md`,
		);
		return 2;
	}

	let text;
	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch (error) {
		console.log(`trio-check-report: 读取失败：${error.message}`);
		return 2;
	}

	const violations = checkText(filePath, text);
	if (violations.length === 0) {
		console.log(`trio-check-report: ${base} 合规`);
		return 0;
	}

	for (const violation of violations) console.log(violation.render(base));
	console.log(`trio-check-report: ${violations.length} 条违规`);
	return 1;
}

if (import.meta.main) {
	process.exit(main(process.argv.slice(1)));
}
