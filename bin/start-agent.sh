#!/usr/bin/env bash
#
# start-agent.sh —— 以指定角色启动一个 omp 会话
#
# 用法:
#   bin/start-agent.sh <pm|dev|qa> [--project <项目目录>] [-- <透传给 omp 的参数>]
#
# 行为：
#   1. 导出 TRIO_ROLE=<角色>  —— 进程内 hook 与 git pre-commit 共用这一身份来源
#   2. 用 --append-system-prompt 注入对应角色简报
#      （不用 --system-prompt：那会整块替换默认提示，丢掉工具策略与工具清单，
#        与「能力全开」相悖）
#   3. 若设置 TRIO_MODEL，则以 --model <值> 启动；否则用 omp 当前默认模型
#
# 环境变量：
#   TRIO_ROLE   角色标识（由本脚本设置，一般无需手动指定）
#   TRIO_MODEL  可选。指定模型，如 `opus`、`gpt-5.2`；不设则用 omp 默认
#
# 示例:
#   bin/start-agent.sh dev
#   bin/start-agent.sh qa --project ~/projects/my-app
#   bin/start-agent.sh pm -- --thinking high

set -euo pipefail

readonly SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"

# ── 参数解析 ───────────────────────────────────────────────────────────────

ROLE=""
PROJECT_DIR=""
PASSTHROUGH=()

usage() {
	cat <<'EOF'
用法: start-agent.sh <pm|dev|qa> [--project <目录>] [-- <透传参数>]

  pm | dev | qa          角色标识（必填）
  --project <目录>       项目根目录，默认为当前目录
  -- <参数>              透传给 omp 的额外参数
  -h, --help             显示本帮助

环境变量:
  TRIO_MODEL   可选模型标识（如 opus、gpt-5.2）。不设则用 omp 当前默认模型。

示例:
  bin/start-agent.sh dev
  bin/start-agent.sh qa --project ~/projects/my-app
  bin/start-agent.sh pm -- --thinking high
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-h | --help)
			usage
			exit 0
			;;
		--project)
			if [[ $# -lt 2 ]]; then
				printf 'start-agent.sh: --project 缺少目录参数\n' >&2
				exit 2
			fi
			PROJECT_DIR="$2"
			shift 2
			;;
		--project=*)
			PROJECT_DIR="${1#--project=}"
			shift
			;;
		--)
			shift
			PASSTHROUGH=("$@")
			break
			;;
		-*)
			printf 'start-agent.sh: 未知选项 %s\n' "$1" >&2
			usage >&2
			exit 2
			;;
		*)
			if [[ -n "$ROLE" ]]; then
				printf 'start-agent.sh: 只接受一个角色（已有 "%s"，又收到 "%s"）\n' "$ROLE" "$1" >&2
				exit 2
			fi
			ROLE="$1"
			shift
			;;
	esac
done

# ── 校验 ───────────────────────────────────────────────────────────────────

if [[ -z "$ROLE" ]]; then
	printf 'start-agent.sh: 缺少角色参数（pm | dev | qa）\n' >&2
	usage >&2
	exit 2
fi

case "$ROLE" in
	pm | dev | qa) ;;
	*)
		printf 'start-agent.sh: 角色非法：%s（应为 pm | dev | qa）\n' "$ROLE" >&2
		exit 2
		;;
esac

PROJECT_DIR="${PROJECT_DIR:-$PWD}"
if [[ ! -d "$PROJECT_DIR" ]]; then
	printf 'start-agent.sh: 项目目录不存在：%s\n' "$PROJECT_DIR" >&2
	exit 1
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

if ! command -v omp >/dev/null 2>&1; then
	printf 'start-agent.sh: 未找到 omp 命令（PATH 中）\n' >&2
	exit 1
fi

# 角色 → 简报文件名的映射。QA 用 'test' 而非 'qa'（沿用 profiles/ 的出厂命名）。
case "$ROLE" in
	pm) ROLE_BRIEF="pm" ;;
	dev) ROLE_BRIEF="dev" ;;
	qa) ROLE_BRIEF="test" ;;
esac

ROLE_PROMPT="${PROJECT_DIR}/.omp/trio/${ROLE_BRIEF}.rules.md"
if [[ ! -f "$ROLE_PROMPT" ]]; then
	printf 'start-agent.sh: 找不到角色简报：%s\n' "$ROLE_PROMPT" >&2
	printf '  请先对该项目执行：%s/bin/init-agent.sh %s\n' "$SCAFFOLD_ROOT" "$PROJECT_DIR" >&2
	exit 1
fi

# ── 组装命令 ───────────────────────────────────────────────────────────────

CMD=(omp --cwd "$PROJECT_DIR" --append-system-prompt "$ROLE_PROMPT")

if [[ -n "${TRIO_MODEL:-}" ]]; then
	CMD+=(--model "$TRIO_MODEL")
fi

if [[ ${#PASSTHROUGH[@]} -gt 0 ]]; then
	CMD+=("${PASSTHROUGH[@]}")
fi

# ── 启动 ───────────────────────────────────────────────────────────────────

export TRIO_ROLE="$ROLE"

printf 'TRIO 角色 %s\n' "$ROLE"
printf '  项目目录：%s\n' "$PROJECT_DIR"
printf '  角色简报：%s\n' "$ROLE_PROMPT"
printf '  模型    ：%s\n' "${TRIO_MODEL:-（omp 默认）}"
printf '  执行    ：%s\n\n' "${CMD[*]}"

exec "${CMD[@]}"
