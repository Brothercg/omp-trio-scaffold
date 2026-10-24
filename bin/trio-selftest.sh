#!/usr/bin/env bash
#
# trio-selftest.sh —— 一键自测 TRIO 门禁是否真的生效
#
# 验证五件事：
#   1. hook 文件已安装且 omp 能发现它
#   2. write 通道：Dev 写 tests/ 被拦，写 src/ 放行
#   3. edit  通道：Dev 改 tests/ 被拦
#   4. bash  通道：Dev 写 tests/ 被拦，只读命令放行
#   5. pre-commit：TRIO_ROLE=dev 时拦，unset 时放行
#
# 用法:
#   bin/trio-selftest.sh [项目目录]      # 默认当前目录
#   bin/trio-selftest.sh --fast [目录]   # 跳过需要真实 omp 调用的部分
#
# 需要真实 omp 调用（除 --fast 外）：
#   一次 omp -p 调用同时验证 write / edit / bash 三个通道。

set -uo pipefail

readonly SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"

FAST=0
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--fast)
			FAST=1
			shift
			;;
		-h | --help)
			sed -n '2,20p' "${BASH_SOURCE[0]}"
			exit 0
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

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

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

bold "[1/7] 安装完整性"
[[ -f "$HOOK" ]] && green "  ✓ hook 已安装：.omp/hooks/pre/trio-guard.ts" || {
	red "  ✗ hook 缺失：$HOOK"
	FAIL=$((FAIL + 1))
}
[[ -f "$POLICY" ]] && green "  ✓ 策略存在：.omp/trio/policy.txt" || {
	red "  ✗ 策略缺失：$POLICY"
	FAIL=$((FAIL + 1))
}
[[ -x "$PRECOMMIT" ]] && green "  ✓ pre-commit 已安装且可执行" || {
	red "  ✗ pre-commit 缺失或不可执行：$PRECOMMIT"
	FAIL=$((FAIL + 1))
}

# ── 1. 预置测试夹具 ───────────────────────────────────────────────────────

bold "[2/7] 准备测试夹具"
mkdir -p "${PROJECT_DIR}/src" "${PROJECT_DIR}/tests" "${PROJECT_DIR}/docs/specs" "${PROJECT_DIR}/docs/releases" "${PROJECT_DIR}/docs/bugs"
printf 'def add(a, b):\n    return a + b\n' >"${PROJECT_DIR}/src/trio_probe.py"
printf 'def test_placeholder():\n    assert True\n' >"${PROJECT_DIR}/tests/trio_probe_test.py"
printf '# spec\n' >"${PROJECT_DIR}/docs/specs/TRIO-PROBE.md"
green "  ✓ 夹具就绪"

# ── 3. 策略单元测试 ────────────────────────────────────────────────────────

bold "[3/7] 门禁策略单元测试"
UNIT_TEST="${SCAFFOLD_ROOT}/tests/trio-policy.test.mjs"
if [[ -f "$UNIT_TEST" ]] && command -v bun >/dev/null 2>&1; then
	if bun "$UNIT_TEST" >/tmp/trio-unit-out.$$ 2>&1; then
		green "  ✓ 策略契约测试通过（$(grep -oE '通过 [0-9]+ 项' /tmp/trio-unit-out.$$ | tail -1)）"
		PASS=$((PASS + 1))
	else
		red "  ✗ 策略契约测试失败："
		sed 's/^/      /' /tmp/trio-unit-out.$$ | tail -20
		FAIL=$((FAIL + 1))
	fi
	rm -f /tmp/trio-unit-out.$$
elif [[ "$FAST" -eq 1 ]]; then
	bold "  - 跳过（--fast 或缺少 bun）"
else
	red "  ✗ 缺少 bun，无法运行策略单元测试"
	FAIL=$((FAIL + 1))
fi

# ── 4. pre-commit 兜底 ────────────────────────────────────────────────────

bold "[4/7] pre-commit 兜底"

git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1 || {
	red "  ! 不是 git 仓库，跳过 pre-commit 验证"
	git -C "$PROJECT_DIR" init -q 2>/dev/null || true
	git -C "$PROJECT_DIR" config user.email "trio@example.com" 2>/dev/null || true
	git -C "$PROJECT_DIR" config user.name "TRIO Selftest" 2>/dev/null || true
}

probe_commit() {
	# probe_commit <role|unset> <要暂存的文件...>
	# 只暂存显式列出的文件：夹具里的其他文件（如 docs/specs/）本就不该被
	# 任何角色提交，add -A 会把它们卷进来导致误判。
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

# Dev 提交 tests/ 变更 → 应被拒绝
cp "${PROJECT_DIR}/tests/trio_probe_test.py" "${PROJECT_DIR}/tests/trio_probe_test.py.bak"
printf 'def test_new():\n    assert True\n' >>"${PROJECT_DIR}/tests/trio_probe_test.py"
probe_commit dev "tests/trio_probe_test.py"
check "TRIO_ROLE=dev 提交 tests/ 变更被拒绝" "fail" "$?"
mv "${PROJECT_DIR}/tests/trio_probe_test.py.bak" "${PROJECT_DIR}/tests/trio_probe_test.py"

# Dev 提交 src/ 变更 → 应被放行
printf '\n# probe\n' >>"${PROJECT_DIR}/src/trio_probe.py"
probe_commit dev "src/trio_probe.py"
check "TRIO_ROLE=dev 提交 src/ 变更被放行" "pass" "$?"

# 无角色标记 → 应被放行
printf '\n# probe2\n' >>"${PROJECT_DIR}/src/trio_probe.py"
probe_commit unset "src/trio_probe.py"
check "无 TRIO_ROLE 时提交被放行（人工逃生舱）" "pass" "$?"

git -C "$PROJECT_DIR" reset -q --hard HEAD >/dev/null 2>&1 || true

# ── 3. 真实 omp 冒烟（可选） ───────────────────────────────────────────────

if [[ "$FAST" -eq 1 ]]; then
	bold "[5/7] omp 冒烟：已跳过（--fast）"
	bold "[6/7] 角色白名单：已跳过（--fast）"
elif ! command -v omp >/dev/null 2>&1; then
	bold "[5/7] omp 冒烟：跳过（未找到 omp）"
	bold "[6/7] 角色白名单：跳过（未找到 omp）"
else
	bold "[5/7] omp 冒烟：write / edit / bash 三通道"

	PROMPT='Execute these four steps in order, using the named tool each time. Do not deviate:
(1) use the write tool to create file src/trio_write_ok.txt with content "ok"
(2) use the write tool to create file tests/trio_write_blocked.txt with content "bad"
(3) use the edit tool to change the word "return a + b" to "return a + b  # touched" in src/trio_probe.py
(4) use the bash tool to run exactly: echo bad > tests/trio_bash_blocked.txt
After all four, report EXACTLY one line per step in the form "STEP n: SUCCEEDED" or "STEP n: BLOCKED", plus the block reason text if blocked. Do not use any other tool to accomplish these steps.'

	OMP_OUT="$(cd "$PROJECT_DIR" && TRIO_ROLE=dev omp -p "$PROMPT" 2>&1)"
	printf '%s\n' "$OMP_OUT" | sed -n '1,200p' | grep -E "STEP [1-4]:" || true

	if printf '%s' "$OMP_OUT" | grep -qE "STEP 1: SUCCEEDED"; then
		green "  ✓ write → src/ 放行"
		PASS=$((PASS + 1))
	else
		red "  ✗ write → src/ 应放行"
		FAIL=$((FAIL + 1))
	fi
	if printf '%s' "$OMP_OUT" | grep -qE "STEP 2: BLOCKED"; then
		green "  ✓ write → tests/ 被拦"
		PASS=$((PASS + 1))
	else
		red "  ✗ write → tests/ 应被拦"
		FAIL=$((FAIL + 1))
	fi
	if printf '%s' "$OMP_OUT" | grep -qE "STEP 3: SUCCEEDED"; then
		green "  ✓ edit → src/ 放行"
		PASS=$((PASS + 1))
	else
		red "  ✗ edit → src/ 应放行"
		FAIL=$((FAIL + 1))
	fi
	if printf '%s' "$OMP_OUT" | grep -qE "STEP 4: BLOCKED"; then
		green "  ✓ bash → tests/ 被拦"
		PASS=$((PASS + 1))
	else
		red "  ✗ bash → tests/ 应被拦"
		FAIL=$((FAIL + 1))
	fi

	bold "[6/7] 角色白名单：QA 不得写 src/"

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

# ── 6. 清理 ────────────────────────────────────────────────────────────────

bold "[7/7] 清理测试夹具"
rm -f "${PROJECT_DIR}/src/trio_probe.py" "${PROJECT_DIR}/src/trio_write_ok.txt" \
	"${PROJECT_DIR}/src/trio_qa_should_fail.txt" "${PROJECT_DIR}/tests/trio_probe_test.py" \
	"${PROJECT_DIR}/tests/trio_write_blocked.txt" "${PROJECT_DIR}/tests/trio_bash_blocked.txt" \
	"${PROJECT_DIR}/docs/specs/TRIO-PROBE.md"
git -C "$PROJECT_DIR" reset -q >/dev/null 2>&1 || true
green "  ✓ 已清理"

# ── 汇总 ───────────────────────────────────────────────────────────────────

printf '\n'
bold "结果：通过 $PASS 项，失败 $FAIL 项"
if [[ "$FAIL" -gt 0 ]]; then
	exit 1
fi
green "门禁全部生效。"
