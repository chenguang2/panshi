## Why

边缘节点调试页面（EdgeClient.vue）的插件组编辑表单中，Labels (JSON) 和 Hosts (JSON) 是 PANSHI 原生字段，但在当前业务流程中不使用，造成界面冗余和用户困惑。

## What Changes

- 移除 `EdgeClient.vue` 插件组编辑表单中的 `Labels (JSON)` 和 `Hosts (JSON)` 两个表单项
- 移除对应的表单字段、加载逻辑、提交逻辑

## Capabilities

### New Capabilities
- （无）

### Modified Capabilities
- （无，纯 UI 清理）

## Impact

| 层 | 影响 |
|---|---|
| 前端 | `EdgeClient.vue` 移除 labels/hosts 相关代码约 16 行 |
