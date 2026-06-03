## Why

UI 改造后，`TableCard.vue` 使用 `v-bind="$attrs"` 透传 props 到内部的 `a-table`，但 `$attrs` 不包含 slot 内容。导致通过 `#bodyCell` slot 传入的操作按钮（用户管理的编辑/删除、插件管理的 switch 等）没有被渲染到表格中——按钮「消失」了。

## What Changes

- **修复 TableCard slot 转发**：TableCard 需要使用渲染函数（render function）方式，将 `$slots` 中的 `bodyCell`、`headerCell` 等 slot 转发到内部的 `a-table`
- **修复 vitest 配置**：当前 vitest 将 `a-*` 组件标记为 custom element，导致 template 内的 slot 编译失败。改用 stub 方式处理
- **验证受影响页面**：UserList.vue、PluginSwitches.vue、Dashboard.vue 等使用 TableCard 的页面操作按钮恢复正常

## Capabilities

### New Capabilities
- `tablecard-slot-forwarding`: TableCard 组件 slot 透传能力

### Modified Capabilities
（无 spec 级别的行为变更）

## Impact

- `frontend/src/components/TableCard.vue` — 改为渲染函数实现以支持 slot 转发
- `frontend/vitest.config.ts` — 移除 `isCustomElement` 中的 `a-` 规则，改用 stub
- 所有通过 `#bodyCell` 向 TableCard 传递内容的页面恢复正常
