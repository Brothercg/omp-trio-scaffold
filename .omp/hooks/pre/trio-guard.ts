/**
 * TRIO 写门禁 —— 进程内写前拦截 (in-process write guard)
 *
 * 角色身份来自环境变量 TRIO_ROLE（arch / dev / qa），由 bin/start-agent.sh 导出。
 * 别名：'pm' 是 'arch' 的兼容别名，收到后自动归一化为 'arch'。
 * 未设置 TRIO_ROLE 时本 hook 不做任何拦截（人工介入是合法逃生舱）。
 *
 * 策略来自 .omp/trio/policy.txt —— 与 .git/hooks/pre-commit 共用同一份真值源。
 *
 * 覆盖的写通道（omp v18.12.6 实测）：
 *   write      path
 *   edit       path（replace/patch）或 input（apply_patch / hashline 格式）
 *   ast_edit   paths[]
 *   bash       command（写意图正则 AND 禁写路径 同时命中才拦）
 *   lsp        file（仅 rename / rename_file / code_actions+apply 为写）
 *   eval       code（Python/JS 可写盘）
 *
 * 设计约束：不剥夺任何底层工具与执行能力（LSP、DAP、终端执行全部保留），
 * 只在「即将落盘」的那一刻按角色拒绝越权写入。
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

type Role = "arch" | "dev" | "qa";
export type Verdict = { allowed: boolean; rule?: Rule; reason: string };

/** 执法件内嵌版本；与 policy.txt 的 # gate-version 声明对齐（AC-5）。 */
export const EXPECTED_GATE_VERSION = 1;

const ROLES: readonly Role[] = ["arch", "dev", "qa"];

/**
 * 兼容别名：'pm' 是 'arch' 的历史名称。
 * 旧项目已配置的 TRIO_ROLE=pm 与旧版 policy.txt（内含 `allow pm`）
 * 都经由本表归一化，无需迁移脚本。
 */
const ROLE_ALIASES: Readonly<Record<string, Role>> = { pm: "arch" };

/** 拦截提示中的角色称谓。 */
const ROLE_LABEL: Readonly<Record<Role, string>> = {
	arch: "[ARCH / 架构师]",
	dev: "[DEV / 开发]",
	qa: "[QA / 测试]",
};

/** 把外部输入的角色串归一化为内部角色；非法或缺失返回 null。 */
function normalizeRole(value: string | undefined): Role | null {
	if (!value) return null;
	const lowered = value.toLowerCase();
	const aliased = ROLE_ALIASES[lowered];
	if (aliased) return aliased;
	return ROLES.includes(lowered as Role) ? (lowered as Role) : null;
}

export type RoleEnvState =
	| { state: "unset" }
	| { state: "invalid"; raw: string }
	| { state: "valid"; role: Role };

/**
 * BUG-3：区分「未设置」与「设置但非法」。
 * 未设置 → 无身份逃生舱；空串/未知词/前后空白 → invalid（fail-closed）。
 */
export function resolveRoleEnv(value: string | undefined): RoleEnvState {
	if (value === undefined) return { state: "unset" };
	const role = normalizeRole(value);
	if (role === null) return { state: "invalid", raw: value };
	return { state: "valid", role };
}

interface Rule {
	allow: boolean;
	role: Role | "*";
	glob: string;
}

const POLICY_RELATIVE_PATH = path.join(".omp", "trio", "policy.txt");

export interface PolicySnapshot {
	rules: Rule[];
	mtimeMs: number;
	digest: string;
	/** 快照来源；用于 describeVerdict 检测判定后文件是否已变化。 */
	policyPath?: string;
	/** policy.txt 的 # gate-version 声明解析结果（AC-5 fail-closed）。 */
	gateVersion: GateVersionParseResult;
	/** 项目根（由 policyPath 反推），供 judgeBash 做路径归一。 */
	root?: string;
}

export interface FailClosed {
	failClosed: true;
	reason: "policy 缺失" | "policy 不可解析" | "policy 不可读";
}

const policyCache = new Map<string, PolicySnapshot>();

function snapshotDigest(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * 共享策略加载器：按 mtimeMs + digest 校验快照，任一变化即重解析。
 * 缺失 / 不可读 / 不可解析返回 FailClosed；空策略返回 rules=[] 的合法快照。
 */
export function loadPolicy(policyPath: string): PolicySnapshot | FailClosed {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(policyPath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		return { failClosed: true, reason: code === "ENOENT" ? "policy 缺失" : "policy 不可读" };
	}
	if (!stat.isFile()) return { failClosed: true, reason: "policy 不可读" };

	let text: string;
	try {
		text = fs.readFileSync(policyPath, "utf8");
	} catch {
		return { failClosed: true, reason: "policy 不可读" };
	}

	const digest = snapshotDigest(text);
	const mtimeMs = stat.mtimeMs;
	const cached = policyCache.get(policyPath);
	if (cached !== undefined && cached.mtimeMs === mtimeMs && cached.digest === digest) {
		return cached;
	}

	let rules: Rule[];
	try {
		rules = parsePolicy(text);
	} catch {
		return { failClosed: true, reason: "policy 不可解析" };
	}
	const snapshot: PolicySnapshot = {
		rules,
		mtimeMs,
		digest,
		policyPath,
		gateVersion: parseGateVersion(text),
		root: path.resolve(path.dirname(policyPath), "..", ".."),
	};
	policyCache.set(policyPath, snapshot);
	return snapshot;
}

/** 共享文案：判定理由 + 快照标识（digest 前 8 位 + mtimeMs）。 */
export function describeVerdict(verdict: Verdict, snapshot: PolicySnapshot): string {
	const label = snapshot.digest.slice(0, 8);
	let text = `${verdict.reason}\n快照：${label}（mtimeMs ${snapshot.mtimeMs}）`;
	if (snapshot.policyPath !== undefined) {
		try {
			const current = snapshotDigest(fs.readFileSync(snapshot.policyPath, "utf8"));
			if (current !== snapshot.digest) {
				text += `\n当前策略 digest：${current.slice(0, 8)}；策略已更新，本次仍按旧快照 ${label} 执法。`;
			}
		} catch {
			text += `\n当前策略不可读；本次仍按旧快照 ${label} 执法。`;
		}
	}
	return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// 策略解析
// ─────────────────────────────────────────────────────────────────────────────

export interface GateVersionParseResult {
	/** 恰好一行合法声明时的整型值。 */
	version?: number;
	/** missing=缺行；duplicate=多行；invalid=任一行不合法。 */
	error?: "missing" | "duplicate" | "invalid";
	/** 非法行的原文（诊断用）。 */
	detail?: string;
}

/**
 * BUG-2：严格解析 `^# gate-version: <十进制整数>$`。
 * 必须恰好一行；缺行/重复/任一行非法（1.5、1abc、CRLF、缩进等）均 fail-closed。
 */
export function parseGateVersion(text: string): GateVersionParseResult {
	const versions: number[] = [];
	let sawPrefix = false;
	let malformed: string | undefined;
	for (const line of text.split("\n")) {
		if (!line.startsWith("# gate-version:")) continue;
		sawPrefix = true;
		const match = /^# gate-version: ([0-9]+)$/.exec(line);
		if (match === null) {
			malformed = line;
			continue;
		}
		const value = Number(match[1]);
		if (!Number.isSafeInteger(value)) {
			malformed = line;
			continue;
		}
		versions.push(value);
	}
	if (malformed !== undefined) return { error: "invalid", detail: malformed };
	if (!sawPrefix) return { error: "missing" };
	if (versions.length === 0) return { error: "missing" };
	if (versions.length > 1) return { error: "duplicate" };
	return { version: versions[0] };
}

/** AC-5：执法件自证版本。声明缺失/重复/非法/不符一律 fail-closed。 */
export function checkGateVersion(declared: number | undefined, expected: number): Verdict {
	if (declared === undefined) {
		return { allowed: false, reason: "执法件版本漂移：gate-version 声明缺失" };
	}
	if (declared !== expected) {
		return {
			allowed: false,
			reason: `执法件版本漂移：policy 声明 ${declared} ≠ 执法件内嵌 EXPECTED ${expected}`,
		};
	}
	return { allowed: true, reason: `执法件版本自证通过（gate-version ${declared}）` };
}

/** 把解析结果转成判定（guard 侧入口，pre-commit/pre-push 同语义）。 */
export function judgeGateVersion(parsed: GateVersionParseResult, expected: number): Verdict {
	if (parsed.error === "missing") {
		return { allowed: false, reason: "执法件版本漂移：gate-version 声明缺失" };
	}
	if (parsed.error === "duplicate") {
		return { allowed: false, reason: "执法件版本漂移：gate-version 声明重复（必须恰好一行）" };
	}
	if (parsed.error === "invalid") {
		return {
			allowed: false,
			reason: `执法件版本漂移：gate-version 声明非法（${parsed.detail ?? ""}）`,
		};
	}
	return checkGateVersion(parsed.version, expected);
}

export function parsePolicy(text: string): Rule[] {
	const rules: Rule[] = [];
	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].trim();
		if (line.length === 0 || line.startsWith("#")) continue;
		const parts = line.split(/\s+/);
		if (parts.length !== 3) {
			throw new Error(`policy 不可解析：第 ${index + 1} 行字段数 ${parts.length}`);
		}
		const [kind, role, glob] = parts;
		if (kind !== "allow" && kind !== "deny") {
			throw new Error(`policy 不可解析：第 ${index + 1} 行 kind "${kind}"`);
		}
		let normalizedRole: Role | "*";
		if (role === "*") {
			normalizedRole = "*";
		} else {
			// 旧版 policy.txt 里写的是 `allow pm ...`，在此归一化为 arch。
			const resolved = normalizeRole(role);
			if (resolved === null) continue;
			normalizedRole = resolved;
		}
		rules.push({ allow: kind === "allow", role: normalizedRole, glob });
	}
	return rules;
}

/**
 * Glob → RegExp。`*` 匹配任意字符（含 `/`），`?` 匹配单字符。
 * 路径先归一化为相对项目根的 POSIX 形式再匹配。
 */
function globToRegExp(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^]*").replace(/\u0000/g, "[^]*");
	return new RegExp(`^${escaped}$`);
}

function matchGlob(glob: string, relativePath: string): boolean {
	if (glob.endsWith("/**")) {
		const prefix = glob.slice(0, -3);
		return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
	}
	return globToRegExp(glob).test(relativePath);
}

/**
 * deny 优先的白名单判定。未命中任何 allow → 拒绝（fail-closed）。
 * 兼容既有 `decide(rules, role, path)`：首个参数可为 PolicySnapshot 或 Rule[]。
 */
export function decide(
	snapshotOrRules: PolicySnapshot | readonly Rule[],
	roleInput: string,
	relativePath: string,
): Verdict {
	const rules = Array.isArray(snapshotOrRules) ? snapshotOrRules : snapshotOrRules.rules;
	// 别名在此归一化，因此 `decide(..., "pm", path)` 与 `"arch"` 等价。
	const role = roleInput === "*" ? "*" : normalizeRole(roleInput);
	if (role === null) {
		return { allowed: false, reason: `未知角色 "${roleInput}"，按 fail-closed 拒绝写入 "${relativePath}"` };
	}
	const applicable = rules.filter(rule => rule.role === "*" || rule.role === role);
	const denied = applicable.find(rule => !rule.allow && matchGlob(rule.glob, relativePath));
	if (denied) {
		return {
			allowed: false,
			rule: denied,
			reason: `路径 "${relativePath}" 命中禁止规则 (${denied.role} ${denied.glob})`,
		};
	}
	const allowed = applicable.find(rule => rule.allow && matchGlob(rule.glob, relativePath));
	if (allowed) {
		return {
			allowed: true,
			rule: allowed,
			reason: `路径 "${relativePath}" 命中允许规则 (${allowed.role} ${allowed.glob})`,
		};
	}
	return { allowed: false, reason: `路径 "${relativePath}" 不在 ${ROLE_LABEL[role] ?? role} 的写入白名单内` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 路径归一化
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedFsTarget {
	/** 相对项目根（realpath 归一后）的 POSIX 路径；逃逸/不管辖时缺省。 */
	relPath?: string;
	/** 出根判定：其他 worktree 根内 → 拒绝；系统路径 → 不管辖。 */
	escape?: "worktree" | "system";
	/** 真实路径与词法路径不一致（symlink 被解析），AC-2 需明示。 */
	symlink?: boolean;
	/** 词法归一后的相对路径（仅用于文案溯源）。 */
	lexicalRel?: string;
	/** symlink 环等不可解析错误；按 fail-closed 拒绝。 */
	error?: "symlink-loop";
}

function realRootOf(root: string): string {
	try {
		return fs.realpathSync(root);
	} catch {
		return path.resolve(root);
	}
}

/** 解析最深的已存在祖先，再拼回尚未创建的后缀；环返回错误。 */
function realpathDeepest(absolute: string): { resolved: string } | { error: "symlink-loop" } {
	let current = path.resolve(absolute);
	const tail: string[] = [];
	for (let depth = 0; depth < 64; depth++) {
		try {
			const real = fs.realpathSync(current);
			return { resolved: tail.length > 0 ? path.join(real, ...tail.slice().reverse()) : real };
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ELOOP") return { error: "symlink-loop" };
			if (code !== "ENOENT" && code !== "ENOTDIR") return { error: "symlink-loop" };
			const parent = path.dirname(current);
			if (parent === current) return { resolved: path.resolve(absolute) };
			tail.push(path.basename(current));
			current = parent;
		}
	}
	return { error: "symlink-loop" };
}

const worktreeRootCache = new Map<string, string[]>();

/** 其他 worktree 根（realpath）；git 不可用时为空。 */
function otherWorktreeRoots(root: string, realRoot: string): string[] {
	const cached = worktreeRootCache.get(realRoot);
	if (cached !== undefined) return cached;
	const roots: string[] = [];
	try {
		const out = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 2000,
		});
		for (const line of out.split("\n")) {
			if (!line.startsWith("worktree ")) continue;
			const candidate = line.slice("worktree ".length).trim();
			if (candidate.length === 0) continue;
			let real = candidate;
			try {
				real = fs.realpathSync(candidate);
			} catch {
				real = path.resolve(candidate);
			}
			if (real !== realRoot) roots.push(real);
		}
	} catch {
		// git 不可用/超时：无其他 worktree 信息，按系统路径处理。
	}
	worktreeRootCache.set(realRoot, roots);
	return roots;
}

function isInside(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * ADR-0012 §3.2/§3.4：写目标 realpath 归一后判定。
 *   - 落在本项目根内 → relPath（symlink 穿透由 realpath 解析后按真实路径判）；
 *   - 落在其他 worktree 根内 → escape="worktree"（拒绝）；
 *   - 其余根外路径 → escape="system"（不管辖，维持现状）。
 */
export function normalizeFsTarget(raw: string, root: string): NormalizedFsTarget {
	if (raw.length === 0) return { escape: "system" };
	// 非文件系统目标：xd:// 设备、local:// 草稿、URL —— 不属于三方契约目录。
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return { escape: "system" };

	const realRoot = realRootOf(root);
	const lexical = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(realRoot, raw);
	const real = realpathDeepest(lexical);
	if ("error" in real) return { error: real.error };
	const resolved = real.resolved;
	const lexicalRelRaw = path.isAbsolute(raw)
		? path.relative(realRoot, lexical)
		: path.relative(realRoot, path.resolve(realRoot, raw));
	const lexicalRel = lexicalRelRaw.split(path.sep).join("/");

	if (isInside(realRoot, resolved)) {
		const relPath = path.relative(realRoot, resolved).split(path.sep).join("/");
		return { relPath, lexicalRel, symlink: relPath !== lexicalRel };
	}
	for (const otherRoot of otherWorktreeRoots(root, realRoot)) {
		if (isInside(otherRoot, resolved)) return { escape: "worktree", lexicalRel };
	}
	return { escape: "system", lexicalRel };
}

/**
 * ADR-0012 §3.2：bash 写目标走与 write/edit 同语义的 allow+deny 全矩阵判定。
 * 未检出写目标（只读命令）放行；每个目标独立归一后判定，任一拒绝即拒绝。
 */
export function judgeBash(command: string, role: Role, snapshot: PolicySnapshot): Verdict {
	const root = snapshot.root ?? process.cwd();
	const targets = bashTargets(command);
	if (targets.length === 0) {
		return { allowed: true, reason: "未检出写目标（只读命令）" };
	}
	const denials: Verdict[] = [];
	for (const target of targets) {
		const normalized = normalizeFsTarget(target, root);
		if (normalized.error === "symlink-loop") {
			denials.push({
				allowed: false,
				reason: `写目标 "${target}" 的 symlink 无法解析（环/非目录），按 fail-closed 拒绝`,
			});
			continue;
		}
		if (normalized.escape === "worktree") {
			denials.push({
				allowed: false,
				reason: `写目标 "${target}" 位于其他 worktree 根内：跨 worktree 写入不支持`,
			});
			continue;
		}
		if (normalized.escape === "system") continue;
		const relPath = normalized.relPath ?? "";
		if (relPath.length === 0) continue;
		const verdict = decide(snapshot, role, relPath);
		if (verdict.allowed) continue;
		const prefix = normalized.symlink
			? `写目标 "${target}" 经 symlink 穿透到 "${relPath}"（symlink 穿透）`
			: `写目标 "${target}"`;
		denials.push({ ...verdict, reason: `${prefix}：${verdict.reason}` });
	}
	if (denials.length === 0) {
		return { allowed: true, reason: `写目标 ${targets.join(", ")} 均在白名单内` };
	}
	return {
		allowed: false,
		rule: denials[0].rule,
		reason: denials.map((denial) => denial.reason).join("\n"),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// bash 写意图检测
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 命中写意图的 shell 片段。只读命令（ls / cat / grep / git status / pytest …）
 * 不命中，因此 QA 仍可读取 tests/ 现状、Dev 仍可读取验收契约。
 *
 * ADR-0002：本层是**尽力而为**的第一道拦截；pre-commit / pre-push 才是权威。
 * 因此这里只做保守的写目标抽取，不追求完备 shell 解析。
 */
interface ShellToken {
	kind: "word" | "op";
	value: string;
}

const SEGMENT_OPS = new Set(["|", "||", "&&", ";", "&", "\n"]);
const IGNORED_REDIRECT_TARGETS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "-"]);
const WRAPPERS = new Set(["sudo", "env", "command", "builtin", "time", "nohup", "exec"]);
const DEST_ONLY_WRITERS = new Set(["cp", "rsync", "install", "ln"]);
const ALL_ARG_WRITERS = new Set([
	"tee",
	"dd",
	"truncate",
	"mktemp",
	"mv",
	"rm",
	"unlink",
	"shred",
	"mkdir",
	"rmdir",
	"touch",
	"chmod",
	"chown",
]);
const GIT_WRITE_SUBCOMMANDS = new Set([
	"add",
	"commit",
	"checkout",
	"switch",
	"restore",
	"stash",
	"apply",
	"am",
	"rm",
	"mv",
	"reset",
]);
const GIT_OPTION_VALUES = new Set([
	"-m",
	"--message",
	"-F",
	"--file",
	"-b",
	"-B",
	"-c",
	"-C",
	"--orphan",
	"--conflict",
	"--git-dir",
	"--work-tree",
]);
const CODE_OPTION_VALUES = new Set(["-c", "-e", "--eval", "--print"]);

/**
 * 轻量 shell 分词：处理引号/转义，并把重定向与管道/分号等操作符切成独立 token。
 * 不展开变量与命令替换 —— 本层只做写目标抽样，不做 shell 语义复刻。
 */
function tokenizeShell(command: string): ShellToken[] {
	const tokens: ShellToken[] = [];
	let word = "";
	let started = false;
	let quote: "'" | '"' | null = null;
	const flush = () => {
		if (started) {
			tokens.push({ kind: "word", value: word });
			word = "";
			started = false;
		}
	};
	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		if (quote !== null) {
			if (ch === quote) quote = null;
			else if (ch === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
			else word += ch;
			continue;
		}
		if (ch === "\\" && i + 1 < command.length) {
			word += command[++i];
			started = true;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			started = true;
			continue;
		}
		if (/\s/.test(ch)) {
			flush();
			if (ch === "\n") tokens.push({ kind: "op", value: "\n" });
			continue;
		}
		if (ch === ";" || ch === "|" || ch === "&") {
			flush();
			const next = command[i + 1] ?? "";
			if (ch === "|" && next === "|") {
				tokens.push({ kind: "op", value: "||" });
				i++;
			} else if (ch === "&" && next === "&") {
				tokens.push({ kind: "op", value: "&&" });
				i++;
			} else if (ch === "&" && next === ">") {
				let op = "&>";
				i++;
				if (command[i + 1] === ">") {
					op = "&>>";
					i++;
				}
				tokens.push({ kind: "op", value: op });
			} else {
				tokens.push({ kind: "op", value: ch });
			}
			continue;
		}
		if (ch === "<") {
			flush();
			let op = "<";
			if (command[i + 1] === "<") {
				op = "<<";
				i++;
				if (command[i + 1] === "<") {
					op = "<<<";
					i++;
				}
			}
			tokens.push({ kind: "op", value: op });
			continue;
		}
		if (ch === ">") {
			flush();
			let op = ">";
			if (command[i + 1] === ">") {
				op = ">>";
				i++;
			}
			if (command[i + 1] === "&") {
				op = ">&";
				i++;
			}
			tokens.push({ kind: "op", value: op });
			continue;
		}
		// fd 前缀：2> / 2>> / 2>& / 1> / 1>> / 1>& 等。
		if (/[0-9]/.test(ch)) {
			let j = i;
			while (j < command.length && /[0-9]/.test(command[j])) j++;
			if (command[j] === ">") {
				flush();
				let op = `${command.slice(i, j)}>`;
				j++;
				if (command[j] === ">") {
					op += ">";
					j++;
				} else if (command[j] === "&") {
					op += "&";
					j++;
				}
				tokens.push({ kind: "op", value: op });
				i = j - 1;
				continue;
			}
		}
		word += ch;
		started = true;
	}
	flush();
	return tokens;
}

function stripShellQuotes(value: string): string {
	return value.replace(/^["']|["']$/g, "");
}

/** fd 复制（2>&1 / 1>&2 / >&2）不是文件写；目标为 /dev/null 等也不算。 */
function isFdDuplication(op: string, target: string): boolean {
	if (!op.endsWith("&")) return false;
	return /^[0-9]+$/.test(target) || target.startsWith("&");
}

function isAssignment(word: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/** 取位置参数：跳过选项与已知选项值；`--` 之后全部视为位置参数。 */
function positionalArgs(args: readonly string[], optionValues: ReadonlySet<string> = new Set()): string[] {
	const out: string[] = [];
	let skipNext = false;
	let afterDoubleDash = false;
	for (const arg of args) {
		if (skipNext) {
			skipNext = false;
			continue;
		}
		if (afterDoubleDash) {
			out.push(arg);
			continue;
		}
		if (arg === "--") {
			afterDoubleDash = true;
			continue;
		}
		if (optionValues.has(arg)) {
			skipNext = true;
			continue;
		}
		if (arg.startsWith("-") && arg !== "-") continue;
		out.push(arg);
	}
	return out;
}

/**
 * BUG-1：cp/mv/install/ln/rsync 的写目标语义。
 * 返回 positionals（源/普通位置参数）与 targetDirs（-t / --target-directory 指定的目录）。
 * 带值选项的值不得计为位置参数；`--` 之后一律按位置参数。
 */
const WRITER_VALUE_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
	cp: new Set([
		"-t",
		"--target-directory",
		"-S",
		"--suffix",
		"--preserve",
		"--sparse",
		"--reflink",
		"--context",
	]),
	mv: new Set(["-t", "--target-directory", "-S", "--suffix"]),
	install: new Set([
		"-t",
		"--target-directory",
		"-m",
		"--mode",
		"-o",
		"--owner",
		"-g",
		"--group",
		"-S",
		"--suffix",
		"--context",
		"--strip-program",
	]),
	ln: new Set(["-t", "--target-directory", "-S", "--suffix"]),
	rsync: new Set([
		"-e",
		"--rsh",
		"--rsync-path",
		"--exclude",
		"--include",
		"--filter",
		"--exclude-from",
		"--include-from",
		"--files-from",
		"--port",
		"--password-file",
		"--timeout",
		"--contimeout",
		"--bwlimit",
		"--chmod",
		"--chown",
		"--usermap",
		"--groupmap",
		"--out-format",
		"--log-file",
		"--log-format",
		"--link-dest",
		"--copy-dest",
		"--compare-dest",
		"--partial-dir",
		"--temp-dir",
		"--backup-dir",
		"--suffix",
		"-T",
		"--max-size",
		"--min-size",
		"--address",
		"--sockopts",
		"--block-size",
		"--compress-level",
		"--protocol",
		"--iconv",
		"--checksum-seed",
		"--write-batch",
		"--read-batch",
		"--only-write-batch",
		"--stop-after",
		"--stop-at",
		"-M",
		"--remote-option",
		"--skip-compress",
		"--modify-window",
		"--max-alloc",
		"--time-limit",
	]),
};

function parseWriterArgs(
	command: string,
	args: readonly string[],
): { positionals: string[]; targetDirs: string[] } {
	const valueOptions = WRITER_VALUE_OPTIONS[command] ?? new Set<string>();
	const positionals: string[] = [];
	const targetDirs: string[] = [];
	let afterDoubleDash = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (afterDoubleDash) {
			positionals.push(arg);
			continue;
		}
		if (arg === "--") {
			afterDoubleDash = true;
			continue;
		}
		if (arg === "--target-directory" || arg === "-t") {
			const value = args[index + 1];
			if (value !== undefined) {
				targetDirs.push(value);
				index += 1;
			}
			continue;
		}
		if (arg.startsWith("--target-directory=")) {
			targetDirs.push(arg.slice("--target-directory=".length));
			continue;
		}
		// 组合短选项以 t 结尾（如 -rt）：下一个 token 是目录。
		if (/^-[A-Za-z]+$/.test(arg) && arg.endsWith("t")) {
			const value = args[index + 1];
			if (value !== undefined) {
				targetDirs.push(value);
				index += 1;
			}
			continue;
		}
		if (arg.startsWith("-") && arg !== "-") {
			if (valueOptions.has(arg)) index += 1; // 跳过选项值，不计位置参数
			continue;
		}
		positionals.push(arg);
	}
	return { positionals, targetDirs };
}

/** 从 python -c / node -e 的代码中只取真实写入调用，忽略内容字符串。 */
function writeTargetsInCode(code: string): string[] {
	return extractPathsFromCode(code);
}

/**
 * 抽取一个命令段的真实写入目标：
 *   - 重定向到文件的目标（fd 复制与 /dev/null 已在扫描时排除）
 *   - 写动词的对象（cp/mv/rm/tee/sed -i/git add …），只取命令参数，
 *     不取输入内容或代码里的路径字面量
 */
function segmentTargets(words: readonly string[], redirectTargets: readonly string[]): string[] {
	const targets = [...redirectTargets];
	let i = 0;
	while (i < words.length) {
		if (isAssignment(words[i]) || WRAPPERS.has(words[i])) {
			i++;
			continue;
		}
		break;
	}
	if (i >= words.length) return targets;
	const command = path.basename(words[i]);
	const args = words.slice(i + 1);

	if (command === "git") {
		let j = 0;
		while (j < args.length) {
			const arg = args[j];
			if (arg === "-C" || arg === "-c" || arg === "--git-dir" || arg === "--work-tree") {
				j += 2;
				continue;
			}
			if (arg.startsWith("-")) {
				j++;
				continue;
			}
			break;
		}
		const sub = args[j];
		if (!sub || !GIT_WRITE_SUBCOMMANDS.has(sub)) return targets;
		// commit 只写索引/历史，消息参数不得当作路径；其余写子命令取位置参数。
		targets.push(...positionalArgs(args.slice(j + 1), GIT_OPTION_VALUES));
		return targets;
	}

	if (command === "dd") {
		for (const arg of args) {
			if (arg.startsWith("of=")) targets.push(arg.slice(3));
		}
		return targets;
	}

	if (DEST_ONLY_WRITERS.has(command)) {
		// cp / mv / rsync / install / ln：-t/--target-directory 指定目录；否则末位置参数是目标。
		const { positionals, targetDirs } = parseWriterArgs(command, args);
		if (targetDirs.length > 0) targets.push(...targetDirs);
		else if (positionals.length > 0) targets.push(positionals[positionals.length - 1]);
		return targets;
	}

	if (ALL_ARG_WRITERS.has(command)) {
		targets.push(...positionalArgs(args));
		return targets;
	}

	if (command === "sed" || command === "perl") {
		// 仅 -i（原地编辑）算写；脚本表达式不会被误当路径（不含目标目录前缀）。
		if (!args.some(arg => /^-[a-zA-Z]*i/.test(arg))) return targets;
		targets.push(...positionalArgs(args));
		return targets;
	}

	if (command === "patch") {
		targets.push(...positionalArgs(args));
		return targets;
	}

	if (command === "python" || command === "python3" || command === "node" || command === "ruby" || command === "php") {
		for (let k = 0; k < args.length - 1; k++) {
			if (CODE_OPTION_VALUES.has(args[k])) {
				targets.push(...writeTargetsInCode(args[k + 1]));
				break;
			}
		}
		return targets;
	}

	return targets;
}

/** 抽取命令中的真实写入目标；只做词法归并，不按策略过滤。 */
function bashTargets(command: string): string[] {
	const tokens = tokenizeShell(command);
	const hits: string[] = [];
	let words: string[] = [];
	let redirects: string[] = [];
	const flush = () => {
		hits.push(...segmentTargets(words, redirects));
		words = [];
		redirects = [];
	};
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.kind === "op" && SEGMENT_OPS.has(token.value)) {
			flush();
			continue;
		}
		if (token.kind === "op" && (token.value === "<" || token.value === "<<" || token.value === "<<<")) {
			i++; // 输入重定向：目标不是写入目标
			continue;
		}
		if (token.kind === "op" && token.value.includes(">")) {
			const target = tokens[++i];
			if (!target || target.kind !== "word") continue;
			const value = stripShellQuotes(target.value);
			if (isFdDuplication(token.value, value) || IGNORED_REDIRECT_TARGETS.has(value)) continue;
			redirects.push(value);
			continue;
		}
		if (token.kind === "word") words.push(token.value);
	}
	flush();

	return [
		...new Set(
			hits
				// 去掉引号与尾斜杠：'tests/' 与 'tests' 指向同一目录。
				.map(token => token.replace(/^["']|["']$/g, "").replace(/\/+$/, ""))
				.filter(token => token.length > 0),
		),
	];
}

function bashTargetsForbidden(command: string, forbiddenRelatives: readonly string[]): string[] {
	if (forbiddenRelatives.length === 0) return [];
	const matched: string[] = [];
	for (const normalized of bashTargets(command)) {
		for (const forbidden of forbiddenRelatives) {
			const base = forbidden.endsWith("/**") ? forbidden.slice(0, -3) : forbidden;
			// 命中：完全相等，或位于该目录之下（含目录本身）。
			if (normalized === base || normalized.startsWith(`${base}/`)) {
				matched.push(normalized);
			}
		}
	}
	// 去掉被更长路径覆盖的前缀项：
	//   'tests/a'      被 'tests/a.txt' 覆盖（同名 + 更长后缀）
	//   'tests/a'      被 'tests/a/b' 覆盖（目录关系）
	const unique = [...new Set(matched)];
	return unique.filter(
		(candidate) =>
			!unique.some(
				(other) =>
					other !== candidate &&
					(other.startsWith(`${candidate}/`) ||
						(other.startsWith(candidate) && !/[/.]/.test(other[candidate.length] ?? ""))),
			),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具输入中的路径提取
// ─────────────────────────────────────────────────────────────────────────────

/** apply_patch / hashline 格式的 edit.input 里藏着文件路径。 */
function extractPathsFromPatchInput(input: string): string[] {
	const paths = new Set<string>();
	// apply_patch 的文件标记：*** Add/Update/Delete File: <path>
	for (const match of input.matchAll(/\*\*\*\s+(?:Add|Update|Delete)\s+File:\s*(.+)/g)) {
		paths.add(match[1].trim());
	}
	// apply_patch 的移动目标：*** Move to: <path>
	for (const match of input.matchAll(/\*\*\*\s+Move\s+to:\s*(.+)/g)) {
		paths.add(match[1].trim());
	}
	// hashline 头部：[path#hash] —— 行首独占或同行带行号
	for (const match of input.matchAll(/\[([^\]#\n]+?)(?:#[0-9a-fA-F]{4})?\](?=\s|$|\d+:)/gm)) {
		paths.add(match[1].trim());
	}
	return [...paths];
}

function inputPaths(toolName: string, input: Record<string, unknown>): string[] {
	switch (toolName) {
		case "write":
		case "edit": {
			const direct = input.path;
			if (typeof direct === "string" && direct.length > 0) return [direct];
			const raw = input.input;
			if (typeof raw === "string" && raw.length > 0) return extractPathsFromPatchInput(raw);
			return [];
		}
		case "ast_edit": {
			const paths = input.paths;
			if (Array.isArray(paths)) return paths.filter((p): p is string => typeof p === "string");
			return [];
		}
		case "lsp": {
			const action = typeof input.action === "string" ? input.action.toLowerCase() : "";
			const writing = action === "rename" || action === "rename_file" || (action === "code_actions" && input.apply === true);
			if (!writing) return [];
			const file = input.file;
			if (typeof file === "string" && file.length > 0) return [file];
			return [];
		}
		case "eval": {
			const code = input.code;
			if (typeof code === "string" && code.length > 0) return extractPathsFromCode(code);
			return [];
		}
		default:
			return [];
	}
}

/** 策略不可用时，判断本次工具调用是否构成受控写意图。 */
function isControlledWrite(toolName: string, input: Record<string, unknown>): boolean {
	switch (toolName) {
		case "write":
		case "edit":
		case "ast_edit":
			return true;
		case "bash": {
			const command = typeof input.command === "string" ? input.command : "";
			return command.length > 0 && bashTargets(command).length > 0;
		}
		case "lsp":
		case "eval":
			return inputPaths(toolName, input).length > 0;
		default:
			return false;
	}
}

/**
 * 从 Python/JS 代码里抽取**真实写入目标**，不抽取普通字符串字面量。
 * AC-3：内容里出现 "tests/x.test.mjs" 不应触发；只有 open()/writeFile()
 * 这类写入调用的路径参数才参与判定。
 */
function extractPathsFromCode(code: string): string[] {
	const paths = new Set<string>();
	const patterns = [
		/\bopen\s*\(\s*["'`]([^"'`]+)["'`]/g, // open("x", "w")
		/\b(?:writeFileSync|writeFile|appendFileSync|appendFile|write_text|write_bytes)\s*\(\s*["'`]([^"'`]+)["'`]/g,
		/\bPath\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*(?:write_text|write_bytes|writeFileSync?|appendFileSync?)\s*\(/g,
	];
	for (const pattern of patterns) {
		for (const match of code.matchAll(pattern)) {
			const candidate = match[1].trim();
			if (candidate.length > 0) paths.add(candidate);
		}
	}
	return [...paths];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: HookAPI) {
	let cachedRoot: string | null = null;

	function projectRoot(ctx: { cwd: string }): string {
		if (cachedRoot === null) {
			cachedRoot = path.resolve(ctx.cwd);
		}
		return cachedRoot;
	}

	pi.on("tool_call", async (event, ctx) => {
		// TRIO_ROLE=pm 是 arch 的兼容别名，归一化后统一按 arch 判定。
		const roleState = resolveRoleEnv(process.env.TRIO_ROLE);
		const root = projectRoot(ctx);
		const input = (event.input ?? {}) as Record<string, unknown>;
		const toolName = event.toolName;
		const command = typeof input.command === "string" ? input.command : "";

		// AC-6：未设置身份不再静默 —— 放行但每次写判定都附醒目提示。
		if (roleState.state === "unset") {
			if (!isControlledWrite(toolName, input)) return undefined;
			const warning = "⚠ 无身份运行，门禁未生效（TRIO_ROLE 未设置）：本次写操作已放行。";
			try {
				ctx.ui?.notify("无身份运行，门禁未生效", "warning");
			} catch {
				// 无 UI 的 print 模式不阻断判定。
			}
			return { additionalContext: warning };
		}

		// BUG-3：设置了但值非法 → fail-closed（与 pre-commit 同判）。
		if (roleState.state === "invalid") {
			if (!isControlledWrite(toolName, input)) return undefined;
			const raw = roleState.raw.length === 0 ? "(空串)" : roleState.raw;
			return {
				block: true,
				reason:
					`TRIO 门禁：TRIO_ROLE 非法：${raw}（合法值 arch/dev/qa/pm，大小写不敏感）。\n` +
					`已 fail-closed 拒绝本次写操作。`,
			};
		}
		const role = roleState.role;

		const policyPath = path.join(root, POLICY_RELATIVE_PATH);
		// 每次判定加载共享快照：mtimeMs + digest 任一变化即重读。
		const loaded = loadPolicy(policyPath);

		if ("failClosed" in loaded) {
			if (!isControlledWrite(toolName, input)) return undefined;
			const targets = inputPaths(toolName, input);
			const detail =
				toolName === "bash"
					? `命令：${command}`
					: `目标：${targets.length > 0 ? targets.join(", ") : "(未提供路径)"}`;
			return {
				block: true,
				reason:
					`TRIO 门禁：${ROLE_LABEL[role]} 的写入已被拦截。\n` +
					`策略判定 fail-closed：${loaded.reason}。\n` +
					`${detail}\n` +
					`策略来源：${POLICY_RELATIVE_PATH}`,
			};
		}

		// AC-5：执法件版本自证；声明缺失/不符一律 fail-closed（三面同判）。
		const gate = judgeGateVersion(loaded.gateVersion, EXPECTED_GATE_VERSION);
		if (!gate.allowed) {
			if (!isControlledWrite(toolName, input)) return undefined;
			return {
				block: true,
				reason:
					`TRIO 门禁：${ROLE_LABEL[role]} 的写入已被拦截。\n` +
					`${describeVerdict(gate, loaded)}\n` +
					`策略来源：${POLICY_RELATIVE_PATH}`,
			};
		}

		const rules = loaded.rules;

		if (rules.length === 0) {
			if (!isControlledWrite(toolName, input)) return undefined;
			const targets = inputPaths(toolName, input);
			const detail =
				toolName === "bash"
					? `命令：${command}`
					: `目标：${targets.length > 0 ? targets.join(", ") : "(未提供路径)"}`;
			const verdict: Verdict = { allowed: false, reason: "策略为空，fail-closed（无 allow 规则）" };
			return {
				block: true,
				reason:
					`TRIO 门禁：${ROLE_LABEL[role]} 的写入已被拦截。\n` +
					`${describeVerdict(verdict, loaded)}\n` +
					`${detail}\n` +
					`策略来源：${POLICY_RELATIVE_PATH}`,
			};
		}

		// AC-1：bash 写目标走 allow+deny 全矩阵（与 write/edit 同语义）。
		if (toolName === "bash") {
			if (command.length === 0) return undefined;
			const verdict = judgeBash(command, role, loaded);
			if (verdict.allowed) return undefined;
			return {
				block: true,
				reason:
					`TRIO 门禁：${ROLE_LABEL[role]} 不得写入该目标。\n` +
					`命令：${command}\n` +
					`${describeVerdict(verdict, loaded)}\n` +
					`若这是误判（例如只是读取该目录），请改用不触达写意图的形式。\n` +
					`策略来源：${POLICY_RELATIVE_PATH}`,
			};
		}

		const targets = inputPaths(toolName, input);
		if (targets.length === 0) return undefined;

		const violations: string[] = [];
		for (const target of targets) {
			// AC-2/AC-3：realpath 归一后判定；symlink 穿透按真实路径判。
			const normalized = normalizeFsTarget(target, root);
			if (normalized.error === "symlink-loop") {
				violations.push(`目标 "${target}" 的 symlink 无法解析（环/非目录），按 fail-closed 拒绝\n快照：${loaded.digest.slice(0, 8)}（mtimeMs ${loaded.mtimeMs}）`);
				continue;
			}
			if (normalized.escape === "worktree") {
				violations.push(`目标 "${target}" 位于其他 worktree 根内：跨 worktree 写入不支持`);
				continue;
			}
			if (normalized.escape === "system") continue;
			const relative = normalized.relPath ?? "";
			if (relative.length === 0) continue;
			const verdict = decide(loaded, role, relative);
			if (verdict.allowed) continue;
			const prefix = normalized.symlink
				? `目标 "${target}" 经 symlink 穿透到 "${relative}"（symlink 穿透）`
				: "";
			violations.push(prefix.length > 0 ? `${prefix}\n${describeVerdict(verdict, loaded)}` : describeVerdict(verdict, loaded));
		}
		if (violations.length === 0) return undefined;

		return {
			block: true,
			reason:
				`TRIO 门禁：${ROLE_LABEL[role]} 的越权写入已被拦截。\n` +
				`${violations.join("\n")}\n` +
				`策略来源：${POLICY_RELATIVE_PATH}`,
		};
	});
}
