/**
 * BUG-1 最小复现: guard 策略快照终身缓存 + 缺失 fail-open
 * 运行: bun tests/repro/bug1-guard-stale-snapshot.mjs （期望 exit 1 —— 修复未落时红，
 *       修复落地后本脚本应转绿,随后被 tests/trio-guard.test.mjs 吸收为正式回归）
 * 只依赖被测行为本身,不依赖网络/时钟/随机性。
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import registerGuard from "../../.omp/hooks/pre/trio-guard.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bug1-repro-"));
const policy = path.join(dir, ".omp", "trio", "policy.txt");
fs.mkdirSync(path.join(dir, ".omp", "trio"), { recursive: true });
fs.writeFileSync(policy, "deny * target.txt\n");

let handler = null;
const previous = process.env.TRIO_ROLE;
process.env.TRIO_ROLE = "dev";
try {
	registerGuard({ on: (e, fn) => (handler = fn) });
	const call = (t, i) => handler({ toolName: t, input: i }, { cwd: dir });
	// 基线: deny 拦截
	const base = await call("write", { path: "target.txt", content: "x" });
	if (base?.block !== true) throw new Error("基线失真: deny * target.txt 应拦截");
	// 会话外改 allow,不重启进程
	fs.writeFileSync(policy, "allow dev target.txt\n");
	// 复现①: 同 handler 下一次调用仍被拦（缓存终身不失效）
	const after = await call("write", { path: "target.txt", content: "x" });
	if (after?.block === true) {
		console.error("BUG-1①复现: allow 落盘后仍被旧快照拦截 ——", after.reason);
	} else {
		console.log("BUG-1① 修复已生效（allow 即时放行）");
	}
	// 复现②: 删除 policy → 期望 fail-closed（文案含 fail-closed/策略缺失原因）
	fs.unlinkSync(policy);
	const missing = await call("write", { path: "anything.txt", content: "x" });
	const missingBlocked = missing?.block === true && /[Ff]ail[- ]closed|策略缺失/i.test(missing?.reason ?? "");
	if (missing?.block !== true) {
		console.error("BUG-1②复现: policy 缺失时 write 被整体放行（return undefined, fail-open）");
	} else if (!missingBlocked) {
		console.error("BUG-1②部分复现: 拦截发生但文案无 fail-closed/策略缺失语义（可观测性缺口）：", missing.reason);
	} else {
		console.log("BUG-1② 修复已生效（缺失 fail-closed + 明示原因）");
	}
	const broke = after?.block === true || missingBlocked !== true;
	console.log(broke ? "\n复现成功（exit 1）" : "\n修复完整,复现失败（exit 0）");
	fs.rmSync(dir, { recursive: true, force: true });
	process.exit(broke ? 1 : 0);
} catch (er) {
	console.error("复现脚本自身错误:", er.message);
	fs.rmSync(dir, { recursive: true, force: true });
	process.exit(2);
} finally {
	if (previous === undefined) delete process.env.TRIO_ROLE;
	else process.env.TRIO_ROLE = previous;
}
