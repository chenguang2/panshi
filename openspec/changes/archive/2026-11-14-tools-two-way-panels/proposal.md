# Proposal

## Why

工具箱的转换类工具应为「两框对等」模型：左右两框是平等的两端，转换发生在两框之间，内容贴在哪个框就从哪个框发起转换（Lua 互转、SM4 加解密已是此形态）。用户评审裁决（2026-11-14）：URL 编解码、Base64 编解码、YAML↔JSON 互转三个工具当前是「左=开始框、右=结果框」的流水线形态——两个按钮都只读左框，右框贴入的内容没有任何按钮会读（互转工具的右框甚至 readonly），不符合直觉，需要改造。

## What Changes

- **URL 编解码**：按钮改「编码 →」（读左写右）+「← 解码」（读右写左）；右框定位从「结果」改为「编码串」，placeholder 同步。
- **Base64 编解码**：同款「编码 →」+「← 解码」。
- **YAML↔JSON 互转**：固定左右角色（左框 YAML、右框 JSON，两框均可输入），按钮「转 JSON →」读左写右、「← 转 YAML」读右写左，右框去掉 readonly，放弃左框「自动识别」形态。
- 按钮文案一律带方向箭头，与 SM4 既有模式（「加密 →」/「← 解密」）一致——用户明确要求。
- 帮助文案同步：`toolHelp.ts` 中 url/base64/convert 三条目的 how/when/example 改为两框对等表述（单点修改）。
- 不做：Lua、SM4 已符合不动；JSON/YAML 格式化保持左→右单向（格式化是变换不是互转，用户未选放开）；diff 类本就 A/B 对等不动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dev-tools`: MODIFIED 三个需求——「URL 编解码」「Base64 编解码」「YAML 与 JSON 互转工具」的按钮方向语义、双框对等布局与场景改为反向路径可验证。

## Impact

- 前端：`frontend/src/views/Tools.vue`（三工具的按钮/panel-label/placeholder）、`frontend/src/config/toolHelp.ts`（三条目文案）。
- 测试：`frontend/src/views/__tests__/Tools.test.ts` 中 url/base64/convert 用例改为新标签与反向路径（TDD 先红）。
- Spec：`openspec/specs/dev-tools/spec.md` 三需求 MODIFIED（归档时合入）。
- 零后端、零新依赖。
