#!/usr/bin/env bash
#
# trio-install.sh —— 把脚手架的三个入口发布到本机 PATH 目录
#
# 发布的是软链（symlink），不是副本：
#   trio-init       -> <scaffold>/bin/init-agent.sh
#   trio-start      -> <scaffold>/bin/start-agent.sh
#   trio-selftest   -> <scaffold>/bin/trio-selftest.sh
#
# 因此仓库更新后无需重新发布；但若整个仓库被移动/删除，软链会失效
# （trio-install.sh --check 可检测）。
#
# 用法:
#   bin/trio-install.sh [--prefix <目录>] [--force] [--check] [--uninstall]
#
#   --prefix <目录>   安装目录，默认为 ${HOME}/.local/bin
#   --force           覆盖已存在且指向其他位置的同名文件/软链
#   --check           只检查当前状态，不做修改
#   --uninstall       删除本脚本创建的软链
#
# 退出码：0 全部就绪；1 有未就绪项（仅 --check）；2 参数错误。

set -euo pipefail

# 解析软链后的真实路径：本脚本本身也可能被软链到 PATH。
readonly SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly SELF_DIR="$(dirname "$SELF_PATH")"
readonly SCAFFOLD_ROOT="$(cd "${SELF_DIR}/.." && pwd)"

PREFIX="${HOME}/.local/bin"
FORCE=0
CHECK_ONLY=0
UNINSTALL=0

usage() {
	cat <<'EOF'
用法: trio-install.sh [--prefix <目录>] [--force] [--check] [--uninstall]

  --prefix <目录>   安装目录，默认为 ${HOME}/.local/bin
  --force           覆盖已存在且指向其他位置的同名文件/软链
  --check           只检查当前状态，不做修改
  --uninstall       删除本脚本创建的软链
  -h, --help        显示本帮助

发布后可在任意目录使用:
  trio-init                    在当前目录注入脚手架
  trio-init ~/projects/app     注入到指定项目
  trio-start dev               以 DEV 角色启动 omp
  trio-selftest --fast         只跑不依赖模型的检查
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--prefix)
			[[ $# -ge 2 ]] || {
				printf 'trio-install.sh: --prefix 需要一个目录参数\n' >&2
				exit 2
			}
			PREFIX="$2"
			shift 2
			;;
		--force)
			FORCE=1
			shift
			;;
		--check)
			CHECK_ONLY=1
			shift
			;;
		--uninstall)
			UNINSTALL=1
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			printf 'trio-install.sh: 未知参数：%s\n' "$1" >&2
			usage >&2
			exit 2
			;;
	esac
done

# ── 脚手架完整性 ───────────────────────────────────────────────────────────
# 软链发布的前提是仓库自洽；缺件时装进去只会在别处报更难懂的错。

MISSING=0
for required in \
	"bin/init-agent.sh" \
	"bin/start-agent.sh" \
	"bin/trio-selftest.sh" \
	"bin/trio-check-report.mjs" \
	"templates/pre-commit" \
	".omp/trio/policy.txt" \
	".omp/hooks/pre/trio-guard.ts"; do
	if [[ ! -f "${SCAFFOLD_ROOT}/${required}" ]]; then
		printf 'trio-install.sh: 脚手架不完整，缺少 %s\n' "$required" >&2
		MISSING=1
	fi
done
[[ "$MISSING" -eq 0 ]] || {
	printf '                  源目录：%s\n' "$SCAFFOLD_ROOT" >&2
	exit 1
}

# ── 软链清单 ───────────────────────────────────────────────────────────────
readonly LINKS=(
	"trio-init:bin/init-agent.sh"
	"trio-start:bin/start-agent.sh"
	"trio-selftest:bin/trio-selftest.sh"
)

path_contains_prefix() {
	local dir
	local IFS=':'
	for dir in $PATH; do
		[[ "$dir" == "$PREFIX" ]] && return 0
	done
	return 1
}

# ── --uninstall ────────────────────────────────────────────────────────────

if [[ "$UNINSTALL" -eq 1 ]]; then
	removed=0
	for entry in "${LINKS[@]}"; do
		name="${entry%%:*}"
		dest="${PREFIX}/${name}"
		if [[ -L "$dest" ]]; then
			rm -f "$dest"
			printf '已删除软链：%s\n' "$dest"
			removed=$((removed + 1))
		elif [[ -e "$dest" ]]; then
			printf '跳过：%s 不是软链（可能是手工安装的副本），未删除\n' "$dest" >&2
		fi
	done
	printf '卸载完成（删除 %d 项）。\n' "$removed"
	exit 0
fi

# ── --check ────────────────────────────────────────────────────────────────

if [[ "$CHECK_ONLY" -eq 1 ]]; then
	ok=0
	bad=0
	for entry in "${LINKS[@]}"; do
		name="${entry%%:*}"
		rel="${entry#*:}"
		want="${SCAFFOLD_ROOT}/${rel}"
		dest="${PREFIX}/${name}"
		if [[ -L "$dest" && "$(readlink -f "$dest")" == "$want" ]]; then
			printf '  ✓ %-14s -> %s\n' "$name" "$want"
			ok=$((ok + 1))
		elif [[ -e "$dest" || -L "$dest" ]]; then
			printf '  ✗ %-14s 存在但指向 %s（期望 %s）\n' "$name" "$(readlink -f "$dest" 2>/dev/null || echo '?')" "$want"
			bad=$((bad + 1))
		else
			printf '  ✗ %-14s 未安装（期望 %s）\n' "$name" "$dest"
			bad=$((bad + 1))
		fi
	done
	if path_contains_prefix; then
		printf '  ✓ PATH 包含 %s\n' "$PREFIX"
	else
		printf '  ✗ PATH 不包含 %s\n' "$PREFIX"
		bad=$((bad + 1))
	fi
	printf '检查结果：就绪 %d 项，未就绪 %d 项\n' "$ok" "$bad"
	[[ "$bad" -eq 0 ]]
	exit $?
fi

# ── 安装 ───────────────────────────────────────────────────────────────────

mkdir -p "$PREFIX"

created=0
skipped=0
for entry in "${LINKS[@]}"; do
	name="${entry%%:*}"
	rel="${entry#*:}"
	target="${SCAFFOLD_ROOT}/${rel}"
	dest="${PREFIX}/${name}"

	if [[ -L "$dest" ]] && [[ "$(readlink -f "$dest")" == "$target" ]]; then
		printf '  已就绪：%s\n' "$dest"
		skipped=$((skipped + 1))
		continue
	fi

	if [[ -e "$dest" || -L "$dest" ]]; then
		if [[ "$FORCE" -ne 1 ]]; then
			printf '  跳过：%s 已存在。加 --force 覆盖。\n' "$dest" >&2
			skipped=$((skipped + 1))
			continue
		fi
		printf '  覆盖：%s\n' "$dest"
	fi

	ln -sfn "$target" "$dest"
	chmod +x "$target"
	printf '  已发布：%s -> %s\n' "$dest" "$target"
	created=$((created + 1))
done

printf '\n发布完成：新建 %d 项，已就绪/跳过 %d 项。\n' "$created" "$skipped"

if ! path_contains_prefix; then
	printf '\n注意：%s 不在 PATH 中，把下面一行加入 shell 配置（~/.bashrc 或 ~/.zshrc）：\n' "$PREFIX"
	printf '  export PATH="%s:$PATH"\n' "$PREFIX"
fi

printf '\n下一步：\n'
printf '  cd <你的项目> && trio-init\n'
printf '  trio-selftest --fast\n'
printf '  trio-start arch\n'
