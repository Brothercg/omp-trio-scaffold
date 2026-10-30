/**
 * tests/_layout.mjs —— 布局无关的测试根/载荷解析（非套件）
 *
 * 不变量（ADR-0015 / TASK-012 R5）：套件目录与工具目录同层
 * （tests/ ∥ bin/，tooling/tests/ ∥ tooling/bin/）。
 * 本文件跟随套件一起部署，运行期按地标探测项目根，不对测试内容做安装期改写。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** 从起点目录向上找最近的含 .omp/trio/policy.txt 的祖先。 */
export function projectRoot(start = path.dirname(fileURLToPath(import.meta.url))) {
	let dir = path.resolve(start);
	for (;;) {
		if (fs.existsSync(path.join(dir, ".omp", "trio", "policy.txt"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(`无法定位项目根（未见 .omp/trio/policy.txt）：${start}`);
		}
		dir = parent;
	}
}

/** 按给定候选相对路径返回首个存在的绝对路径；全缺返回 null。 */
export function payload(...candidates) {
	const root = projectRoot();
	for (const rel of candidates) {
		if (!rel) continue;
		const abs = path.resolve(root, rel);
		if (fs.existsSync(abs)) return abs;
	}
	return null;
}

/** 执行件路径：tooling 布局优先 tooling/bin/<name>，bin 布局优先 bin/<name>。 */
export function toolPath(name) {
	const root = projectRoot();
	const order = fs.existsSync(path.join(root, "tooling", "bin"))
		? ["tooling/bin", "bin"]
		: ["bin", "tooling/bin"];
	for (const dir of order) {
		const abs = path.join(root, dir, name);
		if (fs.existsSync(abs)) return abs;
	}
	return null;
}
