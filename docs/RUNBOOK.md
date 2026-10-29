# 运行手册（RUNBOOK）

> 适用对象：已经用 `trio-init` 初始化过、准备开三个角色干活的项目。
> 本文件只讲「怎么跑起来」，设计原理见 `README.md`。

## 0. 前置检查

```bash
omp --version            # omp 必须在 PATH
command -v tmux          # 仅方式 B 需要，方式 A 不依赖
trio-install --check     # 日常自检：入口软链与仓库位置是否有效
trio-selftest --fast     # 在项目根执行，确认门禁已装好
```

`trio-selftest --fast` 必须全绿再开会话 —— 门禁没生效时开三个 agent 是危险的。

### 0.1 命令速查

| 命令 | 作用 | 何时用 |
|---|---|---|
| `trio-init` | 初始化当前项目：注入角色简报、写策略、hooks、门禁与测试 | 每项目一次；`--force` 覆盖重装 |
| `trio-start <arch\|dev\|qa>` | 以指定角色前台启动 omp | 每开一个角色一次 |
| `trio-tmux` | 单窗口三分屏并行起三个角色 | 方式 B |
| `trio-selftest --fast` | 门禁回归自检 | 开会话前 / 改门禁后 |

未初始化项目跑 `trio-start` 会报「找不到角色简报」——先 `trio-init` 即可。

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

## 2. 方式 A：单终端，一次一个角色

最通用，SSH、VS Code 终端、裸 tty 都一样。**一个终端对应一个 omp 进程**，
`TRIO_ROLE` 只作用于该进程。

### 2.1 只跑一个角色（不并行）

```bash
cd ~/projects/my-app
trio-start arch
```

退出 omp 用 `/quit`（等价 `/q`）或 `/exit`，会回到**同一个终端**的提示符，
接着就能起下一个角色：

```bash
trio-start dev
trio-start qa
```

> `trio-start` 内部的 `exec omp` 替换的是**脚本自身**的进程，不是你的交互 shell。
> 所以退出 omp 后终端不会关闭，提示符还在，无需重开窗口。

### 2.2 三个角色并行

开三个终端，各自 `cd` 到同一项目目录，各跑一个角色：

| 终端 1 | 终端 2 | 终端 3 |
|---|---|---|
| `trio-start arch` | `trio-start dev` | `trio-start qa` |

要点：

- 三个终端必须 `cd` 到**同一个项目目录** —— 它们共享同一 git 工作树。
- 隔离靠写策略白名单，不靠目录隔离；三个 agent 互相能看到文件变化，但改不了对方的目录。
- 不要在同一个 shell 里后台并行跑多个 omp：`TRIO_ROLE` 是进程环境变量，
  会互相覆盖身份。**必须分进程**。

### 2.3 会话名自动同步为角色

`.omp/extensions/trio-session-name.ts` 在 `session_start` 时把 omp 会话名设为
`TRIO_ROLE`（`arch` / `dev` / `qa`）。走进程内扩展，不经过终端按键，因此没有
「TUI 未就绪导致命令被当成聊天内容」的竞态。

覆盖规则：**只在会话尚无标题时写入**。你手动 `/rename 登录改造` 之后，
重开或 resume 都不会被改回角色名。

> omp 没有 `--name` / `--title` 启动参数，hook 的 `sessionManager` 是只读的，
> 只有 extension API 提供可写的 `setSessionName()`——这是自动命名的唯一可靠通道。

## 3. 方式 B：tmux 单窗口三分屏

把**一个**终端切成三块，每块跑一个角色。一个 window、三个 pane。

```bash
cd ~/projects/my-app
trio-tmux                 # 默认 cols（左中右）
trio-tmux --layout rows   # rows（上中下）
```

等价于手工执行（以 `cols` 为例）：

```bash
tmux new-session -d -s trio-my-app -n trio -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start arch --project ~/projects/my-app"
tmux split-window -h -t trio-my-app:trio.0 -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start dev --project ~/projects/my-app"
tmux split-window -h -t trio-my-app:trio.1 -c ~/projects/my-app \
  "env -u TRIO_MODEL trio-start qa --project ~/projects/my-app"
tmux select-layout -t trio-my-app:trio even-horizontal
tmux set-option -w -t trio-my-app:trio pane-border-status top
tmux select-pane -t trio-my-app:trio.0 -T ARCH
tmux select-pane -t trio-my-app:trio.1 -T DEV
tmux select-pane -t trio-my-app:trio.2 -T QA
tmux select-pane -t trio-my-app:trio.0
tmux attach -t trio-my-app
```

### 3.1 布局

| `--layout` | 排列 | 几何 | 适合 |
|---|---|---|---|
| `cols`（默认） | 左→右 `ARCH` `DEV` `QA` | 三列等宽 | 宽屏 / 横屏显示器 |
| `rows` | 上→下 `ARCH` `DEV` `QA` | 三行等高 | 竖屏 / 高窄终端 |

布局由你按屏幕方向自己选，脚本不自动推断（`tmux new-session -d` 创建时拿到的是
服务端 80×24 默认尺寸，量不到真实屏幕，猜出来是错的）。

### 3.2 参数

| 参数 | 说明 |
|---|---|
| `--layout rows\|cols` | 分屏方向，默认 `cols` |
| `--project <目录>` | 项目根，默认当前目录 |
| `--session <名字>` | 会话名，默认 `trio-<目录名>` |
| `--model <标识>` | 给三个 pane 统一换模型；默认用 `start-agent.sh` 的默认模型 |
| `--no-attach` | 只创建会话，不自动接入（适合脚本） |
| `--force` | 会话已存在时先 kill 重建 |
| `--no-remain` | pane 退出后立即关闭（默认失败时保留 pane，便于看报错） |

### 3.3 常用组合

```bash
# 竖屏
trio-tmux --layout rows

# 后台建好，稍后接入
trio-tmux --no-attach
tmux attach -t trio-my-app

# 重建（改了角色简报或想换模型）
trio-tmux --force --model claude-opus-5

# 从任意目录操作别的项目
trio-tmux --project ~/projects/other-app --session trio-other
```

### 3.4 操作要点

| 操作 | 按键 |
|---|---|
| 在三个 pane 间切换 | `Ctrl-b` 然后方向键（或 `o` 循环） |
| 放大当前 pane（临时全屏） | `Ctrl-b` 然后 `z` |
| 显示 pane 编号 | `Ctrl-b` 然后 `q` |
| 脱离会话（进程继续跑） | `Ctrl-b` 然后 `d` |
| 结束整个会话 | `tmux kill-session -t trio-my-app` |

每个 pane 顶部有边框标题（`ARCH` / `DEV` / `QA`），当前焦点 pane 的边框高亮。
初始焦点固定在 `ARCH`——契约先行。

pane 默认 `remain-on-exit failed`：omp 异常退出时保留 pane，能读到错误；
正常退出则 pane 关闭。想改回一律关闭用 `--no-remain`。

> **不是三个 window**。`Ctrl-b` + `w` 的窗口列表里只有一个 `trio`。
> 想全屏专注单个角色，用 `Ctrl-b z` 放大，而不是切窗口。

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

## 4.5 发布与 push（ADR-0001）

三色会话中：

- **qa / arch**：`git push` / `git tag` 被 pre-push hook 机械拒绝。
  人工推送逃生舱：`unset TRIO_ROLE`。
- **dev**：push 需要两个前置 —— ① QA 报告全绿（hook 会重新跑
  报告校验器）；② 看板状态 `qa_passed` / `user_signed`。
  qa_passed 与 user_signed 之间的发布窗口，请 dev 向用户请求终验后再推。
- 版本号（`pyproject.toml` / `setup.cfg` / `setup.py`）与 `CHANGELOG.md`
  的写入权已从公共维护区收窄到 **dev 独占**；qa / arch 越写会被
  pre-commit / trio-guard 拒绝。

### 4.5.1 角色 × 发布链矩阵

| 动作 | arch | dev | qa | 用户（无角色） | 拦截层 |
|---|---|---|---|---|---|
| `git push` / `git tag` | ❌ | ✅ 前置达标 | ❌ | ✅ | pre-push hook |
| version bump / CHANGELOG 截版 | ❌ | ✅ 独占 | ❌ | ✅ | policy.txt → pre-commit / trio-guard |
| `npm publish` 等真实发布 | 纪律禁令 | ✅ | 纪律禁令 | ✅ | rules.md 纪律（命令层，无 hook） |

角色在发布链里各执一环：

- **qa 的否决权**：dev 要 push，必须先有一份 qa 产出的全绿报告。
  qa 报「未通过 / 半通过」，dev 的 push 被 hook 机械堵死——qa 不碰
  发布动作，报告本身就是否决票。
- **arch 的契约权**：报告全绿的前提是报告覆盖契约的每条 AC。契约矛盾
  时流程停在 `contract-gap` 裁决，根本走不到发布。arch 对发布的约束
  是间接但前置的。
- **dev 的执行权**：唯一握有发布动作的角色，但被三重前置层层嵌套
  （QA 报告全绿 → 看板 `qa_passed` → 用户签字 `user_signed`）。
  权限集中与流程制衡并存。
- **用户的终验权**：发布权的落点与逃生舱。qa_passed → user_signed
  之间的抢跑争议由用户签字终结；`unset TRIO_ROLE` 后的人工推送不受
  hook 管辖，是全链兜底。

一句话记忆：**qa 投否决票，arch 发通行证，dev 踩油门，用户握方向盘**。

### 4.6 流程契约（ADR-0013）

#### 4.6.1 熔断口径

- **仅实现缺陷轮计数**：QA 判「未通过」→ DEV 修 → QA 复测仍未通过 = 1 轮，前提是
  QA 报告该行根因分类为 `[根因:实现]`。累计 3 轮停手转 `blocked`。
- **契约 / 用例 / 环境轮不计数**：契约缺陷 → `contract-gap` 交 ARCH；QA 用例错 → 修用例；
  环境问题 → 修环境。三者 MUST 在 1 轮内转 verdict / `contract-gap` / 用例修正，
  转不动即 `blocked`（比烧满 3 轮更快暴露）。
- QA 报告「未通过」行未标根因分类 → `bin/trio-check-report.mjs` T11 判违规，
  不计轮次（无分类不计轮）。

#### 4.6.2 HITL 攒批签字（签字绑 commit 链）

- 多个任务到达 `qa_passed` 后**攒批**到一次终验会话统一签字，不逐任务打断用户。
- 签字记录 MUST 绑定 commit 链：记下当时的 `HEAD` / 报告基线 commit；
  ADR-0012 §3.3 的「报告基线 == 待推 sha」保证签字对象与推送代码一致。
- 攒批期内新增提交 → 旧签字对新增部分失效，触发增量复验（基线 ≠ 待推即拒绝推送，
  除非 delta 仅文档路径）。

#### 4.6.3 spec 时间预算

- 单任务 spec ≤ 1 轮会话；超时即降级：**先实现非契约面**（不依赖契约裁决的部分），
  契约面挂 `waiting_user` / `contract-gap`，不得用「边写边定」拖住流水。
- 契约只锁接口签名 + AC + 错误契约；实现细节明文不锁（spec §7「范围外」），
  DEV 自主决定内部实现。

---

## 5. 常见问题

**`trio-start: 找不到角色简报`**
项目没初始化，或初始化不完整。在项目根执行 `trio-init`（首次）或
`trio-init --force`（覆盖修复）。

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
