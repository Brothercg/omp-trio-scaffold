#!/usr/bin/env bash
#
# trio-align.sh —— 下游项目朝脚手架标准布局对齐
#
# 三种模式：
#   --check   只检测；零差异 exit 0，有差异 exit 1
#   默认      dry-run；打印将执行的操作，工作树零写入，exit 0
#   --apply   显式迁移（git mv + 文本引用清扫）并输出核验报告
#
# 用法：
#   bin/trio-align.sh --check [<目标目录>]
#   bin/trio-align.sh         [<目标目录>]
#   bin/trio-align.sh --apply [<目标目录>]
#   bin/trio-align.sh ... --map <from>:<to> [--map <from>:<to> ...]
#
# 约束：bash >= 4，git >= 2.x；不依赖 bun / node。
# 目标目录缺省为 $PWD，且 MUST 是 git 仓库根。

set -euo pipefail

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
readonly UPSTREAM_POLICY="${SCAFFOLD_ROOT}/.omp/trio/policy.txt"

MODE="dry-run" # dry-run | check | apply
TARGET_ARG=""
MAPS=()

usage() {
	cat <<'EOF'
用法: trio-align.sh [--check|--apply] [目标目录] [--map <from>:<to> ...]

  --check        只检测差异，不写工作树；零差异 exit 0，有差异 exit 1
  --apply        显式执行迁移与引用清扫，并输出核验报告
  默认            dry-run：打印将执行的操作，工作树零变化，exit 0
  --map from:to   显式目录映射（相对目标目录），可重复；覆盖同名固定别名
  目标目录        缺省为当前目录；必须是 git 仓库根
  -h, --help      显示本帮助

退出码:
  0  成功 / 已对齐
  1  仅 --check 检测到差异
  2  参数、目录、git 仓库或 --map 非法

固定别名:
  lib/ -> src/        app/ -> src/
  spec/ -> tests/     test/ -> tests/
  doc/ -> docs/       arch/ -> docs/architecture/
EOF
}

fail() {
	printf 'trio-align.sh: %s\n' "$*" >&2
	exit 2
}

normalize_path() {
	local p="$1"
	while [[ "$p" == */ && "$p" != "/" ]]; do
		p="${p%/}"
	done
	printf '%s' "$p"
}

check_relative_path() {
	local p="$1" kind="$2"
	[[ -n "$p" ]] || fail "--map 的 ${kind} 不能为空"
	[[ "$p" != /* ]] || fail "--map 的 ${kind} 必须是相对路径：$p"
	[[ "$p" != "." ]] || fail "--map 的 ${kind} 不能是 ."
	case "/${p}/" in
		*/../*) fail "--map 的 ${kind} 不得包含 ..：$p" ;;
	esac
}

add_map() {
	local spec="$1"
	[[ "$spec" == *:* ]] || fail "--map 需要 from:to 形式：$spec"
	local from to
	from="$(normalize_path "${spec%%:*}")"
	to="$(normalize_path "${spec#*:}")"
	check_relative_path "$from" "from"
	check_relative_path "$to" "to"
	[[ "$from" != "$to" ]] || fail "--map 的 from 与 to 相同：$from"
	MAPS+=("${from}:${to}")
}

set_target() {
	[[ -z "$TARGET_ARG" ]] || fail "只接受一个目标目录"
	TARGET_ARG="$1"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--check)
			[[ "$MODE" != "apply" ]] || fail "--check 与 --apply 互斥"
			MODE="check"
			shift
			;;
		--apply)
			[[ "$MODE" != "check" ]] || fail "--check 与 --apply 互斥"
			MODE="apply"
			shift
			;;
		--map)
			[[ $# -ge 2 ]] || fail "--map 需要一个 from:to 参数"
			add_map "$2"
			shift 2
			;;
		--map=*)
			add_map "${1#*=}"
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		--)
			shift
			while [[ $# -gt 0 ]]; do
				set_target "$1"
				shift
			done
			;;
		-*)
			fail "未知选项：$1"
			;;
		*)
			set_target "$1"
			shift
			;;
	esac
done

TARGET_ARG="${TARGET_ARG:-$PWD}"
[[ -d "$TARGET_ARG" ]] || fail "目标目录不存在：$TARGET_ARG"
TARGET="$(cd "$TARGET_ARG" && pwd -P)"

git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
	fail "目标不是 git 仓库：$TARGET"
REPO_ROOT="$(git -C "$TARGET" rev-parse --show-toplevel)"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
[[ "$REPO_ROOT" == "$TARGET" ]] ||
	fail "目标必须是 git 仓库根：$TARGET（仓库根：$REPO_ROOT）"

[[ -f "$UPSTREAM_POLICY" ]] || fail "上游 policy 不存在：$UPSTREAM_POLICY"

# --map 是显式映射：声明即要求可执行（from 必须存在、to 必须不存在）。
for mapping in "${MAPS[@]}"; do
	from="${mapping%%:*}"
	to="${mapping#*:}"
	[[ -d "$TARGET/$from" ]] || fail "--map from 不存在或不是目录：$from"
	[[ ! -e "$TARGET/$to" ]] || fail "--map to 已存在：$to"
done

# 显式映射优先；固定别名只补齐未声明的 from。
MAPPING_FROMS=()
MAPPING_TOS=()
for mapping in "${MAPS[@]}"; do
	MAPPING_FROMS+=("${mapping%%:*}")
	MAPPING_TOS+=("${mapping#*:}")
done
for alias in "lib:src" "app:src" "spec:tests" "test:tests" "doc:docs" "arch:docs/architecture"; do
	alias_from="${alias%%:*}"
	alias_to="${alias#*:}"
	declared=0
	for existing_from in "${MAPPING_FROMS[@]}"; do
		if [[ "$existing_from" == "$alias_from" ]]; then
			declared=1
			break
		fi
	done
	if [[ "$declared" -eq 0 ]]; then
		MAPPING_FROMS+=("$alias_from")
		MAPPING_TOS+=("$alias_to")
	fi
done

DIFFS=()
add_diff() {
	DIFFS+=("$1")
}

collect_diffs() {
	DIFFS=()
	local i from to dir entry name
	for i in "${!MAPPING_FROMS[@]}"; do
		from="${MAPPING_FROMS[$i]}"
		to="${MAPPING_TOS[$i]}"
		[[ -e "$TARGET/$from" ]] || continue
		if [[ -e "$TARGET/$to" ]]; then
			add_diff "manual | ${from}/ | ${to}/ | 需人工裁定（目标已存在，不自动合并）"
		else
			add_diff "map | ${from}/ | ${to}/ | git mv + 引用清扫"
		fi
	done

	for dir in docs/task docs/architecture src tests; do
		[[ -d "$TARGET/$dir" ]] || add_diff "missing-dir | ${dir}/ | - | mkdir -p"
	done

	if [[ -d "$TARGET/docs/task" ]]; then
		while IFS= read -r -d '' entry; do
			[[ -d "$entry" ]] || continue
			name="$(basename "$entry")"
			[[ "$name" =~ ^TASK-[0-9]{3}-[0-9]{4}-[0-9]{2}-[0-9]{2}-.+$ ]] && continue
			add_diff "task-name | docs/task/${name} | - | 需重命名为 TASK-<NNN>-<YYYY-MM-DD>-<slug>"
		done < <(find "$TARGET/docs/task" -mindepth 1 -maxdepth 1 -print0 | sort -z)
	fi

	if [[ ! -f "$TARGET/.omp/trio/policy.txt" ]]; then
		add_diff "policy | .omp/trio/policy.txt | - | 缺少（需从上游复制）"
	elif ! cmp -s "$UPSTREAM_POLICY" "$TARGET/.omp/trio/policy.txt"; then
		add_diff "policy | .omp/trio/policy.txt | ${UPSTREAM_POLICY} | 与上游逐字节不同（需人工核对/逃生舱标注）"
	fi
}

print_diffs() {
	local line
	for line in "${DIFFS[@]}"; do
		printf '%s\n' "$line"
	done
}

collect_diffs

case "$MODE" in
	check)
		if [[ ${#DIFFS[@]} -eq 0 ]]; then
			printf 'aligned\n'
			exit 0
		fi
		print_diffs
		exit 1
		;;
	dry-run)
		if [[ ${#DIFFS[@]} -eq 0 ]]; then
			printf 'aligned\n'
			exit 0
		fi
		print_diffs
		exit 0
		;;
	apply)
		if [[ ${#DIFFS[@]} -eq 0 ]]; then
			printf 'aligned\n'
			exit 0
		fi

		printf '差异清单：\n'
		print_diffs
		printf '\n'

		APPLIED=()
		MANUAL=()
		for diff_line in "${DIFFS[@]}"; do
			kind="${diff_line%% | *}"
			case "$kind" in
				missing-dir)
					dir="${diff_line#missing-dir | }"
					dir="${dir%%/ | *}"
					mkdir -p "$TARGET/$dir"
					APPLIED+=("mkdir -p ${dir}/")
					;;
				map)
					from="$(printf '%s' "$diff_line" | awk -F' \\| ' '{print $2}')"
					to="$(printf '%s' "$diff_line" | awk -F' \\| ' '{print $3}')"
					from="$(normalize_path "$from")"
					to="$(normalize_path "$to")"
					if [[ -e "$TARGET/$from" && ! -e "$TARGET/$to" ]]; then
						mkdir -p "$(dirname "$TARGET/$to")"
						git -C "$TARGET" mv -- "$from" "$to"
						APPLIED+=("git mv ${from}/ ${to}/")
					fi
					;;
				*)
					MANUAL+=("$diff_line")
					;;
			esac
		done

		# 迁移完成后再清扫引用，避免旧目录内容被提前改写。
		for applied in "${APPLIED[@]}"; do
			[[ "$applied" == git\ mv\ * ]] || continue
			from="${applied#git mv }"
			from="${from%%/ *}"
			to="${applied##* }"
			to="${to%/}"
			old_ref="${from}/"
			new_ref="${to}/"
			mapfile -d '' files < <(git -C "$TARGET" grep -Il -z -e "$old_ref" -- . || true)
			if [[ ${#files[@]} -gt 0 ]]; then
				sed_old="$(printf '%s' "$old_ref" | sed 's/[\\&|]/\\&/g')"
				sed_new="$(printf '%s' "$new_ref" | sed 's/[\\&|]/\\&/g')"
				(
					cd "$TARGET"
					sed -i "s|${sed_old}|${sed_new}|g" -- "${files[@]}"
				)
				APPLIED+=("引用清扫 ${old_ref} -> ${new_ref}（${#files[@]} 个文件）")
			fi
		done

		printf '已执行：\n'
		for applied in "${APPLIED[@]}"; do
			printf '  %s\n' "$applied"
		done

		if [[ ${#MANUAL[@]} -gt 0 ]]; then
			printf '\n需人工处理（未自动执行）：\n'
			for line in "${MANUAL[@]}"; do
				printf '  %s\n' "$line"
			done
		fi

		printf '\n核验报告（逐行 diff）：\n'
		git -C "$TARGET" diff --no-color --unified=0 HEAD -- || true
		exit 0
		;;
esac
