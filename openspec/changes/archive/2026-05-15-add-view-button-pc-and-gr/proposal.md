## Why

插件组和全局规则的卡片上缺少查看功能，用户无法直观地查看完整的配置详情。插件元数据卡片已有查看按钮，需要补齐。

## What Changes

- **插件组卡片**: 新增"查看"按钮（EyeOutlined），点击打开抽屉展示名称、描述、状态、版本和完整插件配置 JSON
- **全局规则卡片**: 新增同样的"查看"按钮和抽屉，展示结构同插件组

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `cluster-plugin-groups`: 新增查看详情功能，卡片操作栏增加「查看」按钮
- `cluster-global-rules`: 新增查看详情功能，卡片操作栏增加「查看」按钮

## Impact

- `frontend/src/views/ClusterList.vue`: 两个卡片各加一个按钮 + 两个 Drawer 组件 + 两个 view 函数 + 两个 ref 状态
