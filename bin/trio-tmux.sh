#!/usr/bin/env bash
#
# trio-tmux.sh —— 把当前终端分成三块，每块跑一个 TRIO 角色
#
# 一个 window、三个 pane（不是三个 window）：
#   rows（上中下）：ARCH / DEV / QA 依次堆叠
#   cols（左中右）：ARCH / DEV / QA 依次并排
#
# 若你不想用 tmux，等价做法是开三个终端，各自执行 `trio-start <角色>`
#  —— 那才是 trio 的原子模型（一个终端 = 一个角色），本脚本只是把
#  「开三个终端」这一步自动化成一个分屏。
#
# 模型由 start-agent.sh 决定：默认 deepseek/deepseek-v4.1-flash。
# 本脚本默认不带 --model，并清掉父 shell 残留的 TRIO_MODEL；
# 需要给三个 pane 统一换模型时用 --model。
#
# 用法:
#   bin/trio-tmux.sh [--layout rows|cols] [--project <目录>] [--session <名字>]
#                    [--model <标识>] [--no-attach] [--force] [--no-remain]
#
# 退出码：0 正常；1 环境不满足；2 参数错误。

set -euo pipefail

readonly SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly SELF_DIR="$(dirname "$SELF_PATH")"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"
readonly START_AGENT="${SCAFFOLD_ROOT}/bin/start-agent.sh"

# 创建顺序即展示顺序：arch → dev → qa。
readonly ROLES=(arch dev qa)
readonly ROLE_TITLES=(ARCH DEV QA)

PROJECT_DIR="$PWD"
SESSION_NAME=""
LAYOUT="cols"
MODEL=""
ATTACH=1
FORCE=0
REMAIN_ON_FAIL=1

usage() {
	cat <<'EOF'
用法: trio-tmux.sh [--layout rows|cols] [--project <目录>] [--session <名字>]
                   [--model <标识>] [--no-attach] [--force] [--no-remain]

  --layout rows|cols 分屏方向，默认 cols
                       rows = 上中下（竖屏/高窄终端）
                       cols = 左中右（横屏/宽扁终端）
  --project <目录>   项目根目录，默认当前目录（必须已 trio-init）
  --session <名字>   tmux 会话名，默认 trio-<项目目录名>
  --model <标识>     给三个 pane 统一换模型；默认用 start-agent 的默认模型
  --no-attach        只创建会话，不自动接入
  --force            会话已存在时先 kill 重建
  --no-remain        pane 退出后立即关闭（默认在失败时保留 pane）
  -h, --help         显示本帮助

示例:
  cd ~/projects/my-app && trio-tmux              # 左中右（横屏）
  trio-tmux --layout rows                        # 上中下（竖屏）
  trio-tmux --project ~/projects/app --session trio-app
  trio-tmux --no-attach && tmux attach -t trio-my-app
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--layout)
			[[ $# -ge 2 ]] || {
				printf 'trio-tmux.sh: --layout 需要 rows 或 cols\n' >&2
				exit 2
			}
			LAYOUT="$2"
			shift 2
			;;
		--project)
			[[ $# -ge 2 ]] || {
				printf 'trio-tmux.sh: --project 需要一个目录参数\n' >&2
				exit 2
			}
			PROJECT_DIR="$2"
			shift 2
			;;
		--session)
			[[ $# -ge 2 ]] || {
				printf 'trio-tmux.sh: --session 需要一个名字\n' >&2
				exit 2
			}
			SESSION_NAME="$2"
			shift 2
			;;
		--model)
			[[ $# -ge 2 ]] || {
				printf 'trio-tmux.sh: --model 需要一个模型标识\n' >&2
				exit 2
			}
			MODEL="$2"
			shift 2
			;;
		--no-attach)
			ATTACH=0
			shift
			;;
		--force)
			FORCE=1
			shift
			;;
		--no-remain)
			REMAIN_ON_FAIL=0
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			printf 'trio-tmux.sh: 未知参数：%s\n' "$1" >&2
			usage >&2
			exit 2
			;;
	esac
done

case "$LAYOUT" in
	rows | cols) ;;
	*)
		printf 'trio-tmux.sh: --layout 只接受 rows 或 cols，收到：%s\n' "$LAYOUT" >&2
		exit 2
		;;
esac

# ── 环境校验 ───────────────────────────────────────────────────────────────

if ! command -v tmux >/dev/null 2>&1; then
	printf 'trio-tmux.sh: 未找到 tmux（请先安装，或直接用三个终端手动启动）\n' >&2
	exit 1
fi

if [[ ! -d "$PROJECT_DIR" ]]; then
	printf 'trio-tmux.sh: 项目目录不存在：%s\n' "$PROJECT_DIR" >&2
	exit 1
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

if [[ ! -f "${PROJECT_DIR}/.omp/trio/policy.txt" ]]; then
	printf 'trio-tmux.sh: %s 尚未初始化脚手架\n' "$PROJECT_DIR" >&2
	printf '              先执行：trio-init %s\n' "$PROJECT_DIR" >&2
	exit 1
fi

for pair in "arch:arch.rules.md" "dev:dev.rules.md" "qa:test.rules.md"; do
	role="${pair%%:*}"
	brief="${pair#*:}"
	if [[ ! -f "${PROJECT_DIR}/.omp/trio/${brief}" ]]; then
		printf 'trio-tmux.sh: 缺少角色简报 .omp/trio/%s（角色 %s 无法启动）\n' "$brief" "$role" >&2
		printf '              重新注入：trio-init %s --force\n' "$PROJECT_DIR" >&2
		exit 1
	fi
done

session_default="trio-$(basename "$PROJECT_DIR" | tr -c '[:alnum:]._-' '-')"
SESSION_NAME="${SESSION_NAME:-$session_default}"
WINDOW_TARGET="${SESSION_NAME}:trio"

# ── 会话冲突 ───────────────────────────────────────────────────────────────

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
	if [[ "$FORCE" -eq 1 ]]; then
		tmux kill-session -t "$SESSION_NAME"
		printf '已重建会话：%s\n' "$SESSION_NAME"
	else
		printf 'trio-tmux.sh: 会话 %s 已存在。\n' "$SESSION_NAME" >&2
		printf '              重建用 --force；或直接接入：tmux attach -t %s\n' "$SESSION_NAME" >&2
		if [[ "$ATTACH" -eq 1 ]]; then
			exec tmux attach -t "$SESSION_NAME"
		fi
		exit 1
	fi
fi

# ── 组装每个 pane 的命令 ───────────────────────────────────────────────────
# 默认用 env -u TRIO_MODEL 清掉父 shell 残留值，让三个 pane 都用 start-agent 的
# 默认模型；给了 --model 就转成 TRIO_MODEL 传给 start-agent，走同一条路径。

shell_quote() {
	printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

pane_command() {
	local role="$1"
	local cmd
	if [[ -n "$MODEL" ]]; then
		cmd="TRIO_MODEL=$(shell_quote "$MODEL") $(shell_quote "$START_AGENT") $role --project $(shell_quote "$PROJECT_DIR")"
	else
		cmd="env -u TRIO_MODEL $(shell_quote "$START_AGENT") $role --project $(shell_quote "$PROJECT_DIR")"
	fi
	printf '%s' "$cmd"
}

# ── 创建会话：单 window，三个 pane ─────────────────────────────────────────

if [[ "$LAYOUT" == "rows" ]]; then
	split_flag="-v"
	layout_name="even-vertical"
else
	split_flag="-h"
	layout_name="even-horizontal"
fi

tmux new-session -d -s "$SESSION_NAME" -n trio -c "$PROJECT_DIR" "$(pane_command "${ROLES[0]}")"
# 显式指定被分割的 pane 索引，保证创建顺序稳定为 0=arch, 1=dev, 2=qa。
tmux split-window "$split_flag" -t "${WINDOW_TARGET}.0" -c "$PROJECT_DIR" "$(pane_command "${ROLES[1]}")"
tmux split-window "$split_flag" -t "${WINDOW_TARGET}.1" -c "$PROJECT_DIR" "$(pane_command "${ROLES[2]}")"

# 均分三块；select-layout 只改几何，不改变 pane 索引。
tmux select-layout -t "$WINDOW_TARGET" "$layout_name"

# ── pane 边框标题 ──────────────────────────────────────────────────────────
# 三块里跑的是同一个 TUI，没有标题就只能靠位置记忆判断身份。

tmux set-option -w -t "$WINDOW_TARGET" pane-border-status top
tmux set-option -w -t "$WINDOW_TARGET" pane-border-format " #{pane_title} "
for i in 0 1 2; do
	tmux select-pane -t "${WINDOW_TARGET}.${i}" -T "${ROLE_TITLES[$i]}"
done

# 窗口失败时保留（exec omp 一退出 pane 就消失，看不到错误）。
if [[ "$REMAIN_ON_FAIL" -eq 1 ]]; then
	tmux set-option -w -t "$WINDOW_TARGET" remain-on-exit failed
fi

# 初始焦点给 ARCH：契约先行。
tmux select-pane -t "${WINDOW_TARGET}.0"
tmux select-window -t "$WINDOW_TARGET"

# ── 汇总 ───────────────────────────────────────────────────────────────────

printf '已创建 tmux 会话：%s（单窗口三分屏）\n' "$SESSION_NAME"
if [[ "$LAYOUT" == "rows" ]]; then
	printf '  布局：rows（上中下）ARCH → DEV → QA\n'
else
	printf '  布局：cols（左中右）ARCH → DEV → QA\n'
fi
printf '  项目：%s\n' "$PROJECT_DIR"
if [[ -n "$MODEL" ]]; then
	printf '  模型：%s（三个 pane 一致，TRIO_MODEL 覆盖）\n' "$MODEL"
else
	printf '  模型：start-agent 默认（见各 pane 启动横幅；进入后 /model 可切换）\n'
fi
printf '  操作：Ctrl-b + 方向键切 pane / Ctrl-b z 放大当前 pane / Ctrl-b d 脱离\n'

if [[ "$ATTACH" -eq 1 ]]; then
	exec tmux attach -t "$SESSION_NAME"
fi
printf '\n接入：tmux attach -t %s\n' "$SESSION_NAME"
