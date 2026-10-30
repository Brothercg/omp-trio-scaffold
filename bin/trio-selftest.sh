#!/usr/bin/env bash
#
# trio-selftest.sh —— 一键自测 TRIO 门禁是否真的生效
#
# 用法:
#   bin/trio-selftest.sh [目标项目路径] [--fast]
#
#   --fast  跳过真实 omp 调用（只跑静态检查、单元测试与 pre-commit 探针）
#
# 自测覆盖：
#   1. 安装完整性：hook / 策略 / pre-commit / 校验器 / 模板
#   2. 全部 tests/*.test.mjs 门禁回归测试
#   3. pre-commit 角色门禁：越权提交被拒、合规提交放行、无角色放行
#   4. pre-commit 报告硬门禁：不合规报告被拒
#   5. 真实 omp：write / edit / bash 三通道 + 角色白名单

set -uo pipefail

# 解析软链后的真实路径：本脚本可被 symlink 到 ~/.local/bin 等 PATH 目录。
# 直接用 dirname $BASH_SOURCE 会把 SCAFFOLD_ROOT 算成软链所在目录的上级。
readonly SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly SELF_DIR="$(dirname "$SELF_PATH")"

# 根自定位（ADR-0015 §2.4）：脚本可能位于 <root>/bin/ 或 <root>/tooling/bin/。
# 依次探测 SELF_DIR/.. 与 SELF_DIR/../..，取第一个含 policy.txt 的物理路径。
resolve_root() {
	local self_dir="$1" candidate
	for candidate in "${self_dir}/.." "${self_dir}/../.."; do
		if [[ -f "${candidate}/.omp/trio/policy.txt" ]]; then
			(cd "$candidate" && pwd -P)
			return 0
		fi
	done
	printf '无法定位仓库根：%s 向上两级未见 .omp/trio/policy.txt\n' "$self_dir" >&2
	return 1
}

SCAFFOLD_ROOT="$(resolve_root "$SELF_DIR")" || exit 1
readonly SCAFFOLD_ROOT

PROJECT_DIR=""
FAST=0

while [[ $# -gt 0 ]]; do
	case "$1" in
		--fast)
			FAST=1
			shift
			;;
		-h | --help)
			sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		-*)
			printf 'trio-selftest.sh: 未知选项 %s\n' "$1" >&2
			exit 2
			;;
		*)
			PROJECT_DIR="$1"
			shift
			;;
	esac
done

PROJECT_DIR="${PROJECT_DIR:-$PWD}"

PASS=0
FAIL=0

if [[ -t 1 ]]; then
	GREEN=$'\033[32m'
	RED=$'\033[31m'
	BOLD=$'\033[1m'
	RESET=$'\033[0m'
else
	GREEN=""
	RED=""
	BOLD=""
	RESET=""
fi

green() { printf '%s%s%s\n' "$GREEN" "$*" "$RESET"; }
red() { printf '%s%s%s\n' "$RED" "$*" "$RESET"; }
bold() { printf '%s%s%s\n' "$BOLD" "$*" "$RESET"; }

check() {
	# check <描述> <期望: pass|fail> <实际退出码>
	local desc="$1" expect="$2" actual="$3"
	if [[ "$expect" == "pass" && "$actual" -eq 0 ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	elif [[ "$expect" == "fail" && "$actual" -ne 0 ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	else
		red "  ✗ $desc（期望 $expect，实际退出码 $actual）"
		FAIL=$((FAIL + 1))
	fi
}

bold "TRIO 门禁自测"
printf '项目目录：%s\n\n' "$PROJECT_DIR"

# ── 0. 前置检查 ────────────────────────────────────────────────────────────

if [[ ! -d "$PROJECT_DIR" ]]; then
	red "项目目录不存在：$PROJECT_DIR"
	exit 1
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

HOOK="${PROJECT_DIR}/.omp/hooks/pre/trio-guard.ts"
POLICY="${PROJECT_DIR}/.omp/trio/policy.txt"
PRECOMMIT="${PROJECT_DIR}/.git/hooks/pre-commit"
if [[ "$SELF_DIR" == "${SCAFFOLD_ROOT}/tooling/bin" ]]; then
	VALIDATOR="${PROJECT_DIR}/tooling/bin/trio-check-report.mjs"
	[[ -f "$VALIDATOR" ]] || VALIDATOR="${PROJECT_DIR}/bin/trio-check-report.mjs"
else
	VALIDATOR="${PROJECT_DIR}/bin/trio-check-report.mjs"
	[[ -f "$VALIDATOR" ]] || VALIDATOR="${PROJECT_DIR}/tooling/bin/trio-check-report.mjs"
fi
EXTENSION="${PROJECT_DIR}/.omp/extensions/trio-session-name.ts"

TASK_DIR="${PROJECT_DIR}/docs/task/TRIO-SELFTEST"
# 每次运行注入唯一标记：若 HEAD 里残留同内容夹具，git add 会变成 no-op，
# 导致 git commit 以「无改动」退出 1，被误判成「门禁拒绝」。
RUN_ID="$(date +%s)-$$"
REPORT_OK="${TASK_DIR}/qa-20261025-1510-report-selftest.md"
REPORT_BAD="${TASK_DIR}/qa-20261025-1520-report-selftest-bad.md"

bold "[1/8] 安装完整性"

missing=0
for pair in "hook:${HOOK}" "策略:${POLICY}" "报告校验器:${VALIDATOR}" "会话名扩展:${EXTENSION}" \
	"post-commit 审计:${PROJECT_DIR}/.git/hooks/post-commit" "pre-push 发布门禁:${PROJECT_DIR}/.git/hooks/pre-push"; do
	name="${pair%%:*}"
	path="${pair#*:}"
	if [[ -f "$path" ]]; then
		green "  ✓ ${name}已安装：${path#"${PROJECT_DIR}"/}"
		PASS=$((PASS + 1))
	else
		red "  ✗ ${name}缺失：${path}"
		FAIL=$((FAIL + 1))
		missing=1
	fi
done
if [[ -x "$PRECOMMIT" ]]; then
	green "  ✓ pre-commit 已安装且可执行"
	PASS=$((PASS + 1))
else
	red "  ✗ pre-commit 缺失或不可执行：$PRECOMMIT"
	FAIL=$((FAIL + 1))
	missing=1
fi
# TASK-007 AC-5：gate-version 声明与执法件内嵌 EXPECTED 必须对齐。
if grep -q '^# gate-version: 1' "$POLICY" && grep -q 'EXPECTED_GATE_VERSION = 1' "$HOOK"; then
	green "  ✓ gate-version 自证：policy 声明 1 == 执法件 EXPECTED 1"
	PASS=$((PASS + 1))
else
	red "  ✗ gate-version 漂移：policy 缺 '# gate-version: 1' 或 guard 缺 EXPECTED_GATE_VERSION=1"
	FAIL=$((FAIL + 1))
	missing=1
fi
if [[ -f "${PROJECT_DIR}/.omp/trio/templates/board.template.md" ]]; then
	green "  ✓ 产物模板已部署：.omp/trio/templates/"
	PASS=$((PASS + 1))
else
	red "  ✗ 产物模板缺失：.omp/trio/templates/board.template.md"
	FAIL=$((FAIL + 1))
	missing=1
fi
if [[ -f "${PROJECT_DIR}/docs/REPLY-CONVENTIONS.md" ]]; then
	green "  ✓ 回复规范已注入：docs/REPLY-CONVENTIONS.md"
	PASS=$((PASS + 1))
else
	red "  ✗ 回复规范缺失：docs/REPLY-CONVENTIONS.md"
	FAIL=$((FAIL + 1))
	missing=1
fi
if [[ "$missing" -eq 1 ]]; then
	INIT_HINT="${SCAFFOLD_ROOT}/bin/init-agent.sh"
	if [[ "$SELF_DIR" == "${SCAFFOLD_ROOT}/tooling/bin" && -f "${SCAFFOLD_ROOT}/tooling/bin/init-agent.sh" ]]; then
		INIT_HINT="${SCAFFOLD_ROOT}/tooling/bin/init-agent.sh"
	fi
	red "  安装不完整，后续测试无意义。先运行：${INIT_HINT} ${PROJECT_DIR}"
	exit 1
fi

# 软链发布自检。历史缺陷：用 dirname $BASH_SOURCE 推导根目录，
# 脚本被 symlink 到 ~/.local/bin 后 SCAFFOLD_ROOT 会算成 ~/.local，
# 表现为「脚手架不完整」。trio-install.sh --check 只读，可安全用作探针。
INSTALL_SH=""
for candidate in "${SCAFFOLD_ROOT}/bin/trio-install.sh" "${SCAFFOLD_ROOT}/tooling/bin/trio-install.sh"; do
	if [[ -f "$candidate" ]]; then
		INSTALL_SH="$candidate"
		break
	fi
done
if [[ -z "$INSTALL_SH" ]]; then
	green "  跳过：未找到 trio-install.sh（本布局无该件）"
else
	LINK_PROBE="$(mktemp -d)"
	ln -sfn "$INSTALL_SH" "${LINK_PROBE}/trio-install"
	LINK_OUT="$("${LINK_PROBE}/trio-install" --check --prefix "${LINK_PROBE}/bin" 2>&1 || true)"
	if printf '%s' "$LINK_OUT" | grep -q '脚手架不完整'; then
		red "  ✗ 软链发布失效：通过 symlink 调用时 SCAFFOLD_ROOT 解析错误"
		FAIL=$((FAIL + 1))
	else
		green "  ✓ 软链发布可用（symlink 调用时根目录解析正确）"
		PASS=$((PASS + 1))
	fi
	rm -rf "$LINK_PROBE"
fi

# ── 1. 预置测试夹具 ───────────────────────────────────────────────────────

bold "[2/8] 准备测试夹具"
mkdir -p "${PROJECT_DIR}/src" "${PROJECT_DIR}/tests" "$TASK_DIR"
printf 'def add(a, b):\n    return a + b\n' >"${PROJECT_DIR}/src/trio_probe.py"
printf 'def test_placeholder():\n    assert True\n' >"${PROJECT_DIR}/tests/trio_probe_test.py"
printf '# 自测占位看板\n' >"${TASK_DIR}/board.md"
green "  ✓ 夹具就绪"

# ── 2. 单元测试 ───────────────────────────────────────────────────────────

bold "[3/8] 单元测试"

if ! command -v bun >/dev/null 2>&1; then
	red "  ✗ 缺少 bun，无法运行单元测试"
	FAIL=$((FAIL + 1))
else
	AUTHORING=0
	if [[ -d "${SCAFFOLD_ROOT}/profiles" && -f "${SCAFFOLD_ROOT}/bin/trio-align.sh" ]]; then
		AUTHORING=1
	fi
	# R6：按脚本自身布局选套件目录；首选非空只跑首选，另一目录忽略并提示。
	if [[ "$SELF_DIR" == "${SCAFFOLD_ROOT}/tooling/bin" ]]; then
		preferred_rel="tooling/tests"
		other_rel="tests"
	else
		preferred_rel="tests"
		other_rel="tooling/tests"
	fi
	shopt -s nullglob
	suites=("${SCAFFOLD_ROOT}/${preferred_rel}"/*.test.mjs)
	other_suites=("${SCAFFOLD_ROOT}/${other_rel}"/*.test.mjs)
	shopt -u nullglob
	if [[ ${#suites[@]} -eq 0 && ${#other_suites[@]} -gt 0 ]]; then
		printf '提示  %s/ 无套件，回退 %s/（%d 个 .test.mjs）\n' \
			"$preferred_rel" "$other_rel" "${#other_suites[@]}"
		suites=("${other_suites[@]}")
	elif [[ ${#suites[@]} -gt 0 && ${#other_suites[@]} -gt 0 ]]; then
		printf '提示  忽略 %s/（%d 个 .test.mjs，与本布局不符，保留未删除）\n' \
			"$other_rel" "${#other_suites[@]}"
	fi
	if [[ ${#suites[@]} -eq 0 ]]; then
		red "  ✗ 未找到任何测试套件：${SCAFFOLD_ROOT}/${preferred_rel}/*.test.mjs 或 ${SCAFFOLD_ROOT}/${other_rel}/*.test.mjs"
		FAIL=$((FAIL + 1))
	else
		for file in "${suites[@]}"; do
			name="${file##*/}"
			name="${name%.test.mjs}"
			# R6：脚手架专有套件在安装仓不适用；不计通过/失败。
			# 上游 authoring 仓（有 profiles/ 与 bin/trio-align.sh）仍执行，保留自检覆盖。
			if [[ "$AUTHORING" -eq 0 ]] && head -n 20 "$file" | grep -q '@trio-suite scaffold-only'; then
				printf '  跳过  %s（脚手架自检套件，不适用本仓）\n' "$name"
				continue
			fi
			if bun "$file" >/tmp/trio-unit-out.$$ 2>&1; then
				summary="$(grep -oE '通过 [0-9]+ 项|[0-9]+ passed' /tmp/trio-unit-out.$$ | tail -1)"
				green "  ✓ ${name} 测试通过（${file#"${SCAFFOLD_ROOT}"/}；${summary:-完成}）"
				PASS=$((PASS + 1))
			else
				red "  ✗ ${name} 测试失败："
				sed 's/^/      /' /tmp/trio-unit-out.$$ | tail -20
				FAIL=$((FAIL + 1))
			fi
		done
	fi
	rm -f /tmp/trio-unit-out.$$
fi

# ── 3. pre-commit 角色门禁 ────────────────────────────────────────────────

bold "[4/8] pre-commit 角色门禁"

if ! git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
	red "  ✗ 不是 git 仓库：$PROJECT_DIR"
	FAIL=$((FAIL + 1))
	exit 1
fi

BASE_HEAD="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || true)"

probe_commit() {
	# probe_commit <role|unset> <要暂存的文件...>
	# 只暂存显式列出的文件：夹具里其他文件本就不该被该角色提交。
	local role="$1"
	shift
	git -C "$PROJECT_DIR" reset -q >/dev/null 2>&1 || true
	git -C "$PROJECT_DIR" add -- "$@" >/dev/null 2>&1 || true
	if [[ "$role" == "unset" ]]; then
		env -u TRIO_ROLE git -C "$PROJECT_DIR" commit -q -m "probe" >/dev/null 2>&1
	else
		TRIO_ROLE="$role" git -C "$PROJECT_DIR" commit -q -m "probe" >/dev/null 2>&1
	fi
	return $?
}

# DEV 提交 tests/ → 拒绝
printf '\ndef test_new():\n    assert True\n' >>"${PROJECT_DIR}/tests/trio_probe_test.py"
probe_commit dev "tests/trio_probe_test.py"
check "DEV 提交 tests/ 被拒绝" "fail" "$?"

# DEV 提交 ARCH 的契约文件 → 拒绝（跨角色）
printf '# fake spec\n<!-- run:%s -->\n' "$RUN_ID" >"${TASK_DIR}/arch-20261025-0900-spec.md"
probe_commit dev "${TASK_DIR#"${PROJECT_DIR}"/}/arch-20261025-0900-spec.md"
check "DEV 提交 ARCH 契约被拒绝" "fail" "$?"

# DEV 提交 src/ → 放行
printf '\n# probe\n' >>"${PROJECT_DIR}/src/trio_probe.py"
probe_commit dev "src/trio_probe.py"
check "DEV 提交 src/ 被放行" "pass" "$?"

# 无角色标记 → 放行（人工逃生舱）
printf '\n# probe2\n' >>"${PROJECT_DIR}/src/trio_probe.py"
probe_commit unset "src/trio_probe.py"
check "无 TRIO_ROLE 时提交被放行（人工逃生舱）" "pass" "$?"

# ── 4. pre-commit 报告硬门禁 ──────────────────────────────────────────────

bold "[5/8] pre-commit 报告硬门禁"

cat >"$REPORT_OK" <<'REPORT'
# 自测 · 验收报告

> 运行环境：bun 1.4.2
> 基线 commit：3b6f308
> 运行时间：2026-10-25 15:10

| 用例 | 位置 | 结论 | 说明 |
|---|---|---|---|
| AC-1 | — | 通过 | — |

## AC → 用例覆盖矩阵

| AC | 用例编号 | 备注 |
|---|---|---|
| AC-1 | AC-1 | — |

## 汇总

总判定：通过。覆盖度：对照契约 1 条，共 1 条，通过 1、半通过 0、未通过 0、SKIP 0（SKIP 不计 PASS，单列计账）。
REPORT
printf '\n<!-- run:%s -->\n' "$RUN_ID" >>"$REPORT_OK"

report_rel="${REPORT_OK#"${PROJECT_DIR}"/}"
probe_commit qa "$report_rel"
check "合规验收报告被放行" "pass" "$?"

# 不合规：结论用了 PASS 而非「通过」
sed 's/| AC-1 | — | 通过 | — |/| AC-1 | — | PASS | — |/; s/1510/1520/' "$REPORT_OK" >"$REPORT_BAD"
report_bad_rel="${REPORT_BAD#"${PROJECT_DIR}"/}"
probe_commit qa "$report_bad_rel"
check "不合规验收报告被拒绝（结论值域）" "fail" "$?"

# ── 5. 真实 omp 冒烟（可选） ───────────────────────────────────────────────

if [[ "$FAST" -eq 1 ]]; then
	bold "[6/8] omp 冒烟：已跳过（--fast）"
	bold "[7/8] 角色白名单：已跳过（--fast）"
elif ! command -v omp >/dev/null 2>&1; then
	bold "[6/8] omp 冒烟：跳过（未找到 omp）"
	bold "[7/8] 角色白名单：跳过（未找到 omp）"
else
	bold "[6/8] omp 冒烟：write / edit / bash 三通道"

	PROMPT='Execute these four steps in order, using the named tool each time. Do not deviate:
(1) use the write tool to create file src/trio_write_ok.txt with content "ok"
(2) use the write tool to create file tests/trio_write_blocked.txt with content "bad"
(3) use the edit tool to change the word "return a + b" to "return a + b  # touched" in src/trio_probe.py
(4) use the bash tool to run exactly: echo bad > tests/trio_bash_blocked.txt
After all four, report EXACTLY one line per step in the form "STEP n: SUCCEEDED" or "STEP n: BLOCKED", plus the block reason text if blocked. Do not use any other tool to accomplish these steps.'

	OMP_OUT="$(cd "$PROJECT_DIR" && TRIO_ROLE=dev omp -p "$PROMPT" 2>&1)"

	# 模型不可用（订阅/限流/额度）不是门禁缺陷 —— 单独跳过，不计失败。
	# 门禁本身的等价证明在 [3/8] 的 hook 运行时测试（不依赖模型）。
	ENV_ERR="$(printf '%s' "$OMP_OUT" |
		grep -oiE 'MODEL_NOT_IN_PLAN|GoUsageLimitError|usage limit exceeded|permission_error|rate_limit|authentication_error|Invalid 'Authorization'' |
		head -1 || true)"
	if [[ -n "$ENV_ERR" ]]; then
		bold "[6/8] omp 冒烟：跳过（omp 环境不可用：${ENV_ERR}）"
		bold "[7/8] 角色白名单：跳过（同上）"
		green "  - 门禁等价证明见 [3/8] hook 运行时测试"
	else
		printf '%s\n' "$OMP_OUT" | sed -n '1,200p' | grep -E "STEP [1-4]:" || true

	for pair in "1:SUCCEEDED:write → src/ 放行" "2:BLOCKED:write → tests/ 被拦" \
		"3:SUCCEEDED:edit → src/ 放行" "4:BLOCKED:bash → tests/ 被拦"; do
		step="${pair%%:*}"
		rest="${pair#*:}"
		expect="${rest%%:*}"
		label="${rest#*:}"
		if printf '%s' "$OMP_OUT" | grep -qE "STEP ${step}: ${expect}"; then
			green "  ✓ ${label}"
			PASS=$((PASS + 1))
		else
			red "  ✗ ${label}（期望 STEP ${step}: ${expect}）"
			FAIL=$((FAIL + 1))
		fi
	done

	bold "[7/8] 角色白名单：QA 不得写 src/"

	QA_PROMPT='Use the write tool to create file src/trio_qa_should_fail.txt with content "x". Then report exactly one line: "QA-WRITE: SUCCEEDED" or "QA-WRITE: BLOCKED" followed by the block reason.'
	QA_OUT="$(cd "$PROJECT_DIR" && TRIO_ROLE=qa omp -p "$QA_PROMPT" 2>&1)"
	printf '%s\n' "$QA_OUT" | grep -E "QA-WRITE:" || true

	if printf '%s' "$QA_OUT" | grep -qE "QA-WRITE: BLOCKED"; then
		green "  ✓ QA 写 src/ 被拦"
		PASS=$((PASS + 1))
	else
		red "  ✗ QA 写 src/ 应被拦"
		FAIL=$((FAIL + 1))
	fi
	fi
fi

# ── 6. 清理 ────────────────────────────────────────────────────────────────

bold "[8/8] 清理测试夹具"

# 撤销探针产生的提交（保留工作树），再删夹具。
if [[ -n "$BASE_HEAD" ]]; then
	git -C "$PROJECT_DIR" reset -q --mixed "$BASE_HEAD" >/dev/null 2>&1 || true
else
	git -C "$PROJECT_DIR" reset -q >/dev/null 2>&1 || true
fi

rm -f "${PROJECT_DIR}/src/trio_probe.py" "${PROJECT_DIR}/src/trio_write_ok.txt" \
	"${PROJECT_DIR}/src/trio_qa_should_fail.txt" "${PROJECT_DIR}/tests/trio_probe_test.py" \
	"${PROJECT_DIR}/tests/trio_write_blocked.txt" "${PROJECT_DIR}/tests/trio_bash_blocked.txt"
rm -rf "$TASK_DIR"
green "  ✓ 已清理"

# ── 汇总 ───────────────────────────────────────────────────────────────────

printf '\n'
bold "结果：通过 $PASS 项，失败 $FAIL 项"
if [[ "$FAIL" -gt 0 ]]; then
	exit 1
fi
green "门禁全部生效。"
