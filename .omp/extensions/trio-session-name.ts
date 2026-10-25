import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";

/**
 * trio-session-name —— 把 omp 会话名自动设成当前 TRIO 角色
 *
 * 为什么不用 CLI 参数或 hook：
 *   - omp 没有 `--name` / `--title`（只有 `--no-title` 关闭自动标题）；
 *   - HookContext.sessionManager 是 ReadonlySessionManager，改不了标题；
 *   - extension API 才有可写的 setSessionName()，且注释明确会持久化到会话文件。
 *
 * 触发时机是 session_start（会话创建时，进程内、无终端按键），因此不存在
 * send-keys 那种「TUI 未就绪导致 `/rename` 被当成聊天内容发给模型」的竞态。
 *
 * 覆盖策略：只在会话尚无标题时写入。用户手动 /rename 过的会话、以及
 * resume 回来的旧会话都不会被改写；而 setSessionName 以 "user" 优先级写入，
 * 也不会被 omp 的自动标题生成覆盖。
 */
function normalizeRole(raw: string | undefined): string | null {
	if (!raw) return null;
	const role = raw.trim().toLowerCase();
	if (role === "pm") return "arch"; // 历史别名
	return role === "arch" || role === "dev" || role === "qa" ? role : null;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async () => {
		const role = normalizeRole(process.env.TRIO_ROLE);
		if (!role) return; // 非 trio 会话：保持 omp 默认命名
		if (pi.getSessionName()) return; // 尊重已有标题
		await pi.setSessionName(role);
	});
}
