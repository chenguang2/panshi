# Design

## Context

工具箱 14 个工具中，Lua 互转与 SM4 加解密已是「两框对等」形态（双向按钮各读一侧）；URL、Base64、YAML↔JSON 互转三个工具是流水线形态（按钮只读左框）。用户评审裁决（2026-11-14）要求统一为两框对等，且按钮文案必须带方向箭头。行为契约见 specs/dev-tools/spec.md（MODIFIED）。

## Goals / Non-Goals

**Goals:**

- 三个工具的转换在两框之间双向可达，任一框都能发起。
- 按钮文案自解释方向，无需尝试即知读哪侧、落到哪侧。
- 帮助文案（toolHelp.ts）与行为同步。

**Non-Goals:**

- Lua、SM4 不动（已是目标形态）；JSON/YAML 格式化保持单向只读（变换类，非互转）；diff 类不动。

## Decisions

**D1 按钮文案模式 = SM4 既有模式**（「加密 →」/「← 解密」：动词贴动作发起侧，箭头指结果去向）：URL/Base64 用「编码 →」/「← 解码」；互转按钮带内容类型，用「转 JSON →」/「← 转 YAML」（读左写右 / 读右写左）。备选「YAML → JSON」/「JSON → YAML」被否：第二个按钮箭头向右但行为是向左写，方向表达错误——正是本次要修的问题。

**D2 互转固定左右角色**：左框=YAML、右框=JSON（panel-label 即角色说明），放弃左框「自动识别」。理由：两框对等模型下角色由框位定义，自动识别反而模糊「从哪边发起」；误贴（JSON 贴左框）时 js-yaml 能解析 JSON（JSON 是 YAML 子集）原样透过到右框，无害。

**D3 右框放开编辑**：互转右框去 readonly（反向发起的前提）；URL/Base64 右框本就可编辑，仅改定位文案（「结果」→「编码串」）与 placeholder（「粘贴编码串进行反向解码」）。

**D4 帮助文案单点同步**：toolHelp.ts 的 url/base64/convert 三条目 how/when/example 改两框对等表述；守卫测试不涉内容语义，无需改。

## Risks / Trade-offs

- [存量使用习惯：老用户习惯「贴左框点解码」] → 「← 解码」后左框没内容会得到空/错误提示，placeholder 引导「原文贴左、编码串贴右」；帮助文档同步。
- [convert 存量测试与 spec 场景按旧标签断言] → 本变更内一并更新（测试 RED 先行），归档时 MODIFIED 合入主 spec。

## Migration Plan

纯前端增量，无迁移。回滚 = 还原 Tools.vue / toolHelp.ts / Tools.test.ts 的 diff。

## Open Questions

（无。）
