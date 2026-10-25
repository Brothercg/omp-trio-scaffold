#!/usr/bin/env bash
#
# init-agent.sh —— 把「敏捷三人行」脚手架注入到一个目标项目
#
# 做的事情：
#   1. 创建目录：docs/task（任务产物聚合层）docs/architecture src tests
#   2. 注入 .omp/trio/  —— 角色简报、写策略真值源
#   3. 注入 .omp/trio/templates/ —— 任务产物模板（看板/契约/交付/报告/缺陷/裁决）
#   4. 注入 .omp/hooks/pre/trio-guard.ts —— 进程内写前拦截
#   5. 注入 .git/hooks/pre-commit + bin/trio-check-report.mjs —— 提交兜底与报告校验
#   6. 注入 tests/ —— 门禁策略与报告校验器的回归测试
#
# 幂等性：已存在的文件一律不覆盖（打印「跳过」），需要覆盖时显式加 --force。
#
# 用法：
#   bin/init-agent.sh [目标项目路径] [--force]
#
# 目标项目路径默认为当前目录。

set -euo pipefail

# 解析软链后的真实路径：本脚本可被 symlink 到 ~/.local/bin 等 PATH 目录。
# 直接用 dirname $BASH_SOURCE 会把 SCAFFOLD_ROOT 算成软链所在目录的上级。
readonly SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly SELF_DIR="$(dirname "$SELF_PATH")"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"

# ── 参数解析 ───────────────────────────────────────────────────────────────

TARGET_DIR=""
FORCE=0

usage() {
	cat <<'EOF'
用法: init-agent.sh [目标项目路径] [--force]

  目标项目路径   要初始化脚手架的项目目录，默认为当前目录
  --force        覆盖已存在的文件（默认不覆盖，只打印「跳过」）
  -h, --help     显示本帮助

示例:
  bin/init-agent.sh ~/projects/my-app
  bin/init-agent.sh ~/projects/my-app --force
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--force)
			FORCE=1
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		--)
			shift
			break
			;;
		-*)
			printf 'init-agent.sh: 未知选项 %s\n' "$1" >&2
			usage >&2
			exit 2
			;;
		*)
			if [[ -n "$TARGET_DIR" ]]; then
				printf 'init-agent.sh: 只接受一个目标项目路径（已有 "%s"，又收到 "%s"）\n' \
					"$TARGET_DIR" "$1" >&2
				exit 2
			fi
			TARGET_DIR="$1"
			shift
			;;
	esac
done

TARGET_DIR="${TARGET_DIR:-$PWD}"

# ── 前置检查 ───────────────────────────────────────────────────────────────

if [[ ! -d "$TARGET_DIR" ]]; then
	printf 'init-agent.sh: 目标目录不存在：%s\n' "$TARGET_DIR" >&2
	exit 1
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

if [[ ! -f "${SCAFFOLD_ROOT}/templates/pre-commit" ]]; then
	printf 'init-agent.sh: 脚手架不完整，缺少 templates/pre-commit（源目录：%s）\n' "$SCAFFOLD_ROOT" >&2
	exit 1
fi

if ! command -v git >/dev/null 2>&1; then
	printf 'init-agent.sh: 未找到 git，无法安装 pre-commit 门禁\n' >&2
	exit 1
fi

if ! git -C "$TARGET_DIR" rev-parse --git-dir >/dev/null 2>&1; then
	printf 'init-agent.sh: %s 不是 git 仓库。pre-commit 门禁需要 git 仓库。\n' "$TARGET_DIR" >&2
	printf '  可先执行：cd %s && git init\n' "$TARGET_DIR" >&2
	exit 1
fi

GIT_DIR_RAW="$(git -C "$TARGET_DIR" rev-parse --git-dir)"
GIT_DIR_ABS="$(cd "${TARGET_DIR}/${GIT_DIR_RAW}" && pwd)"

# ── 输出helpers ───────────────────────────────────────────────────────────

CREATED=0
SKIPPED=0

# create_file <目标绝对路径> <源文件> <权限>
create_file() {
	local dest="$1" src="$2" mode="${3:-644}"
	if [[ -e "$dest" ]]; then
		if [[ "$FORCE" -eq 1 ]]; then
			install -m "$mode" "$src" "$dest"
			printf '  覆盖  %s\n' "${dest#"${TARGET_DIR}"/}"
			CREATED=$((CREATED + 1))
		else
			printf '  跳过  %s（已存在）\n' "${dest#"${TARGET_DIR}"/}"
			SKIPPED=$((SKIPPED + 1))
		fi
		return
	fi
	mkdir -p "$(dirname "$dest")"
	install -m "$mode" "$src" "$dest"
	printf '  创建  %s\n' "${dest#"${TARGET_DIR}"/}"
	CREATED=$((CREATED + 1))
}

# create_dir <目录绝对路径>
create_dir() {
	local dir="$1"
	if [[ -d "$dir" ]]; then
		printf '  存在  %s\n' "${dir#"${TARGET_DIR}"/}"
		return
	fi
	mkdir -p "$dir"
	printf '  创建  %s/\n' "${dir#"${TARGET_DIR}"/}"
}

printf 'TRIO 脚手架初始化\n'
printf '目标项目：%s\n' "$TARGET_DIR"
[[ "$FORCE" -eq 1 ]] && printf '模式：--force（覆盖已存在文件）\n\n' || printf '模式：默认（不覆盖已存在文件）\n\n'

# ── 1. 契约目录 ───────────────────────────────────────────────────────────

printf '[1/6] 工作目录\n'
for dir in docs/task docs/architecture src tests; do
	create_dir "${TARGET_DIR}/${dir}"
done

# ── 2. .omp/trio/ 角色简报与写策略 ─────────────────────────────────────────

printf '\n[2/6] 角色简报与写策略\n'
create_file "${TARGET_DIR}/.omp/trio/arch.rules.md" "${SCAFFOLD_ROOT}/profiles/arch.rules.md"
create_file "${TARGET_DIR}/.omp/trio/dev.rules.md" "${SCAFFOLD_ROOT}/profiles/dev.rules.md"
create_file "${TARGET_DIR}/.omp/trio/test.rules.md" "${SCAFFOLD_ROOT}/profiles/test.rules.md"
create_file "${TARGET_DIR}/.omp/trio/policy.txt" "${SCAFFOLD_ROOT}/.omp/trio/policy.txt"

# ── 3. 任务产物模板 ───────────────────────────────────────────────────────

printf '\n[3/6] 任务产物模板\n'
for template in "${SCAFFOLD_ROOT}"/templates/*.md; do
	create_file "${TARGET_DIR}/.omp/trio/templates/$(basename "$template")" "$template"
done

# ── 4. 进程内写门禁 hook ──────────────────────────────────────────────────

printf '\n[4/6] 进程内写门禁（omp hook）\n'
create_file "${TARGET_DIR}/.omp/hooks/pre/trio-guard.ts" \
	"${SCAFFOLD_ROOT}/.omp/hooks/pre/trio-guard.ts"

# ── 5. 提交前兜底门禁 + 报告校验器 ────────────────────────────────────────

printf '\n[5/6] 提交前兜底门禁（git pre-commit）\n'
create_file "${GIT_DIR_ABS}/hooks/pre-commit" "${SCAFFOLD_ROOT}/templates/pre-commit" "755"
create_file "${TARGET_DIR}/bin/trio-check-report.mjs" \
	"${SCAFFOLD_ROOT}/bin/trio-check-report.mjs" "755"

# ── 6. 门禁回归测试 ───────────────────────────────────────────────────────

printf '\n[6/6] 门禁回归测试\n'
create_file "${TARGET_DIR}/tests/trio-policy.test.mjs" "${SCAFFOLD_ROOT}/tests/trio-policy.test.mjs"
create_file "${TARGET_DIR}/tests/trio-check-report.test.mjs" \
	"${SCAFFOLD_ROOT}/tests/trio-check-report.test.mjs"
create_file "${TARGET_DIR}/tests/trio-guard.test.mjs" \
	"${SCAFFOLD_ROOT}/tests/trio-guard.test.mjs"

# ── 汇总 ───────────────────────────────────────────────────────────────────

# 通过 trio-install.sh 发布的软链调用时，提示短命令；直接调用则给绝对路径。
if [[ -L "${BASH_SOURCE[0]}" ]]; then
	START_HINT="trio-start"
	TEST_HINT="trio-selftest"
else
	START_HINT="${SCAFFOLD_ROOT}/bin/start-agent.sh"
	TEST_HINT="${SCAFFOLD_ROOT}/bin/trio-selftest.sh"
fi

printf '\n完成：新建 %d 项，跳过 %d 项。\n' "$CREATED" "$SKIPPED"
printf '\n下一步：\n'
printf '  1. 在项目根目录开三个终端，分别执行：\n'
printf '       %s arch\n' "$START_HINT"
printf '       %s dev\n' "$START_HINT"
printf '       %s qa\n' "$START_HINT"
printf '  2. 自测门禁是否生效：%s %s\n' "$TEST_HINT" "$TARGET_DIR"
