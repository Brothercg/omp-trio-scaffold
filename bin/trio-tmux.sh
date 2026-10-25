#!/usr/bin/env bash
#
# trio-tmux.sh —— 用 tmux 一次拉起三个角色窗口
#
# 三个窗口（arch / dev / qa）共享同一项目目录与同一 git 工作树；
# 隔离由写策略白名单保证，不靠目录隔离。
#
# 模型由 start-agent.sh 决定：默认 deepseek/deepseek-v4.1-flash。
# 本脚本默认不带 --model，并清掉父 shell 残留的 TRIO_MODEL；
# 需要给三个窗口统一换模型时用 --model。
#
# 用法:
#   bin/trio-tmux.sh [--project <目录>] [--session <名字>] [--model <标识>]
#                    [--no-attach] [--force]
#
#   --project <目录>   项目根目录，默认当前目录（必须已 trio-init）
#   --session <名字>   tmux 会话名，默认 trio-<项目目录名>
#   --model <标识>     给三个窗口统一换模型（默认用 start-agent 的默认模型）
#   --no-attach        只创建会话，不自动接入
#   --force            会话已存在时先 kill 重建
#   --no-remain        窗口退出后立即关闭（默认在失败时保留窗口以便看报错）
#
# 退出码：0 正常；1 环境不满足；2 参数错误。

set -euo pipefail

readonly SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly SELF_DIR="$(dirname "$SELF_PATH")"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"
readonly START_AGENT="${SCAFFOLD_ROOT}/bin/start-agent.sh"

PROJECT_DIR="$PWD"
SESSION_NAME=""
MODEL=""
ATTACH=1
FORCE=0
REMAIN_ON_FAIL=1

usage() {
	cat <<'EOF'
用法: trio-tmux.sh [--project <目录>] [--session <名字>] [--model <标识>]
                   [--no-attach] [--force] [--no-remain]

  --project <目录>   项目根目录，默认当前目录（必须已 trio-init）
  --session <名字>   tmux 会话名，默认 trio-<项目目录名>
  --model <标识>     给三个窗口统一换模型；默认用 start-agent 的默认模型
  --no-attach        只创建会话，不自动接入
  --force            会话已存在时先 kill 重建
  --no-remain        窗口退出后立即关闭（默认在失败时保留窗口）
  -h, --help         显示本帮助

示例:
  cd ~/projects/my-app && trio-tmux
  trio-tmux --project ~/projects/my-app --session trio-app
  trio-tmux --no-attach && tmux attach -t trio-my-app
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
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

# ── 组装每个窗口的命令 ─────────────────────────────────────────────────────
# 默认用 env -u TRIO_MODEL 清掉父 shell 残留值，让三个窗口都用 start-agent 的
# 默认模型；给了 --model 就转成 TRIO_MODEL 传给 start-agent，走同一条路径。

shell_quote() {
	printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

window_command() {
	local role="$1"
	local cmd
	if [[ -n "$MODEL" ]]; then
		cmd="TRIO_MODEL=$(shell_quote "$MODEL") $(shell_quote "$START_AGENT") $role --project $(shell_quote "$PROJECT_DIR")"
	else
		cmd="env -u TRIO_MODEL $(shell_quote "$START_AGENT") $role --project $(shell_quote "$PROJECT_DIR")"
	fi
	printf '%s' "$cmd"
}

# ── 创建会话 ───────────────────────────────────────────────────────────────

first=1
for role in arch dev qa; do
	if [[ "$first" -eq 1 ]]; then
		tmux new-session -d -s "$SESSION_NAME" -n "$role" -c "$PROJECT_DIR" "$(window_command "$role")"
		first=0
	else
		tmux new-window -t "$SESSION_NAME" -n "$role" -c "$PROJECT_DIR" "$(window_command "$role")"
	fi
done

# 窗口失败时保留（否则 exec omp 一退出窗口就消失，看不到错误）。
if [[ "$REMAIN_ON_FAIL" -eq 1 ]]; then
	tmux set-option -t "$SESSION_NAME" remain-on-exit failed
fi

tmux select-window -t "$SESSION_NAME:arch"

printf '已创建 tmux 会话：%s\n' "$SESSION_NAME"
printf '  窗口：arch / dev / qa（共享 %s）\n' "$PROJECT_DIR"
if [[ -n "$MODEL" ]]; then
	printf '  模型：%s（三个窗口一致，TRIO_MODEL 覆盖）\n' "$MODEL"
else
	printf '  模型：start-agent 默认（见各窗口启动横幅；进入后 /model 可切换）\n'
fi
printf '  切换：Ctrl-b 然后 w 列窗口 / 数字键直选\n'

if [[ "$ATTACH" -eq 1 ]]; then
	exec tmux attach -t "$SESSION_NAME"
fi
printf '\n接入：tmux attach -t %s\n' "$SESSION_NAME"
