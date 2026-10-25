# <主题> · 验收报告

<!--
填写人：QA。
落位：docs/task/<YYYY-MM-DD-事项>/qa-<YYYYMMDD>-<HHMM>-report-<主题>.md
校验：bun bin/trio-check-report.mjs <该文件>   —— 提交时 pre-commit 会强制跑，
      不合规直接拒绝提交。占位符 <...> 必须全部替换。

四条硬规则（校验器 T1–T9 会拦）：
  1. 结论只能四值：通过 / 半通过 / 未通过 / SKIP。"复测通过"请记「通过」并在说明写「第 N 轮复测」。
  2. 位置列：结论为「通过」填 —；其余必填（文件:行 或 函数）。
  3. 未通过/半通过 的说明必须含 期望 / 实际 / 复现；SKIP 必含 跳过原因 / 解除条件。
  4. 汇总的总判定由逐行结论机械推导（有未通过→未通过；否则有半通过→半通过；否则通过），
     且 SKIP 必须单列计账，不得计入通过。
-->

> 运行环境：<env 名> <x.y.z>
> 基线 commit：<hash>
> 运行时间：<YYYY-MM-DD HH:MM>

| 用例 | 位置 | 结论 | 说明 |
|---|---|---|---|
| AC-1 | — | 通过 | — |
| AC-2 | src/a.py:42 | 半通过 | 期望 200；实际 500；复现 pytest tests/test_a.py::test_ok |
| AC-3 | src/b.py:88 | 未通过 | 期望 404；实际 500；复现 pytest tests/test_b.py::test_missing |
| AC-4 | tests/test_c.py | SKIP | 跳过原因 依赖外部服务；解除条件 提供 mock server |

## 汇总

总判定：未通过。覆盖度：对照契约 <N> 条，共 4 条，通过 1、半通过 1、未通过 1、SKIP 1（SKIP 不计 PASS，单列计账）。
