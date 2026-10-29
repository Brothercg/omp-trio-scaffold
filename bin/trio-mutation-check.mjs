#!/usr/bin/env bun
/**
 * trio-mutation-check.mjs —— diff 变异质量门（TASK-007 §4.4 / AC-12）
 *
 * 定位：质量门，非防作弊（ADR-0013 §2.2）。对 diff 新增/修改行逐行抽一个
 * 变异（算符/常量翻转），跑测试命令：
 *   - 变异后测试仍通过 = 存活变异（断言对行为不敏感）→ 退出码 1 + 存活清单；
 *   - 全部被杀 → 退出码 0；
 *   - 空 diff / 测试命令不存在 / 单变异超时（30s）→ 退出码 2 + 原因。
 *
 * 用法：
 *   bun bin/trio-mutation-check.mjs <diff-range> -- <test-cmd...>
 *
 * 例：
 *   bun bin/trio-mutation-check.mjs HEAD~1..HEAD -- bun tests/calc.test.mjs
 *
 * 约束：抽样上限 20 变异/diff（spec §8）；单变异预算 30s。逐变异落盘再还原，
 * 任何路径退出前都恢复原文件内容。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const SAMPLE_LIMIT = 20;
const MUTATION_TIMEOUT_MS = 30_000;

const USAGE = `用法: bun bin/trio-mutation-check.mjs <diff-range> -- <test-cmd...>
  对 diff 新增/修改行逐行抽变并执行测试命令；
  存活变异 → 退出码 1；全杀 → 0；空 diff / 命令不存在 / 超时 → 2。`;

class UsageError extends Error {}

/** 变异候选：按优先级取第一个命中的算子/常量翻转。 */
const OPERATORS = [
	[">=", ">", ">= → >"],
	["<=", "<", "<= → <"],
	["===", "!==", "=== → !=="],
	["!==", "===", "!== → ==="],
	["==", "!=", "== → !="],
	["!=", "==", "!= → =="],
	["&&", "||", "&& → ||"],
	["||", "&&", "|| → &&"],
	[" + ", " - ", "+ → -"],
	[" - ", " + ", "- → +"],
	["true", "false", "true → false"],
	["false", "true", "false → true"],
	["return ", "return !", "return x → return !x"],
];

function mutateLine(text) {
	for (const [from, to, label] of OPERATORS) {
		const index = text.indexOf(from);
		if (index >= 0) {
			return { mutated: text.slice(0, index) + to + text.slice(index + from.length), label };
		}
	}
	const number = /\b([0-9]+)\b/.exec(text);
	if (number !== null) {
		const value = Number(number[1]);
		if (Number.isSafeInteger(value)) {
			const replacement = String(value + 1);
			return {
				mutated: text.slice(0, number.index) + replacement + text.slice(number.index + number[1].length),
				label: `${value} → ${replacement}`,
			};
		}
	}
	return null;
}

function parseArgs(argv) {
	const separator = argv.indexOf("--");
	if (separator < 0) throw new UsageError("缺少 -- 分隔符");
	const range = argv[0];
	if (!range || range.startsWith("--") || separator !== 1) throw new UsageError("缺少 diff-range");
	const testCommand = argv.slice(separator + 1);
	if (testCommand.length === 0) throw new UsageError("缺少测试命令");
	return { range, testCommand };
}

function commandExists(command) {
	if (command.includes("/")) return fs.existsSync(path.resolve(command));
	const probe = spawnSync("which", [command], { stdio: "ignore" });
	return probe.status === 0;
}

function collectDiff(range) {
	const result = spawnSync("git", ["diff", "--unified=0", "--no-color", range], {
		encoding: "utf8",
	});
	if (result.error) {
		return { error: `git diff 失败：${result.error.message}` };
	}
	if (result.status !== 0) {
		return { error: `git diff ${range} 失败（退出码 ${result.status}）：${(result.stderr ?? "").trim()}` };
	}
	return { text: result.stdout ?? "" };
}

/** 解析 unified=0 diff，返回新增行 {file, line, text}。 */
export function parseDiff(text) {
	const entries = [];
	let file = null;
	let newLine = 0;
	for (const raw of text.split("\n")) {
		if (raw.startsWith("+++ ")) {
			const target = raw.slice(4).trim();
			file = target === "/dev/null" ? null : target.replace(/^b\//, "");
			continue;
		}
		if (raw.startsWith("--- ") || raw.startsWith("diff --git ")) continue;
		const hunk = /^@@ -\S+ \+([0-9]+)(?:,[0-9]+)? @@/.exec(raw);
		if (hunk !== null) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (file === null) continue;
		if (raw.startsWith("+")) {
			entries.push({ file, line: newLine, text: raw.slice(1) });
			newLine += 1;
			continue;
		}
		if (raw.startsWith(" ")) {
			newLine += 1;
		}
	}
	return entries;
}

function chooseMutations(entries) {
	const mutations = [];
	for (const entry of entries) {
		if (mutations.length >= SAMPLE_LIMIT) break;
		const candidate = mutateLine(entry.text);
		if (candidate === null) continue;
		mutations.push({ ...entry, ...candidate });
	}
	return mutations;
}

function runTests(testCommand, cwd) {
	const [command, ...args] = testCommand;
	return spawnSync(command, args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		timeout: MUTATION_TIMEOUT_MS,
	});
}

export function main(argv) {
	let parsed;
	try {
		parsed = parseArgs(argv);
	} catch (error) {
		if (error instanceof UsageError) {
			console.error(`trio-mutation-check: ${error.message}`);
			console.error(USAGE);
			return 2;
		}
		throw error;
	}
	const { range, testCommand } = parsed;

	if (!commandExists(testCommand[0])) {
		console.error(`trio-mutation-check: 测试命令不存在：${testCommand[0]}`);
		return 2;
	}

	const diff = collectDiff(range);
	if (diff.error !== undefined) {
		console.error(`trio-mutation-check: ${diff.error}`);
		return 2;
	}
	if (diff.text.trim().length === 0) {
		console.error(`trio-mutation-check: 空 diff（${range}）—— 无可变异目标，不计「全杀」`);
		return 2;
	}

	const entries = parseDiff(diff.text);
	const mutations = chooseMutations(entries);
	if (mutations.length === 0) {
		console.error(`trio-mutation-check: diff 无可变异行（${range}）—— 不计「全杀」`);
		return 2;
	}

	const survived = [];
	let killed = 0;
	for (const mutation of mutations) {
		const absolute = path.resolve(mutation.file);
		let original;
		try {
			original = fs.readFileSync(absolute, "utf8");
		} catch (error) {
			console.error(`trio-mutation-check: 读取失败 ${mutation.file}：${error.message}`);
			console.error("  提示：diff-range 需指向当前工作树可读的文件。");
			return 2;
		}
		const lines = original.split("\n");
		const index = mutation.line - 1;
		if (index < 0 || index >= lines.length) {
			console.error(`trio-mutation-check: 行号越界 ${mutation.file}:${mutation.line}`);
			return 2;
		}
		const previous = lines[index];
		try {
			lines[index] = mutation.mutated;
			fs.writeFileSync(absolute, lines.join("\n"));
			const result = runTests(testCommand, process.cwd());
			if (result.error !== undefined) {
				if (result.error.code === "ETIMEDOUT") {
					console.error(
						`trio-mutation-check: 单变异超时（${MUTATION_TIMEOUT_MS / 1000}s）：${mutation.file}:${mutation.line}`,
					);
					return 2;
				}
				console.error(`trio-mutation-check: 测试命令执行失败：${result.error.message}`);
				return 2;
			}
			if (result.status === 0) {
				survived.push(mutation);
			} else {
				killed += 1;
			}
		} finally {
			lines[index] = previous;
			fs.writeFileSync(absolute, lines.join("\n"));
		}
	}

	if (survived.length > 0) {
		console.error(`trio-mutation-check: ${survived.length} 个存活变异（测试未杀死）：`);
		for (const mutation of survived) {
			console.error(`  ${mutation.file}:${mutation.line}: ${mutation.label} => ${mutation.mutated.trim()}`);
		}
		console.error(`抽样 ${mutations.length} 个，杀死 ${killed} 个，存活 ${survived.length} 个。`);
		return 1;
	}

	console.log(`trio-mutation-check: 全部杀死（抽样 ${mutations.length} 个变异）。`);
	return 0;
}

if (import.meta.main) {
	process.exit(main(process.argv.slice(2)));
}
