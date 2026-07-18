## Why

当前上游管理高级配置中的健康检查项仅提供 ON/OFF 开关和一个预设 JSON 文本域（`{"passive": {}, "active": {"unhealthy": {}}}`）。用户不知道 JSON 中每个字段的含义，也无法直观地修改阈值、间隔、路径等常用参数，导致健康检查功能使用门槛高、配置困难。

## What Changes

- **新增 `health-check-form-ui` 能力**：将健康检查的 JSON 文本域替换为结构化表单，包含模式选择（仅主动/仅被动/主动+被动）和常用参数输入控件
- **保留 JSON 编辑入口**：在表单下方提供"编辑原始 JSON"按钮，点击弹出 JSON 编辑弹窗，支持双向同步（表单 ↔ JSON）
- **修改 `upstream-advanced-config` 现有能力**：健康检查区域从纯 JSON textarea 改造为表单控件
- **修改 `upstream-health-check-default` 现有能力**：默认值从 `{"passive": {}, "active": {"unhealthy": {}}}` 改为"仅主动检查"模式的完整默认值
- **后端增加 `HealthCheckConfig` Pydantic schema**：校验 checks JSON 结构的合法性（可选）

## Capabilities

### New Capabilities
- `health-check-form-ui`: 上游健康检查表单化配置界面，包括模式选择、主动/被动参数表单、JSON 双向同步编辑器

### Modified Capabilities
- `upstream-advanced-config`: 健康检查区域从 JSON textarea 改造为表单控件，保持独立 toggle 控制模式
- `upstream-health-check-default`: 默认值从最小 JSON 改为完整默认配置，并随模式选择动态变化

## Impact

- **前端文件**：`ClusterUpstreams.vue`（表单替换 textarea）、`useClusterUpstreams.ts`（表单状态管理）、`types/index.ts`（新增类型定义）
- **后端文件**：`schemas/cluster.py`（可选新增 HealthCheckConfig Pydantic model）
- **测试**：`UpstreamFormModal.test.ts` 需更新
- **不涉及**：API 路由、数据模型、数据库迁移（checks 字段仍是 JSON 字符串，结构不变）
