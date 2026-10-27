# ADR-0001 三角色对 push 与本机发布的权限管控

- 状态：accepted
- 日期：2026-10-26

## 1. 上下文

omp-trio-scaffold 让三个 agent（arch / dev / qa）共享同一 git 工作树。
现有门禁（`.omp/hooks/pre/trio-guard.ts` + `templates/pre-commit`，真值源
`.omp/trio/policy.txt`）只管辖**文件写入白名单**，对以下动作零约束：

- `git push`、`git tag` —— 对外不可逆的远端动作
- version bump（`pyproject.toml` / `setup.cfg` / `setup.py`）—— 现属公共维护区 `allow *`，三方可写
- 真实发布命令（`npm publish` / `twine` / `cargo publish` 等）—— 无任何拦截
- CHANGELOG 截版 —— 现属公共维护区 `allow *`

风险场景：QA 判未通过 → dev 忙修复 → 任意另一角色顺手 push / 改版本号。
三个 agent 并行行驶于同一工作树时，这类事故可以机械地发生。

## 2. 候选方案

1. **不限制，靠 rules.md 纪律文本** —— 优点：零机制成本。缺点：门禁体系
   （QA 报告机械校验）已证明纪律文本挡不住并行 agent 的误操作；agent 忘记
   或无视即失效。
2. **收归用户，三角色全部禁发** —— 优点：最安全，与 HITL 自洽。缺点：
   每次发版都要求人工在场，摩擦大；版本号实现在 dev 手里，dev 却不能发，
   角色与能力错位。
3. **qa 签发 + dev 执行的两阶段** —— 优点：职责对称。缺点：需要两个钩子
   协作，复杂度最高。
4. **仅 dev 可发布，机械拦截其余角色** —— 优点：实现者持有发布链，与
   「dev 写 `pyproject.toml`」的现实一致；只加一个 pre-push hook。缺点：
   dev 可能在 `user_signed` 前抢跑，需要放行前置条件兜底。

## 3. 决策

选定 **方案 4**，并把决策对象定义为**发布链全链**：

> 发布权 = `git push` + `git tag` + version bump + CHANGELOG 截版 + 真实
> 发布命令。全链统一归 **dev**；qa / arch 禁发；未设置 `TRIO_ROLE` 的人工
> 会话放行（与现有 pre-commit 的逃生舱语义一致）。

执行机制两层：

1. **git pre-push hook**（`templates/pre-push`，`bin/init-agent.sh` 部署）：
   - `TRIO_ROLE ∈ {qa, arch}` → 拒绝 push（fail-closed）
   - `TRIO_ROLE=dev` → 校验放行前置：同分支 QA 报告全绿（`qa-*-report-*.md`
     存在且 `bin/trio-check-report.mjs` 通过）且看板状态为 `qa_passed`
     （`user_signed` 不由 hook 强制，由 rules.md 纪律约束 —— hook 无法机械
     判定「用户签字」，不能假装能判定）
   - 无 `TRIO_ROLE` → 放行（人工提交合法）
2. **policy.txt 白名单收窄**：`pyproject.toml`、`CHANGELOG.md` 从公共
   维护区移入 dev 独占 —— bump / 截版是文件写入动作，pre-push 管不到，
   必须在文件层堵住 qa / arch 的口子。

### 3.1 三角色视角的发布权矩阵

| 动作 | arch | dev | qa | 无 `TRIO_ROLE`（人工） | 执行层 |
|---|---|---|---|---|---|
| `git push` / `git tag` | ❌ pre-push 拒绝 | ✅（前置达标） | ❌ pre-push 拒绝 | ✅ | pre-push hook |
| version bump（`pyproject.toml` / `setup.cfg` / `setup.py`） | ❌ 文件门禁拒绝 | ✅ 独占 | ❌ 文件门禁拒绝 | ✅ | policy.txt（pre-commit + trio-guard） |
| CHANGELOG 截版 | ❌ 文件门禁拒绝 | ✅ 独占 | ❌ 文件门禁拒绝 | ✅ | policy.txt |
| 真实发布命令（`npm publish` / `twine` 等） | 纪律禁令 | ✅ 纪律放行 | 纪律禁令 | ✅ | rules.md（无法 hook，属命令层） |
| QA 报告「未通过」 | — | ⛔ 被前置 a 拦截 | 裁定权 | — | 报告校验器（经 pre-push） |

三角色对发布的意义，各在一环：

- **qa 的否决前置**：dev 想发布，必须先有 qa 产出的全绿报告——qa 的
  「未通过 / 半通过」结论直接把 dev 的 push 机械堵死（AC-5/AC-9 已验证）。
  qa 不需要任何发布权限，报告本身就是它的否决权。
- **arch 的契约前置**：报告全绿的前提是报告覆盖了 arch 契约的每条 AC；
  契约缺失或矛盾时流程本就该停在 `blocked`/`waiting_user`，到不了发布。
  arch 对发布的约束是间接的（通过契约），同样不需要发布权限。
- **dev 的执行权**：实现、bump、截版、push 都在 dev 手里，但仍堕入
  「QA 全绿 + 看板 `qa_passed`」的机械双闸，以及 `user_signed` 的纪律闸。
  dev 是唯一握有发布动作的角色，也是被三重下位约束（qa 报告 / 看板 /
  用户签字）层层嵌套的角色——权限集中与流程制衡并存。
- **用户（无角色）**：发布权的最终落点与逃生舱。任何角色会话内的发布
  争议、qa_passed → user_signed 之间的抢跑问题，都由用户签字终结；
  用户 `unset TRIO_ROLE` 后的人工推送不受 hook 管辖，是全链的兜底。

## 4. 被否决方案及否决理由

- 方案 1：纪律文本对并行 agent 无约束力，与「机械拦截优于自觉」的既有
  门禁哲学（pre-commit 强制报告校验）相矛盾。
- 方案 2：把发布收归人工会让 dev 的日常交付半途而废；且版本号实现在
  dev 白名单内，禁发 dev 等于让他造而不能出厂。
- 方案 3：qa 签发需要 qa 写一个额外签发产物，且 qa / dev 两 hook 协作的
  复杂度不比现状的 probem 少 —— 3 轮熔断机制已经给了 qa 否决权，qa 的
  「未通过」报告本身就是签发的反面。

## 5. 后果

- 正面：push / tag / bump / publish / 截版五类动作全部有了机械边界；
  与 pre-commit 同构（同一角色身份变量、同一逃生舱），认知成本接近零。
- 负面：dev 提前发布（`user_signed` 前）仍属纪律约束而非机械约束。
  缓解：pre-push 强制「QA 全绿 + 看板 `qa_passed`」，把抢跑窗口压缩到
  qa_passed → user_signed 之间；该窗口内发布需用户在看板签字前同意。
- 推翻条件：出现第三个需要放行的角色；或发布动作改由 CI 承担（此时
  pre-push 校验对象应换成 CI 触发权，本 ADR 应置于 `superseded`）。
