# 缺陷：<一句话描述现象>

<!--
用法：复制本文件到 docs/bugs/<defect-id>.md 后填写。
本文件由 QA 独占写入。核心要求：必须附最小报错复现脚本路径，
只报告不修复 —— 不要改 src/。
-->

| 字段 | 值 |
|---|---|
| Defect ID | `<BUG-000>` |
| 发现时间 | `<YYYY-MM-DD HH:MM>` |
| 严重级别 | `Blocker` / `Critical` / `Major` / `Minor` |
| 对应 Task ID | `<TASK-000>` |
| 违反的验收准则 | `AC-<n>` / `契约未覆盖` |
| 状态 | `open` / `confirmed` / `fixed` / `rejected` |

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

## 7. 裁决记录（由 PM / DEV 填写）

| 字段 | 内容 |
|---|---|
| 裁决 | `确认为缺陷` / `契约歧义，转 PM 裁决` / `非缺陷` |
| 裁决人 | `<角色>` |
| 裁决说明 | `<结论与依据>` |
| 关联交付 | `<后续修复对应的 docs/releases/<id>.md>` |
