/**
 * TRIO 写门禁 —— 进程内写前拦截 (in-process write guard)
 *
 * 角色身份来自环境变量 TRIO_ROLE（pm / dev / qa），由 bin/start-agent.sh 导出。
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

type Role = "pm" | "dev" | "qa";
type Verdict = { allowed: true } | { allowed: false; reason: string };

const ROLES: readonly Role[] = ["pm", "dev", "qa"];

interface Rule {
	allow: boolean;
	role: Role | "*";
	glob: string;
}

const POLICY_RELATIVE_PATH = path.join(".omp", "trio", "policy.txt");

// ─────────────────────────────────────────────────────────────────────────────
// 策略解析
// ─────────────────────────────────────────────────────────────────────────────

function parsePolicy(text: string): Rule[] {
	const rules: Rule[] = [];
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;
		const parts = line.split(/\s+/);
		if (parts.length !== 3) continue;
		const [kind, role, glob] = parts;
		if (kind !== "allow" && kind !== "deny") continue;
		if (role !== "*" && !ROLES.includes(role as Role)) continue;
		rules.push({ allow: kind === "allow", role: role as Role | "*", glob });
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
 */
export function decide(rules: readonly Rule[], role: Role, relativePath: string): Verdict {
	const applicable = rules.filter(rule => rule.role === "*" || rule.role === role);
	const denied = applicable.find(rule => !rule.allow && matchGlob(rule.glob, relativePath));
	if (denied) {
		return { allowed: false, reason: `路径 "${relativePath}" 命中禁止规则 (${denied.role} ${denied.glob})` };
	}
	const allowed = applicable.find(rule => rule.allow && matchGlob(rule.glob, relativePath));
	if (allowed) {
		return { allowed: true };
	}
	return { allowed: false, reason: `路径 "${relativePath}" 不在 ${role} 的写入白名单内` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 路径归一化
// ─────────────────────────────────────────────────────────────────────────────

/** 把任意目标路径转成相对项目根的 POSIX 路径；不在项目根内则返回 null（不管辖）。 */
function toRelativePath(target: string, projectRoot: string): string | null {
	if (target.length === 0) return null;
	// 非文件系统目标：xd:// 设备、local:// 草稿、URL —— 不属于三方契约目录。
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return null;
	let absolute: string;
	if (path.isAbsolute(target)) {
		absolute = path.resolve(target);
	} else {
		absolute = path.resolve(projectRoot, target);
	}
	const relative = path.relative(projectRoot, absolute);
	if (relative.length === 0) return null;
	if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
	return relative.split(path.sep).join("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// bash 写意图检测
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 命中写意图的 shell 片段。只读命令（ls / cat / grep / git status / pytest …）
 * 不命中，因此 QA 仍可读取 tests/ 现状、Dev 仍可读取验收契约。
 */
const WRITE_INTENT_PATTERNS: readonly RegExp[] = [
	/\b(?:tee|dd|install|mktemp|truncate)\b/, // tee / dd / install / truncate
	/\b(?:cp|mv|rm|rsync|unlink|shred)\b/, // 复制 / 移动 / 删除
	/\bsed\b[^|;&]*\s-i\b/, // sed -i
	/\bperl\b[^|;&]*\s-(?:i|pi|ip)\b/, // perl -i
	/\bpython[0-9.]*\b[^|;&]*\s-c\b/, // python -c
	/\b(?:python[0-9.]*|node|ruby|php)\b[^|;&]*\s<<<?/, // heredoc 脚本
	/(?:^|[\s;&|(])(?:>|>>|1>|2>|&>)/, // 输出重定向
	/\bchmod\b|\bchown\b/, // 改权限 / 属主
	/\bgit\b[^\n]*\b(?:add|commit|checkout|restore|stash|apply|am)\b/, // git 写操作
	/\bpatch\b/, // patch
];

/** 从 shell 命令中抽取疑似目标路径（用于与禁写区求交集）。 */
function extractPathTokens(command: string): string[] {
	const tokens = new Set<string>();
	// 重定向目标：> file / >> file
	for (const match of command.matchAll(/(?:\d?>>?|&>)\s*([^\s;&|]+)/g)) {
		tokens.add(match[1]);
	}
	// 命令参数中的路径样式 token（含目录分隔符的一段）。
	// 前导字符类含引号与括号：路径常被 '...' 或 "..." 或 open('...') 包裹。
	// 字符类内的 '/' 必须转义，否则会提前终止正则字面量。
	// 末段允许为空：以 '/' 结尾的目录名（'cp -r src tests/'）也要捕获。
	for (const match of command.matchAll(/(?:^|[\s'"(])([~.]?[\w.\/@+-]*\/[\w.\/@+-]*)/g)) {
		const candidate = match[1];
		// 排除纯 '/' 与空串：它们不是路径。
		if (candidate.length > 1) tokens.add(candidate);
	}
	return [...tokens];
}

function bashTargetsForbidden(command: string, forbiddenRelatives: readonly string[]): string[] {
	if (forbiddenRelatives.length === 0) return [];
	if (!WRITE_INTENT_PATTERNS.some(pattern => pattern.test(command))) return [];
	const hits: string[] = [];
	for (const token of extractPathTokens(command)) {
		// 去掉引号与尾斜杠：'tests/' 与 'tests' 指向同一目录。
		const normalized = token.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
		if (normalized.length === 0) continue;
		for (const forbidden of forbiddenRelatives) {
			const base = forbidden.endsWith("/**") ? forbidden.slice(0, -3) : forbidden;
			// 命中：完全相等，或位于该目录之下（含目录本身）。
			if (normalized === base || normalized.startsWith(`${base}/`)) {
				hits.push(normalized);
			}
		}
	}
	// 去掉被更长路径覆盖的前缀项：
	//   'tests/a'      被 'tests/a.txt' 覆盖（同名 + 更长后缀）
	//   'tests/a'      被 'tests/a/b' 覆盖（目录关系）
	const unique = [...new Set(hits)];
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

/** 从 Python/JS 代码里抽取文件路径字面量。 */
function extractPathsFromCode(code: string): string[] {
	const paths = new Set<string>();
	const patterns = [
		/["'`]((?:\.{0,2}\/)?[\w./@-]+\/[\w./@-]+\.\w+)["'`]/g, // "src/a.py"
		/["'`]((?:\.{0,2}\/)?[\w.-]+\.\w{1,5})["'`]/g, // "a.py"
		/\bopen\s*\(\s*["'`]([^"'`]+)["'`]/g, // open("x")
		/\b(?:writeFileSync|writeFile|appendFileSync|appendFile)\s*\(\s*["'`]([^"'`]+)["'`]/g,
		/\bPath\s*\(\s*["'`]([^"'`]+)["'`]/g,
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
	let cachedRules: Rule[] | null = null;

	function projectRoot(ctx: { cwd: string }): string {
		if (cachedRoot === null) {
			cachedRoot = path.resolve(ctx.cwd);
		}
		return cachedRoot;
	}

	function loadRules(root: string): Rule[] {
		if (cachedRules !== null) return cachedRules;
		const policyPath = path.join(root, POLICY_RELATIVE_PATH);
		try {
			cachedRules = parsePolicy(fs.readFileSync(policyPath, "utf8"));
		} catch {
			// 策略文件缺失 → 空规则集 → fail-closed（全部拒绝写入）。
			cachedRules = [];
		}
		return cachedRules;
	}

	pi.on("tool_call", async (event, ctx) => {
		const role = process.env.TRIO_ROLE as Role | undefined;
		if (!role || !ROLES.includes(role)) return undefined;

		const root = projectRoot(ctx);
		const rules = loadRules(root);
		if (rules.length === 0) return undefined;

		const input = (event.input ?? {}) as Record<string, unknown>;
		const toolName = event.toolName;

		// bash 走单独的判定：写意图 AND 禁写路径 同时命中才拦。
		if (toolName === "bash") {
			const command = typeof input.command === "string" ? input.command : "";
			if (command.length === 0) return undefined;
			const forbidden = rules
				.filter(rule => !rule.allow && (rule.role === "*" || rule.role === role))
				.map(rule => rule.glob);
			const hits = bashTargetsForbidden(command, forbidden);
			if (hits.length === 0) return undefined;
			return {
				block: true,
				reason:
					`TRIO 门禁：${role} 不得写入 ${hits.join(", ")}。\n` +
					`命令：${command}\n` +
					`若这是误判（例如只是读取该目录），请改用不触达写意图的形式。`,
			};
		}

		const targets = inputPaths(toolName, input);
		if (targets.length === 0) return undefined;

		const violations: string[] = [];
		for (const target of targets) {
			const relative = toRelativePath(target, root);
			if (relative === null) continue;
			const verdict = decide(rules, role, relative);
			if (!verdict.allowed) violations.push(verdict.reason);
		}
		if (violations.length === 0) return undefined;

		return {
			block: true,
			reason:
				`TRIO 门禁：${role} 的越权写入已被拦截。\n` +
				`${violations.join("\n")}\n` +
				`策略来源：${POLICY_RELATIVE_PATH}`,
		};
	});
}
