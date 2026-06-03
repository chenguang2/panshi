## Context

TableCard 当前使用纯 template 方式渲染 `<a-table v-bind="$attrs" />`。Vue 3 中 `$attrs` 只包含 attributes/props，不包含 slots。这意味着通过 `#bodyCell` 等具名 slot 传入的内容永远不会被渲染到实际的 a-table 中。

此外，`frontend/vitest.config.ts` 中设置了 `isCustomElement: (tag) => tag.startsWith('a-')`，这导致 Vue 编译器将 `<a-table>` 视为自定义 Web Component，其内部的 `<template #slotName>` 语法在编译时抛出 "Codegen node is missing" 错误。

## Goals / Non-Goals

**Goals:**
- TableCard 正确转发所有 slots 到内部的 `a-table`
- 修复 vitest 配置使其不再将 Ant Design 组件视为 custom element
- UserList、PluginSwitches、Dashboard 等页面操作按钮恢复正常

**Non-Goals:**
- 不改动任何业务逻辑
- 不改动其他组件的行为

## Decisions

### Decision 1：使用渲染函数（render function）代替 template

**选择**：TableCard.vue 改用 `h()` 渲染函数实现，手动将 `$slots` 中除 `header`/`footer` 外的所有 slot 传递给 `a-table`。

```ts
// 核心逻辑
const tableSlots: Record<string, any> = {}
for (const name of Object.keys(slots)) {
  if (name !== 'header' && name !== 'footer') {
    tableSlots[name] = slots[name]
  }
}
return h('div', { class: 'table-card' }, [
  headerSlot,
  h(ATable, attrs, tableSlots),
  footerSlot,
])
```

**理由**：template 方式无法转发 slots（`v-bind="$attrs"` 仅转发 props），且 `<a-table>` 内使用 `<template #slotName>` 在当前 vitest 配置下会编译错误。渲染函数绕过模板编译器，直接生成 VNode。

### Decision 2：修复 vitest 配置

**选择**：从 `vitest.config.ts` 的 `isCustomElement` 中移除 `a-` 前缀检查。

**理由**：Ant Design Vue 组件（a-table、a-modal 等）是标准的 Vue 组件，不应被标记为 custom element。在测试中，未注册的 Ant Design 组件通过 `global.stubs` 机制 stub。

## Risks

- 渲染函数方式的可维护性略低于 template → 封装在单一组件中，影响范围可控
- 移除 `isCustomElement` 可能导致已有测试需要补加 stubs → 运行全部测试确认，必要时补加
