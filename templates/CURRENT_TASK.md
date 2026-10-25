# 任务看板

<!--
用法：本文件由 bin/init-agent.sh 复制到目标项目的 .omp/trio/CURRENT_TASK.md。
这是三方公用看板 —— ARCH / DEV / QA 均可写。
注意：看板只存「状态与路径索引」，不存验收准则本身。
契约永远只存放在 docs/specs/（ARCH 独占写入），看板通过路径引用它。
-->

| 字段 | 值 |
|---|---|
| 当前 Task ID | `<TASK-000>` |
| 当前状态 | `spec_draft` / `spec_agreed` / `implementing` / `testing` / `done` / `blocked` |
| 最后更新 | `<YYYY-MM-DD HH:MM>` |
| 更新人角色 | `ARCH` / `DEV` / `QA` |

## 状态机

```
spec_draft ──► spec_agreed ──► implementing ──► testing ──► done
     │              │               │              │
     └──────────────┴───────────────┴──────────────┴──► blocked
```

| 状态 | 含义 | 谁推进 |
|---|---|---|
| `spec_draft` | 规格撰写中，验收准则未定稿 | ARCH |
| `spec_agreed` | 验收准则已定稿，DEV 可开工 | ARCH |
| `implementing` | 实现进行中 | DEV |
| `testing` | 实现完成，QA 正在验证 | QA |
| `done` | 验收准则全部通过 | QA |
| `blocked` | 被阻塞，需 ARCH 裁决或补充前置 | 提出方 |

## 当前任务

| 项 | 值 |
|---|---|
| 标题 | `<任务标题>` |
| 验收契约 | `docs/specs/<task-id>.md` |
| 交付说明 | `docs/releases/<task-id>.md` |
| 缺陷文档 | `docs/bugs/<defect-id>.md`（无则填 `无`） |
| 复现脚本 | `tests/repro/<defect-id>.py`（无则填 `无`） |

## 验收准则进度

> 只勾选状态，不复制准则正文 —— 正文以 `docs/specs/` 为准。

| 准则 | ARCH 定稿 | DEV 实现 | QA 验证 | 状态 |
|---|---|---|---|---|
| AC-1 | `☐` | `☐` | `☐` | `待开始` |
| AC-2 | `☐` | `☐` | `☐` | `待开始` |

## 阻塞项

| 项 | 描述 | 提出角色 | 待谁处理 |
|---|---|---|---|
| `<编号>` | `<阻塞原因>` | `ARCH`/`DEV`/`QA` | `ARCH`/`DEV`/`QA` |

## 待办

| 角色 | 待办 | 关联准则 |
|---|---|---|
| `ARCH` | `<待办>` | `AC-n` |
| `DEV` | `<待办>` | `AC-n` |
| `QA` | `<待办>` | `AC-n` |

## 历史任务

| Task ID | 标题 | 状态 | 交付 | 缺陷 |
|---|---|---|---|---|
| `<TASK-000>` | `<标题>` | `done` | `docs/releases/<id>.md` | `无` |
