# 运行手册（RUNBOOK）

> 适用对象：已经用 `trio-init` 初始化过、准备开三个角色干活的项目。
> 本文件只讲「怎么跑起来」，设计原理见 `README.md`。

## 0. 前置检查

```bash
omp --version            # omp 必须在 PATH
command -v tmux          # 仅方式 B 需要，方式 A 不依赖
trio-selftest --fast     # 在项目根执行，确认门禁已装好
```

`trio-selftest --fast` 必须全绿再开会话 —— 门禁没生效时开三个 agent 是危险的。

---

## 1. 模型：默认 `deepseek/deepseek-v4.1-flash`

三个角色默认都跑 `deepseek/deepseek-v4.1-flash`（commandcode provider），
由 `start-agent.sh` 的 `TRIO_DEFAULT_MODEL` 常量决定，启动时以 `--model` 传入。

| 操作 | 生效范围 |
|---|---|
| 什么都不设 | 三个角色都用默认模型 |
| `TRIO_MODEL=<标识>` + `trio-start <角色>` | 该终端 |
| `trio-tmux --model <标识>` | 三个窗口 |
| 会话内 `/model` | 仅当前窗口，临时 |

手动启动时改模型：

```bash
# 单个终端换模型
TRIO_MODEL=claude-opus-5 trio-start arch

# tmux 三窗口统一换模型
trio-tmux --model claude-sonnet-5

# 改出厂默认（影响所有项目）
# 编辑 bin/start-agent.sh 的 TRIO_DEFAULT_MODEL
```

> 默认值必须保留 `deepseek/` 前缀。裸写 `deepseek-v4.1-flash` 会**精确命中**
> opencode-go provider 下的同名模型（max-out 384K），而不是 commandcode 那条
> （max-out 66K）。两者都能用，但计费与额度池不同。

会话内切换：

| 操作 | 说明 |
|---|---|
| `/model` | 打开模型选择器（TUI 内） |
| `/switch` | 切换到另一个模型 |
| `/effort` | 调整思考强度（与模型相关） |
| `Ctrl+P` | 在 `--models` 指定的候选集里循环 |

查看可用模型：`omp models`，或 `omp models find deepseek`。

> `trio-tmux` 默认在窗口命令里加 `env -u TRIO_MODEL`，清掉父 shell 的残留值，
> 保证三个窗口都落到默认模型；给了 `--model` 才转成 `TRIO_MODEL` 传下去。

---

## 2. 方式 A：三个终端（不依赖 tmux）

最通用，SSH、VS Code 终端、裸 tty 都一样。

```bash
cd ~/projects/my-app

# 终端 1
trio-start arch

# 终端 2
trio-start dev

# 终端 3
trio-start qa
```

要点：

- **一个终端一个角色**。`trio-start` 以 `exec` 启动 omp，当前 shell 进程会被替换。
- 三个终端必须 `cd` 到**同一个项目目录** —— 它们共享同一 git 工作树。
- 隔离靠写策略白名单，不靠目录隔离；三个 agent 互相能看到文件变化，但改不了对方的目录。

不想开三个终端时，用 omp 的后台能力不合适：`TRIO_ROLE` 是进程环境变量，
同一 shell 里的多个 omp 会互相覆盖身份。**必须分进程**。

---

## 3. 方式 B：tmux 一键三窗口

```bash
cd ~/projects/my-app
trio-tmux
```

等价于手工执行：

```bash
tmux new-session -d -s trio-my-app -n arch -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start arch --project ~/projects/my-app"
tmux new-window -t trio-my-app -n dev -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start dev --project ~/projects/my-app"
tmux new-window -t trio-my-app -n qa -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start qa --project ~/projects/my-app"
tmux select-window -t trio-my-app:arch
tmux attach -t trio-my-app
```

### 参数

| 参数 | 说明 |
|---|---|
| `--project <目录>` | 项目根，默认当前目录 |
| `--session <名字>` | 会话名，默认 `trio-<目录名>` |
| `--model <标识>` | 给三个窗口统一换模型；默认用 `start-agent.sh` 的默认模型 |
| `--no-attach` | 只创建会话，不自动接入（适合脚本） |
| `--force` | 会话已存在时先 kill 重建 |
| `--no-remain` | 窗口退出后立即关闭（默认失败时保留窗口，便于看报错） |

### 常用组合

```bash
# 后台建好，稍后接入
trio-tmux --no-attach
tmux attach -t trio-my-app

# 重建（改了角色简报或想换模型）
trio-tmux --force --model claude-opus-5

# 从任意目录操作别的项目
trio-tmux --project ~/projects/other-app --session trio-other
```

### 操作要点

| 操作 | 按键 |
|---|---|
| 列出窗口 | `Ctrl-b` 然后 `w` |
| 直选窗口 | `Ctrl-b` 然后 `0`/`1`/`2` |
| 垂直分屏看两个角色 | `Ctrl-b` 然后 `%` |
| 脱离会话（进程继续跑） | `Ctrl-b` 然后 `d` |
| 结束整个会话 | `tmux kill-session -t trio-my-app` |

窗口默认设为 `remain-on-exit failed`：omp 异常退出时窗口保留，能读到错误；
正常退出则窗口关闭。想改回一律关闭用 `--no-remain`。

---

## 4. 首次运行的标准动作

三个角色都起来后，按这个顺序推进（详见 README 的任务工作流）：

```bash
# 任意终端（人类）建任务文件夹
mkdir -p docs/task/2026-10-25-登录改造
cp .omp/trio/templates/board.template.md docs/task/2026-10-25-登录改造/board.md
```

1. **ARCH 窗口**：写 `docs/task/<任务>/arch-<YYYYMMDD>-<HHMM>-<主题>.md` 契约，更新 `board.md` 状态。
2. **DEV 窗口**：读契约，写 `src/**`，产出 `dev-*.md` 交付说明。
3. **QA 窗口**：按契约写 `tests/**`，产出 `qa-*-report-*.md` 验收报告（四值结论）。
4. 报告不合规时 pre-commit 会拒绝提交，`bin/trio-check-report.mjs` 会打印具体哪一条不过。

---

## 5. 常见问题

**`trio-start: 找不到角色简报`**
项目没初始化，或初始化不完整。在项目根执行 `trio-init --force`。

**`trio-tmux: 会话已存在`**
用 `tmux attach -t <会话名>` 接入旧会话，或 `--force` 重建。

**三个窗口里 agent 互相看不到改动**
确认三个窗口的 cwd 是同一项目：`tmux display-message -p '#{pane_current_path}'`。

**改了模型但没生效**
`--model` 是模糊匹配，`opus` 这类简写可能命中非预期模型。
`omp models find <关键词>` 确认全名后重开，或用 `/model` 在选择器里挑。

**omp 因额度/限流失败**
与脚手架无关。`trio-selftest` 会自动把这类错误识别为「环境不可用」并跳过，
不计入失败；`tests/trio-guard.test.mjs` 是纯运行时测试，不需要模型。
