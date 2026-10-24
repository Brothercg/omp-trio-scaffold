# omp 三人行脚手架（Three Amigos for omp）

面向终端多 Agent 隔离协作的脚手架体系。参考经典软件工程的**敏捷三人行**
（Three Amigos：PM / 架构、Dev / 开发、QA / 对抗测试）协作理念，
把「角色分工 + 契约先行 + 对抗验收」落到 omp 的实际运行机制上。

---

## 设计哲学

### 一、物理写隔离，能力全开

不剥夺 omp 的任何底层工具与执行能力 —— LSP、DAP、终端执行、浏览器、
子 Agent 全部保留。只在**写入落盘的那一刻**按角色拒绝越权路径。

隔离由两层构成，缺一不可：

| 层 | 位置 | 作用 |
|---|---|---|
| 进程内 hook | `.omp/hooks/pre/trio-guard.ts` | 实时拦截，在写入发生前阻断 |
| 提交兜底 | `.git/hooks/pre-commit` | 提交前复核暂存区，堵住绕过 hook 的路径 |

两层共用同一份策略真值源：`.omp/trio/policy.txt`。

### 二、测试契约独立

验收标准与测试由 PM 与 QA 闭环。开发**严禁**修改测试用例来掩盖 Bug；
QA 发现缺陷必须产出**最小报错复现脚本** + 缺陷文档。

这条约束不是靠提示词自觉，而是靠目录白名单硬隔离：
Dev 写 `src/`，QA 写 `tests/`，两边目录不相交，物理上无法越界。

### 三、消除遗忘与越权

- **消除遗忘**：每个角色一份独立 System Prompt 简报（`--append-system-prompt` 注入），
  角色职责、禁止项、白名单、协作方式全部落盘可查。
- **消除越权**：策略在 `.omp/trio/policy.txt` 一处定义，hook 与 pre-commit 同步消费。

---

## 目录结构

```
omp-trio-scaffold/
├── bin/
│   ├── init-agent.sh         把脚手架注入目标项目
│   ├── start-agent.sh        以指定角色启动 omp
│   └── trio-selftest.sh      一键自测门禁是否生效
├── profiles/                 角色简报（出厂源）
│   ├── pm.rules.md           PM：系统架构师与产品设计师
│   ├── dev.rules.md          DEV：高级软件开发工程师
│   └── test.rules.md         QA：对抗性质检与边界测试专家
├── templates/                契约模板（出厂源）
│   ├── spec.template.md      验收契约
│   ├── release.template.md   交付说明
│   ├── bug.template.md       缺陷文档
│   ├── CURRENT_TASK.md       任务看板模板
│   └── pre-commit            提交门禁脚本
├── .omp/                     脚手架自身的运行时副本
│   ├── trio/
│   │   ├── pm.rules.md / dev.rules.md / test.rules.md
│   │   ├── CURRENT_TASK.md   运行时看板实体
│   │   └── policy.txt        写策略单一真值源
│   └── hooks/pre/trio-guard.ts   进程内写门禁
├── README.md
├── .gitignore
└── .gitattributes
```

### 目标项目中的落地形态

`bin/init-agent.sh` 会在目标项目里创建：

```
<项目>/
├── .omp/
│   ├── trio/            角色简报 + 看板 + 策略
│   └── hooks/pre/trio-guard.ts
├── .git/hooks/pre-commit
├── docs/
│   ├── specs/           PM 独占：验收契约
│   ├── architecture/    PM 独占：架构决策
│   ├── releases/        DEV 独占：交付说明
│   └── bugs/            QA 独占：缺陷文档
├── src/                 DEV 独占：业务实现
└── tests/               QA 独占：测试与复现脚本
```

---

## 接入新项目

```bash
cd /path/to/omp-trio-scaffold
bin/init-agent.sh /path/to/your-project
```

参数：

| 参数 | 说明 |
|---|---|
| `<目标项目路径>` | 要初始化的项目目录，默认当前目录 |
| `--force` | 覆盖已存在的文件（默认**不覆盖**，只打印「跳过」） |

`init-agent.sh` 会：

1. 创建 `docs/{specs,releases,bugs,architecture}`、`src/`、`tests/`
2. 注入 `.omp/trio/`（角色简报 + 看板 + 策略真值源）
3. 注入 `.omp/hooks/pre/trio-guard.ts`
4. 安装 `.git/hooks/pre-commit`（755 可执行）

**前置条件**：目标目录必须已是 git 仓库（pre-commit 门禁依赖 git）。

---

## 推荐的 3 窗口操作时序

### 准备

```bash
bin/init-agent.sh ~/projects/my-app
cd ~/projects/my-app
```

### 开三个终端

```bash
# 终端 A —— PM
bin/start-agent.sh pm

# 终端 B —— DEV
bin/start-agent.sh dev

# 终端 C —— QA
bin/start-agent.sh qa
```

`start-agent.sh` 在当前终端直接启动 `omp`（不新开窗口），窗口由你手动开。
它会导出 `TRIO_ROLE`（门禁的身份来源），并用 `--append-system-prompt`
注入对应角色简报。

### 时序

```
┌─────────────┬──────────────────────────┬──────────────────────────┐
│ 阶段         │ PM                       │ DEV / QA                 │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 1 契约       │ 写 docs/specs/<id>.md    │ （等待，读契约）          │
│             │ Given-When-Then + 边界   │                          │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 2 实现       │ 更新看板 → spec_agreed   │ DEV 读契约 → 写 src/     │
│             │                          │ QA 读契约 → 写 tests/    │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 3 交付       │                          │ DEV 写 docs/releases/    │
│             │                          │ （含真实检查结果）        │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 4 对抗       │ 裁决契约歧义             │ QA 跑测试 → 失败则       │
│             │                          │ 写 docs/bugs/ +           │
│             │                          │ tests/repro/ 最小复现     │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 5 修复       │ 更新看板 → testing       │ DEV 读缺陷文档 → 修 src/ │
│             │                          │ （不碰 tests/）           │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ 6 验收       │ 勾选 AC                  │ QA 复测 → 全绿 → done    │
└─────────────┴──────────────────────────┴──────────────────────────┘
```

三条铁律在时序中体现为：

- PM 写完契约前，DEV/QA 只能读、不能猜。
- DEV 遇到测试失败时改 `src/`，**不改** `tests/`；契约本身有问题时写进交付说明交 PM 裁决。
- QA 发现缺陷时**只报告不修复** —— 越权改 `src/` 会污染缺陷真相。

---

## 写策略

策略唯一真值源：`.omp/trio/policy.txt`。语法：

```
allow <role> <glob>       该角色允许写入该路径
deny  <role> <glob>       该角色禁止写入该路径
```

- `<role>`：`pm` / `dev` / `qa` / `*`（所有角色）
- 判定：**deny 优先**；deny 未命中但 allow 命中则允许；两者都没命中则**拒绝**（fail-closed）
- 路径相对于项目根目录；`*` 匹配任意字符（含 `/`）

### 角色矩阵

| 路径 | PM | DEV | QA |
|---|:---:|:---:|:---:|
| `docs/specs/**` | ✅ 写 | ❌ | ❌ |
| `docs/architecture/**` | ✅ 写 | ❌ | ❌ |
| `docs/releases/**` | ❌ | ✅ 写 | ❌ |
| `docs/bugs/**` | ❌ | ❌ | ✅ 写 |
| `src/**` | ❌ | ✅ 写 | ❌ |
| `tests/**` | ❌ | ❌ | ✅ 写 |
| `.omp/trio/CURRENT_TASK.md` | ✅ | ✅ | ✅ |
| 公共维护区 | ✅ | ✅ | ✅ |

公共维护区（三方均可写）：`README.md`、`CHANGELOG.md`、`pyproject.toml`、
`setup.cfg`、`setup.py`、`requirements*.txt`、`uv.lock`、`poetry.lock`、
`pytest.ini`、`.pytest.ini`、`ruff.toml`、`.ruff.toml`、`pyrightconfig.json`、
`.gitignore`、`.gitattributes`、`.github/workflows/*`。

门禁自身（`.omp/hooks/**`、`.omp/trio/policy.txt`、`.git/hooks/pre-commit`、
`bin/**`）对任何角色都是 deny —— 否则 Dev 可以改 hook 来解除对自己的限制。

### 被拦截的写通道

hook 覆盖 omp 的全部落盘通道：

| 工具 | 路径来源 |
|---|---|
| `write` | `path` |
| `edit` | `path`（replace/patch）或 `input` 里的 `*** Update File:` 标记（apply_patch） |
| `ast_edit` | `paths[]` |
| `bash` | `command` —— **写意图正则 AND 禁写路径同时命中**才拦 |
| `lsp` | `file` —— 仅 `rename` / `rename_file` / `code_actions`+`apply` 视为写 |
| `eval` | `code` 里的文件路径字面量 |

bash 通道用「写意图 + 禁写路径」双条件，是为了让只读命令正常通过：
`ls tests/`、`cat docs/specs/x.md`、`pytest` 都不拦，
只有 `echo x > tests/a.py`、`sed -i ... tests/`、`cp ... src/` 这类真落盘才被阻断。

### pre-commit 兜底

`.git/hooks/pre-commit` 读取暂存区文件列表，按同一份策略复核：

- `TRIO_ROLE` 未设置 → **放行**（人工提交是合法逃生舱）
- `TRIO_ROLE` 非法值 → 拒绝
- 策略文件缺失 → 拒绝（fail-closed）

---

## 角色身份来源

`TRIO_ROLE` 环境变量，由 `bin/start-agent.sh` 导出。

- 进程内 hook 直接读 `process.env.TRIO_ROLE`
- `git commit` 由 Agent 在 omp 进程内发起时继承同一环境变量，
  所以 pre-commit 也能读到正确身份
- 手工在另一个终端提交时没有该变量 → 放行（决策：人工介入优先）

---

## 模型选择

脚手架**不内置**任何模型名绑定，只透传环境变量：

```bash
TRIO_MODEL=opus bin/start-agent.sh dev
```

不设则用 omp 当前默认模型。

想让 QA 具备真正的对抗独立性（与 Dev 用不同模型），只需给 QA 窗口设不同的
`TRIO_MODEL`：

```bash
# 终端 B
TRIO_MODEL=opus bin/start-agent.sh dev
# 终端 C
TRIO_MODEL=gpt-5.2 bin/start-agent.sh qa
```

---

## 自测

### 一键自测（推荐）

```bash
bin/trio-selftest.sh /path/to/your-project
```

七段验证，全部通过才算门禁生效：

| 阶段 | 验证内容 |
|---|---|
| 1/7 | 安装完整性：hook、策略、pre-commit 三个文件都在且可执行 |
| 2/7 | 准备测试夹具 |
| 3/7 | 门禁策略单元测试（71 项契约断言） |
| 4/7 | pre-commit 兜底：`TRIO_ROLE=dev` 提交 `tests/` 被拒、提交 `src/` 放行、无角色时放行 |
| 5/7 | **真实 omp 调用**：`write` → `src/` 放行、`write` → `tests/` 被拦、`edit` → `src/` 放行、`bash` → `tests/` 被拦 |
| 6/7 | 角色白名单：`TRIO_ROLE=qa` 写 `src/` 被拦 |
| 7/7 | 清理夹具 |

跳过真实 omp 调用（只跑静态检查与 pre-commit）：

```bash
bin/trio-selftest.sh --fast /path/to/your-project
```

### 手动快速自测（三条命令）

不想跑整套时，在目标项目里直接验证三通道拦截：

```bash
cd /path/to/your-project

# 1. write 通道：Dev 写 tests/ 应被拦，写 src/ 应放行
TRIO_ROLE=dev omp -p '用 write 工具创建 tests/x.txt，然后再用 write 工具创建 src/ok.txt。分别报告成功或被拦。'

# 2. bash 通道：写意图被拦，只读放行
TRIO_ROLE=dev omp -p '用 bash 工具执行: echo bad > tests/x.txt 。然后用 bash 工具执行: ls tests/ 。分别报告结果。'

# 3. pre-commit 兜底：有角色被拒，无角色放行
git add tests/ && TRIO_ROLE=dev git commit -m probe   # 期望：拒绝
git add tests/ && git commit -m probe                 # 期望：放行（无角色标记）
```

### 门禁策略回归测试

策略契约有独立测试，改了 `.omp/trio/policy.txt` 就该跑它：

```bash
bun tests/trio-policy.test.mjs
```

71 项断言，覆盖角色矩阵、公共维护区、门禁自身保护、fail-closed、
bash 写意图与只读放行、`edit`/`eval` 路径提取、`lsp` 读写动作区分。

---

## 已知边界

- **hook 拦不住 `eval` 里的全部写法**：只匹配代码中的文件路径字面量，
  运行时拼接出来的路径无法静态识别。
- **hook 拦不住「路径藏在文件里」的写操作**：`patch -p1 < fix.patch`、
  `python script.py`（脚本内部自行写盘）等形式，命令文本里没有目标路径，
  静态分析无从判断。这类操作仍会被 pre-commit 在提交时兜住。
- **hook 拦不住绕过 omp 的写入**：Agent 在 omp 外执行的 `git commit` 不经过 hook，
  但仍会经过 pre-commit 兜底；直接手改文件则两者都拦不住 —— 这是终端工具的固有边界。
- **pre-commit 只能看到暂存区路径**，看不到「是谁改的」，因此角色判定完全依赖
  `TRIO_ROLE` 环境变量。
- **三个 Agent 共享同一工作树**：靠目录白名单隔离，不做 worktree 隔离。
  好处是 QA 能立刻看到 Dev 的实现；代价是三者共用同一个 git index。
