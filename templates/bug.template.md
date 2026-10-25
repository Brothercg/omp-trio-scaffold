# 缺陷：<一句话描述现象>

<!--
填写人：谁撞到谁写（QA 为主，DEV 与 ARCH 也可提交自己的缺口文件）。
落位：docs/task/<YYYY-MM-DD-事项>/<你的角色>-<YYYYMMDD>-<HHMM>-bug-<编号>.md

核心要求：
  - 必须附最小报错复现脚本路径（`type: code` 时）；缺失则缺陷不成立。
  - 只报告不修复 —— 任何角色都不改别人的代码。
  - 契约缺口（`type: contract-gap`）另由 ARCH 出 `arch-*-verdict-*.md`，
    本文件只留现象与指向，**不要**在这里写裁决。
-->

| 字段 | 值 |
|---|---|
| Defect ID | `BUG-000` |
| 类型 | `code`（实现错） / `contract-gap`（契约/规则本身的缺口） |
| 发现时间 | `<YYYY-MM-DD HH:MM>` |
| 严重级别 | `Blocker` / `Critical` / `Major` / `Minor` |
| 对应 Task ID | `<TASK-000>` |
| 违反的验收准则 | `AC-<n>` / `契约未覆盖` |
| 状态 | `open` / `confirmed` / `fixed` / `rejected` |
| 裁决记录 | `arch-<YYYYMMDD>-<HHMM>-verdict-<N>.md`（无则填 `无`） |

## 1. 缺陷现象

<实际观察到的行为。与期望行为的差异要具体到可复现。>

示例：输入空列表时返回 500 与 `KeyError: 'items'`，期望返回 200 与空数组。

- 实际行为：`<观察到的>`
- 期望行为：`<来自哪条 Given-When-Then，或说明契约未覆盖>`
- 复现概率：`<必现 / 偶发（约 N/M 次）>`

## 2. Failing Test Script

> 最小报错复现脚本路径 —— 本缺陷的必备项，缺失则缺陷不成立。

```
tests/repro/<defect-id>.py
```
或
```
tests/test_<defect-id>.py
```

运行方式：
```
$ python tests/repro/<defect-id>.py
```
或
```
$ pytest tests/test_<defect-id>.py -v
```

脚本特征：最小、可独立运行、失败原因明确、重复运行结果一致。

## 3. 复现堆栈

```
<完整 traceback 或 pytest 输出，包含断言消息>
```

## 4. 最小复现步骤

1. `<前置状态，如「已登录账号 alice」>`
2. `<操作，如「调用 POST /api/login，body 为 {"email": "a@b.c"}」>`
3. `<观察到的失败>`

## 5. 影响面

- 受影响的功能：`<范围>`
- 是否有数据损坏：`<有 / 无，说明>`
- 是否可绕过：`<可绕过 / 不可绕过，绕过方式>`

## 6. 建议的修复方向（供参考，不代劳）

<指出可能的原因位置即可，不要直接改 src/。>

疑似位于：`src/<path>::<function>`

## 7. 处置与指针（发现者维护）

> 裁决本身不写在这里 —— 本文件属于发现者，裁决由 ARCH 另立
> `arch-*-verdict-*.md`。本段只记状态与去处。

| 字段 | 内容 |
|---|---|
| 处置 | `确认为实现缺陷` / `已转 ARCH 裁决` / `非缺陷（误解）` |
| 裁决文件 | `arch-<YYYYMMDD>-<HHMM>-verdict-<N>.md`（无则填 `无`） |
| 关联交付 | `dev-*-release.md`（无则填 `无`） |
