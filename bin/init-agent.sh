#!/usr/bin/env bash
#
# init-agent.sh —— 把「敏捷三人行」脚手架注入到一个目标项目
#
# 做的事情：
#   1. 创建目录：docs/task（任务产物聚合层）docs/architecture src tests
#   2. 注入 .omp/trio/  —— 角色简报、写策略真值源
#   3. 注入 .omp/trio/templates/ —— 任务产物模板（看板/契约/交付/报告/缺陷/裁决）
#   4. 注入 .omp/hooks/pre/trio-guard.ts —— 进程内写前拦截
#      注入 .omp/extensions/trio-session-name.ts —— 会话名自动设为角色
#   5. 注入 .git/hooks/pre-commit + pre-push + bin/trio-check-report.mjs —— 提交兜底与报告校验
#   6. 注入 tests/ —— 全部门禁回归测试
#
# U1 升级语义：
#   执行件（.omp/hooks/**、bin/**、templates/**、git hooks）直接覆盖为新版；
#   policy.txt 与上游有 diff 时打印提示且不覆盖（保留逃生舱痕迹）；
#   下游领先件（REPLY-CONVENTIONS / board.template）默认保留，--force 才覆盖；
#   其余文件默认跳过，需要覆盖时显式加 --force。
#
# 布局（ADR-0015）：
#   --layout auto（默认）按 <目标>/tooling/bin 是否存在判定 bin / tooling；
#   tooling 布局落 tooling/bin、tooling/tests、tooling/hooks，.git/hooks 产物
#   做一次 bin/trio- -> tooling/bin/trio- 文本替换；bin 布局保持原落点。
#
# 用法：
#   bin/init-agent.sh [目标项目路径] [--force] [--dry-run] [--layout <auto|bin|tooling>]
#
# 目标项目路径默认为当前目录。

set -euo pipefail

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

# ── 源侧解析（TASK-011 / spec §3 S1）───────────────────────────────────────
# 自托管模式下源件分布在 tooling/{bin,tests,hooks} 与 .omp/trio/；
# 逐载荷独立回退，不要求整棵树同源。

src_candidates() {
	local kind="$1" name="${2:-}"
	case "$kind" in
		hook)
			printf '%s\n' "${SCAFFOLD_ROOT}/templates/${name}" "${SCAFFOLD_ROOT}/tooling/hooks/${name}"
			;;
		tool)
			printf '%s\n' "${SCAFFOLD_ROOT}/bin/${name}" "${SCAFFOLD_ROOT}/tooling/bin/${name}"
			;;
		tests)
			printf '%s\n' "${SCAFFOLD_ROOT}/tests/*.test.mjs" "${SCAFFOLD_ROOT}/tooling/tests/*.test.mjs"
			;;
		tpl)
			printf '%s\n' "${SCAFFOLD_ROOT}/templates/*.md" "${SCAFFOLD_ROOT}/.omp/trio/templates/*.md"
			;;
		profiles)
			printf '%s\n' "${SCAFFOLD_ROOT}/profiles/${name}" "${SCAFFOLD_ROOT}/.omp/trio/${name}"
			;;
	esac
}

# resolve_src <kind> [name] -> 首个存在的文件路径；无则空、返回 1。
resolve_src() {
	local kind="$1" name="${2:-}" candidate
	while IFS= read -r candidate; do
		if [[ -f "$candidate" ]]; then
			printf '%s' "$candidate"
			return 0
		fi
	done < <(src_candidates "$kind" "$name")
	return 1
}

# resolve_glob_dir <tests|tpl> -> 首个含匹配文件的目录；无则返回 1。
resolve_glob_dir() {
	local kind="$1" pattern dir
	case "$kind" in
		tests) pattern='*.test.mjs' ;;
		tpl) pattern='*.md' ;;
		*) return 1 ;;
	esac
	local -a candidates=()
	case "$kind" in
		tests) candidates=("${SCAFFOLD_ROOT}/tests" "${SCAFFOLD_ROOT}/tooling/tests") ;;
		tpl) candidates=("${SCAFFOLD_ROOT}/templates" "${SCAFFOLD_ROOT}/.omp/trio/templates") ;;
	esac
	for dir in "${candidates[@]}"; do
		if compgen -G "${dir}/${pattern}" >/dev/null; then
			printf '%s' "$dir"
			return 0
		fi
	done
	return 1
}

# ── 参数解析 ───────────────────────────────────────────────────────────────

TARGET_DIR=""
FORCE=0
DRY_RUN=0
LAYOUT="auto"

usage() {
	cat <<'EOF'
用法: init-agent.sh [目标项目路径] [--force] [--dry-run] [--layout <auto|bin|tooling>]

  目标项目路径   要初始化脚手架的项目目录，默认为当前目录
  --force        覆盖已存在的普通文件与下游领先件；执行件始终升级覆盖；
                 policy.txt 有差异时仍保留本地版本，不覆盖
  --dry-run      只打印计划，零写入
  --layout       安装布局：auto（按 <目标>/tooling/bin 判定）/ bin / tooling
                 默认 auto；值非法或缺值 -> 退出码 2
  -h, --help     显示本帮助

示例:
  bin/init-agent.sh ~/projects/my-app
  bin/init-agent.sh ~/projects/my-app --force
  bin/init-agent.sh ~/projects/my-app --dry-run --layout tooling
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--force)
			FORCE=1
			shift
			;;
		--dry-run)
			DRY_RUN=1
			shift
			;;
		--layout)
			if [[ $# -lt 2 ]]; then
				printf 'init-agent.sh: --layout 缺少取值（应为 auto|bin|tooling）\n' >&2
				usage >&2
				exit 2
			fi
			LAYOUT="$2"
			shift 2
			;;
		--layout=*)
			LAYOUT="${1#--layout=}"
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

case "$LAYOUT" in
	auto | bin | tooling) ;;
	*)
		printf 'init-agent.sh: --layout 取值非法：%s（应为 auto|bin|tooling）\n' "$LAYOUT" >&2
		usage >&2
		exit 2
		;;
esac

TARGET_DIR="${TARGET_DIR:-$PWD}"

# ── 前置检查 ───────────────────────────────────────────────────────────────

if [[ ! -d "$TARGET_DIR" ]]; then
	printf 'init-agent.sh: 目标目录不存在：%s\n' "$TARGET_DIR" >&2
	exit 1
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# S2：hooks 三件候选全缺才中止；单件缺失走逐件失败，不中断整步。
declare -A HOOK_SRC=()
missing_hooks=0
for hook in pre-commit pre-push post-commit; do
	HOOK_SRC["$hook"]="$(resolve_src hook "$hook" || true)"
	if [[ -z "${HOOK_SRC[$hook]}" ]]; then
		missing_hooks=$((missing_hooks + 1))
	fi
done
if [[ "$missing_hooks" -eq 3 ]]; then
	printf 'init-agent.sh: 脚手架不完整：未找到 hooks 源（候选：%s / %s）\n' \
		"${SCAFFOLD_ROOT}/templates" "${SCAFFOLD_ROOT}/tooling/hooks" >&2
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

# ── 布局判定（ADR-0015 §2.1 / §2.2）───────────────────────────────────────

LAYOUT_MODE="显式"
if [[ "$LAYOUT" == "auto" ]]; then
	LAYOUT_MODE="auto"
	if [[ -d "${TARGET_DIR}/tooling/bin" ]]; then
		LAYOUT="tooling"
	else
		LAYOUT="bin"
	fi
fi
if [[ "$LAYOUT" == "tooling" ]]; then
	TOOLS_REL="tooling/bin"
	TESTS_REL="tooling/tests"
	HOOK_SRC_REL="tooling/hooks"
else
	TOOLS_REL="bin"
	TESTS_REL="tests"
	HOOK_SRC_REL=""
fi

# ── 输出helpers ───────────────────────────────────────────────────────────

CREATED=0
SKIPPED=0
FAILED=0
POLICY_DIFF=0
FAILED_PATHS=()
# 干跑计划计数（与实跑计数分开，汇总行格式不同）。
PLAN_CREATE=0
PLAN_OVERWRITE=0
PLAN_SKIP=0
PLAN_KEEP=0

# fail_file <目标绝对路径> <原因>：计入失败、打印失败行与相对路径，不中断后续注入。
fail_file() {
	local rel="${1#"${TARGET_DIR}"/}" reason="$2"
	printf '  失败  %s：%s\n' "$rel" "$reason"
	FAILED=$((FAILED + 1))
	FAILED_PATHS+=("$rel")
}

# create_file <目标绝对路径> <源文件> <权限> [always_overwrite]
# always_overwrite=1：门禁执行件，升级时直接覆盖（内容相同则跳过）。
create_file() {
	local dest="$1" src="$2" mode="${3:-644}" always="${4:-0}" msg
	local rel="${dest#"${TARGET_DIR}"/}"
	if [[ -e "$dest" ]]; then
		if [[ "$always" -eq 1 || "$FORCE" -eq 1 ]]; then
			if cmp -s "$src" "$dest"; then
				if [[ "$DRY_RUN" -eq 1 ]]; then
					printf '  将跳过  %s（已是最新）\n' "$rel"
					PLAN_SKIP=$((PLAN_SKIP + 1))
				else
					printf '  跳过  %s（已是最新）\n' "$rel"
					SKIPPED=$((SKIPPED + 1))
				fi
			elif [[ "$DRY_RUN" -eq 1 ]]; then
				printf '  将覆盖  %s\n' "$rel"
				PLAN_OVERWRITE=$((PLAN_OVERWRITE + 1))
			else
				if ! msg="$(install -m "$mode" "$src" "$dest" 2>&1)"; then
					fail_file "$dest" "${msg%%$'\n'*}"
					return 0
				fi
				printf '  覆盖  %s\n' "$rel"
				CREATED=$((CREATED + 1))
			fi
		elif [[ "$DRY_RUN" -eq 1 ]]; then
			printf '  将跳过  %s（已存在）\n' "$rel"
			PLAN_SKIP=$((PLAN_SKIP + 1))
		else
			printf '  跳过  %s（已存在）\n' "$rel"
			SKIPPED=$((SKIPPED + 1))
		fi
		return 0
	fi
	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '  将创建  %s\n' "$rel"
		PLAN_CREATE=$((PLAN_CREATE + 1))
		return 0
	fi
	if ! msg="$(mkdir -p "$(dirname "$dest")" 2>&1)"; then
		fail_file "$dest" "${msg%%$'\n'*}"
		return 0
	fi
	if ! msg="$(install -m "$mode" "$src" "$dest" 2>&1)"; then
		fail_file "$dest" "${msg%%$'\n'*}"
		return 0
	fi
	printf '  创建  %s\n' "$rel"
	CREATED=$((CREATED + 1))
	return 0
}

# create_ahead <目标绝对路径> <源文件> <权限>
# 下游领先件：已存在且与上游不同 -> 默认保留（计入跳过），--force 才覆盖。
create_ahead() {
	local dest="$1" src="$2" mode="${3:-644}" msg
	local rel="${dest#"${TARGET_DIR}"/}"
	if [[ -e "$dest" ]]; then
		if cmp -s "$src" "$dest"; then
			if [[ "$DRY_RUN" -eq 1 ]]; then
				printf '  将跳过  %s（已是最新）\n' "$rel"
				PLAN_SKIP=$((PLAN_SKIP + 1))
			else
				printf '  跳过  %s（已是最新）\n' "$rel"
				SKIPPED=$((SKIPPED + 1))
			fi
		elif [[ "$FORCE" -eq 0 ]]; then
			if [[ "$DRY_RUN" -eq 1 ]]; then
				printf '  将保留 %s（下游领先，未覆盖；--force 覆盖）\n' "$rel"
				PLAN_KEEP=$((PLAN_KEEP + 1))
			else
				printf '  保留 %s（下游领先，未覆盖；--force 覆盖）\n' "$rel"
				SKIPPED=$((SKIPPED + 1))
			fi
		elif [[ "$DRY_RUN" -eq 1 ]]; then
			printf '  将覆盖  %s\n' "$rel"
			PLAN_OVERWRITE=$((PLAN_OVERWRITE + 1))
		else
			if ! msg="$(install -m "$mode" "$src" "$dest" 2>&1)"; then
				fail_file "$dest" "${msg%%$'\n'*}"
				return 0
			fi
			printf '  覆盖  %s\n' "$rel"
			CREATED=$((CREATED + 1))
		fi
		return 0
	fi
	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '  将创建  %s\n' "$rel"
		PLAN_CREATE=$((PLAN_CREATE + 1))
		return 0
	fi
	if ! msg="$(mkdir -p "$(dirname "$dest")" 2>&1)"; then
		fail_file "$dest" "${msg%%$'\n'*}"
		return 0
	fi
	if ! msg="$(install -m "$mode" "$src" "$dest" 2>&1)"; then
		fail_file "$dest" "${msg%%$'\n'*}"
		return 0
	fi
	printf '  创建  %s\n' "$rel"
	CREATED=$((CREATED + 1))
	return 0
}

# fail_missing_src <目标绝对路径> <kind> [name]
# S2：缺源逐件失败，打印候选列表，继续处理其余件。
fail_missing_src() {
	local dest="$1" kind="$2" name="${3:-}"
	local -a candidates=()
	local joined
	while IFS= read -r candidate; do
		candidates+=("$candidate")
	done < <(src_candidates "$kind" "$name")
	joined="$(IFS=' / '; printf '%s' "${candidates[*]}")"
	printf '  失败  %s：源缺失 %s\n' "${dest#"${TARGET_DIR}"/}" "$joined"
	FAILED=$((FAILED + 1))
	FAILED_PATHS+=("${dest#"${TARGET_DIR}"/}")
}

# fail_missing_unique <目标绝对路径> <源路径>
fail_missing_unique() {
	local dest="$1" src="$2"
	printf '  失败  %s：源缺失 %s\n' "${dest#"${TARGET_DIR}"/}" "$src"
	FAILED=$((FAILED + 1))
	FAILED_PATHS+=("${dest#"${TARGET_DIR}"/}")
}

# create_hook <目标绝对路径> <模板源>
# tooling 布局：.git/hooks 产物做一次 bin/trio- -> tooling/bin/trio- 替换；
# 已处于 tooling/ 前缀下的 token 用占位符保护，保证幂等（无 tooling/tooling）。
# bin 布局：产物与模板逐字节相同。
create_hook() {
	local dest="$1" src="$2" tmp mark=$'\001'
	if [[ "$LAYOUT" == "tooling" ]]; then
		tmp="$(mktemp)"
		sed -E -e "s#tooling/bin/trio-#${mark}#g" \
			-e 's#(^|[^A-Za-z0-9_.-])bin/trio-#\1tooling/bin/trio-#g' \
			-e "s#${mark}#tooling/bin/trio-#g" "$src" >"$tmp"
		create_file "$dest" "$tmp" "755" 1
		rm -f "$tmp"
	else
		create_file "$dest" "$src" "755" 1
	fi
}

# create_policy_eval <目标绝对路径> <源>
# tooling 布局下 policy-eval 位于 tooling/bin，静态导入 guard 的相对路径需
# 由 ../.omp 改为 ../../.omp（bin 布局保持源文件逐字节不变）。
create_policy_eval() {
	local dest="$1" src="$2" tmp
	if [[ "$LAYOUT" == "tooling" ]]; then
		tmp="$(mktemp)"
		sed 's#"../\.omp/hooks/pre/trio-guard.ts"#"../../.omp/hooks/pre/trio-guard.ts"#' "$src" >"$tmp"
		create_file "$dest" "$tmp" "755" 1
		rm -f "$tmp"
	else
		create_file "$dest" "$src" "755" 1
	fi
}

# install_policy <目标绝对路径> <上游 policy>
# U1：policy.txt 是根信任；有 diff 时只提示、不覆盖，保留用户逃生舱痕迹。
install_policy() {
	local dest="$1" src="$2"
	local rel="${dest#"${TARGET_DIR}"/}"
	if [[ ! -e "$dest" ]]; then
		if [[ "$DRY_RUN" -eq 1 ]]; then
			printf '  将创建  %s\n' "$rel"
			PLAN_CREATE=$((PLAN_CREATE + 1))
			return
		fi
		mkdir -p "$(dirname "$dest")"
		install -m 644 "$src" "$dest"
		printf '  创建  %s\n' "$rel"
		CREATED=$((CREATED + 1))
		return
	fi
	if cmp -s "$src" "$dest"; then
		if [[ "$DRY_RUN" -eq 1 ]]; then
			printf '  将跳过  %s（已是最新）\n' "$rel"
			PLAN_SKIP=$((PLAN_SKIP + 1))
		else
			printf '  跳过  %s（已是最新）\n' "$rel"
			SKIPPED=$((SKIPPED + 1))
		fi
		return
	fi
	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '  将保留  %s（与上游不同，未覆盖）\n' "$rel"
		printf '  diff（上游 → 本地）：\n'
		diff -u "$src" "$dest" | sed 's/^/    /' || true
		PLAN_KEEP=$((PLAN_KEEP + 1))
		return
	fi
	POLICY_DIFF=1
	printf '  保留  %s（与上游不同，未覆盖）\n' "$rel"
	printf '  diff（上游 → 本地）：\n'
	diff -u "$src" "$dest" | sed 's/^/    /' || true
}

# create_dir <目录绝对路径>
create_dir() {
	local dir="$1"
	local rel="${dir#"${TARGET_DIR}"/}"
	if [[ -d "$dir" ]]; then
		if [[ "$DRY_RUN" -eq 1 ]]; then
			printf '  将跳过  %s/（已存在）\n' "$rel"
		else
			printf '  存在  %s\n' "$rel"
		fi
		return
	fi
	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '  将创建  %s/\n' "$rel"
		return
	fi
	mkdir -p "$dir"
	printf '  创建  %s/\n' "$rel"
}

printf 'TRIO 脚手架初始化\n'
printf '目标项目：%s\n' "$TARGET_DIR"
printf '布局：%s（%s）\n' "$LAYOUT" "$LAYOUT_MODE"
if [[ "$DRY_RUN" -eq 1 ]]; then
	printf '模式：--dry-run（零写入预览）\n\n'
elif [[ "$FORCE" -eq 1 ]]; then
	printf '模式：--force（覆盖已存在文件；policy.txt 有差异时仍保留本地版本）\n\n'
else
	printf '模式：默认（执行件覆盖升级；policy.txt 有差异时保留本地版本）\n\n'
fi

# ── 1. 契约目录 ───────────────────────────────────────────────────────────

printf '[1/6] 工作目录\n'
for dir in docs/task docs/architecture src tests; do
	create_dir "${TARGET_DIR}/${dir}"
done

# ── 2. .omp/trio/ 角色简报与写策略 ─────────────────────────────────────────

printf '\n[2/6] 角色简报与写策略\n'
for role in arch dev test; do
	dest="${TARGET_DIR}/.omp/trio/${role}.rules.md"
	src="$(resolve_src profiles "${role}.rules.md" || true)"
	if [[ -z "$src" ]]; then
		fail_missing_src "$dest" profiles "${role}.rules.md"
	else
		create_file "$dest" "$src"
	fi
done
POLICY_SRC="${SCAFFOLD_ROOT}/.omp/trio/policy.txt"
if [[ ! -f "$POLICY_SRC" ]]; then
	fail_missing_unique "${TARGET_DIR}/.omp/trio/policy.txt" "$POLICY_SRC"
else
	install_policy "${TARGET_DIR}/.omp/trio/policy.txt" "$POLICY_SRC"
fi

# ── 3. 任务产物模板 ───────────────────────────────────────────────────────

printf '\n[3/6] 任务产物模板\n'
TPL_DIR="$(resolve_glob_dir tpl || true)"
if [[ -z "$TPL_DIR" ]]; then
	fail_missing_src "${TARGET_DIR}/.omp/trio/templates/" tpl
else
	while IFS= read -r template; do
		if [[ "$(basename "$template")" == "board.template.md" ]]; then
			create_ahead "${TARGET_DIR}/.omp/trio/templates/board.template.md" "$template" "644"
		else
			create_file "${TARGET_DIR}/.omp/trio/templates/$(basename "$template")" "$template" "644" 1
		fi
	done < <(compgen -G "${TPL_DIR}/*.md")
fi
REPLY_SRC="${SCAFFOLD_ROOT}/docs/REPLY-CONVENTIONS.md"
if [[ ! -f "$REPLY_SRC" ]]; then
	fail_missing_unique "${TARGET_DIR}/docs/REPLY-CONVENTIONS.md" "$REPLY_SRC"
else
	create_ahead "${TARGET_DIR}/docs/REPLY-CONVENTIONS.md" "$REPLY_SRC" "644"
fi

# ── 4. 进程内写门禁 hook + 会话名扩展 ─────────────────────────────────────

printf '\n[4/6] 进程内门禁与扩展（omp hook / extension）\n'
GUARD_SRC="${SCAFFOLD_ROOT}/.omp/hooks/pre/trio-guard.ts"
if [[ ! -f "$GUARD_SRC" ]]; then
	fail_missing_unique "${TARGET_DIR}/.omp/hooks/pre/trio-guard.ts" "$GUARD_SRC"
else
	create_file "${TARGET_DIR}/.omp/hooks/pre/trio-guard.ts" "$GUARD_SRC" "644" 1
fi
# 会话名扩展：session_start 时把会话名设为 TRIO_ROLE（仅当尚无标题）。
EXT_SRC="${SCAFFOLD_ROOT}/.omp/extensions/trio-session-name.ts"
if [[ ! -f "$EXT_SRC" ]]; then
	fail_missing_unique "${TARGET_DIR}/.omp/extensions/trio-session-name.ts" "$EXT_SRC"
else
	create_file "${TARGET_DIR}/.omp/extensions/trio-session-name.ts" "$EXT_SRC" "644" 1
fi

# ── 5. 提交前兜底门禁 + 报告校验器 ────────────────────────────────────────

printf '\n[5/6] 提交前兜底门禁（git pre-commit）\n'
for hook in pre-commit pre-push post-commit; do
	src="${HOOK_SRC[$hook]}"
	if [[ -z "$src" ]]; then
		if [[ "$LAYOUT" == "tooling" ]]; then
			fail_missing_src "${TARGET_DIR}/${HOOK_SRC_REL}/${hook}" hook "$hook"
		else
			fail_missing_src "${GIT_DIR_ABS}/hooks/${hook}" hook "$hook"
		fi
		continue
	fi
	if [[ "$LAYOUT" == "tooling" ]]; then
		create_file "${TARGET_DIR}/${HOOK_SRC_REL}/${hook}" "$src" "755" 1
	fi
	create_hook "${GIT_DIR_ABS}/hooks/${hook}" "$src"
done
for tool in trio-check-report.mjs trio-policy-eval.mjs trio-selftest.sh; do
	dest="${TARGET_DIR}/${TOOLS_REL}/${tool}"
	src="$(resolve_src tool "$tool" || true)"
	if [[ -z "$src" ]]; then
		fail_missing_src "$dest" tool "$tool"
	elif [[ "$tool" == "trio-policy-eval.mjs" ]]; then
		create_policy_eval "$dest" "$src"
	else
		create_file "$dest" "$src" "755" 1
	fi
done

# ── 6. 门禁回归测试 ───────────────────────────────────────────────────────

printf '\n[6/6] 门禁回归测试\n'
TESTS_SRC_DIR="$(resolve_glob_dir tests || true)"
if [[ -z "$TESTS_SRC_DIR" ]]; then
	fail_missing_src "${TARGET_DIR}/${TESTS_REL}/" tests
else
	while IFS= read -r test_file; do
		create_file "${TARGET_DIR}/${TESTS_REL}/$(basename "$test_file")" "$test_file" "644" 1
	done < <(compgen -G "${TESTS_SRC_DIR}/*.test.mjs")
fi

# ── 汇总 ───────────────────────────────────────────────────────────────────

# 通过 trio-install.sh 发布的软链调用时，提示短命令；直接调用则给绝对路径。
if [[ -L "${BASH_SOURCE[0]}" ]]; then
	START_HINT="trio-start"
	TEST_HINT="trio-selftest"
else
	START_HINT="${SCAFFOLD_ROOT}/bin/start-agent.sh"
	TEST_HINT="${SCAFFOLD_ROOT}/bin/trio-selftest.sh"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
	if [[ "$FAILED" -gt 0 ]]; then
		printf '\n干跑中止：失败 %d 件（零写入）。\n' "$FAILED"
		exit 1
	fi
	printf '\n干跑：将新建 %d 项，将覆盖 %d 项，将跳过 %d 项，将保留 %d 项（零写入）\n' \
		"$PLAN_CREATE" "$PLAN_OVERWRITE" "$PLAN_SKIP" "$PLAN_KEEP"
	exit 0
fi

printf '\n完成：新建/覆盖 %d 项，跳过 %d 项，失败 %d 件。\n' "$CREATED" "$SKIPPED" "$FAILED"
if [[ "$FAILED" -gt 0 ]]; then
	printf '\n失败清单：\n'
	if [[ "${#FAILED_PATHS[@]}" -gt 0 ]]; then
		for failed_path in "${FAILED_PATHS[@]}"; do
			printf '  - %s\n' "$failed_path"
		done
	fi
	printf '\n存在注入失败，退出码非 0；请修复后重跑。\n'
	exit 1
fi
if [[ "$POLICY_DIFF" -eq 1 ]]; then
	printf '\n注意：.omp/trio/policy.txt 与上游存在差异，已保留本地版本（未覆盖）。\n'
	printf '请人工核对；若为逃生舱方言，请在项目 README 或 board 标注原因。\n'
fi
printf '\n下一步：\n'
printf '  1. 在项目根目录开三个终端，分别执行：\n'
printf '       %s arch\n' "$START_HINT"
printf '       %s dev\n' "$START_HINT"
printf '       %s qa\n' "$START_HINT"
printf '  2. 自测门禁是否生效：%s %s\n' "$TEST_HINT" "$TARGET_DIR"
