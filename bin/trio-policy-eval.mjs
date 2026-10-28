#!/usr/bin/env bun
/**
 * trio-policy-eval.mjs —— 共享策略判定器的命令行壳。
 *
 * guard（进程内）与 pre-commit（提交时）复用同一组实现：
 *   .omp/hooks/pre/trio-guard.ts 的 loadPolicy / decide / describeVerdict
 *
 * 用法：
 *   bun bin/trio-policy-eval.mjs --policy <policy.txt> --role <arch|dev|qa|pm> \
 *       [--path <relPath>]... [--stdin]
 *
 * 退出码：0 = 全部允许；1 = 有拒绝或策略 fail-closed；2 = 用法错误。
 * 仅用于门禁判定，不写任何文件。
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { loadPolicy, decide, describeVerdict } from "../.omp/hooks/pre/trio-guard.ts";

function usage(message) {
	if (message) console.error(message);
	console.error(
		"用法: bun bin/trio-policy-eval.mjs --policy <path> --role <role> [--path <rel>]... [--stdin]",
	);
	process.exit(2);
}

const args = process.argv.slice(2);
let policyPath = null;
let role = null;
let useStdin = false;
const paths = [];

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--policy") {
		policyPath = args[++i] ?? null;
	} else if (arg === "--role") {
		role = args[++i] ?? null;
	} else if (arg === "--path") {
		paths.push(args[++i] ?? "");
	} else if (arg === "--stdin") {
		useStdin = true;
	} else {
		usage(`未知参数：${arg}`);
	}
}

if (!policyPath || !role) usage("缺少 --policy 或 --role");
if (useStdin) {
	for (const line of fs.readFileSync(0, "utf8").split("\n")) {
		if (line.length > 0) paths.push(line);
	}
}

const loaded = loadPolicy(policyPath);
const source = path.relative(process.cwd(), policyPath) || policyPath;

if ("failClosed" in loaded) {
	console.error(`TRIO 门禁：策略判定 fail-closed：${loaded.reason}。`);
	console.error(`策略来源：${source}`);
	process.exit(1);
}

if (loaded.rules.length === 0) {
	if (paths.length === 0) process.exit(0);
	console.error("TRIO 门禁：策略为空，fail-closed（无 allow 规则）。");
	console.error(`快照：${loaded.digest.slice(0, 8)}（mtimeMs ${loaded.mtimeMs}）`);
	console.error(`策略来源：${source}`);
	process.exit(1);
}

let blocked = false;
for (const target of paths) {
	const verdict = decide(loaded, role, target);
	if (verdict.allowed) continue;
	blocked = true;
	console.error(`  - ${target}`);
	for (const line of describeVerdict(verdict, loaded).split("\n")) {
		console.error(`    ${line}`);
	}
}

if (blocked) {
	console.error(`策略来源：${source}`);
	process.exit(1);
}
process.exit(0);
