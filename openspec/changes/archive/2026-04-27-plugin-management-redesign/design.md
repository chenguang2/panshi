# 路由插件管理重构设计方案

## 目标

改进磐石 Admin 的路由插件管理界面：
1. **插件选择**：分类树 + 网格卡片布局
2. **插件配置**：通用 Schema 驱动的抽屉编辑器，支持表单/JSON 双模式

## UI 设计

### 整体布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔍 搜索插件...                                                              │
├──────────────────────────┬──────────────────────────────────────────────┤
│  ▼ 限流                    │  已选插件 (2)                                       │
│    ┌────────┐ ┌────────┐│  ┌────────────────────────────────────────┐ │
│    │limit-req│ │limit-  ││  │ proxy-rewrite              [编辑] [删除] │ │
│    │         │ │count   ││  └────────────────────────────────────────┘ │
│    └────────┘ └────────┘│  ┌────────────────────────────────────────┐ │
│    ┌────────┐            │  │ cors                      [编辑] [删除] │ │
│    │limit-  │            │  └────────────────────────────────────────┘ │
│    │conn    │            │                                                      │
│    └────────┘            │                                                      │
│  ▼ 认证                    │                                                      │
│    ┌────────┐ ┌────────┐│                                                      │
│    │key-auth│ │jwt-auth││                                                      │
│    └────────┘ └────────┘│                                                      │
└──────────────────────────┴──────────────────────────────────────────────┘
```

### 分类结构

| 分类 | 标签 | 插件 |
|------|------|------|
| 限流 | 限流 | `limit-req`, `limit-conn`, `limit-count` |
| 认证 | 认证 | `key-auth`, `jwt-auth`, `basic-auth` |
| 转换 | 转换 | `proxy-rewrite`, `cors`, `response-rewrite` |

### 交互设计

| 交互 | 行为 |
|------|------|
| **点击分类标题** | 展开/收起该分类下的插件网格 |
| **点击插件卡片** | 添加到右侧已选列表 |
| **点击已选插件[编辑]** | 打开配置抽屉 |
| **点击已选插件[删除]** | 从已选列表移除 |

## 组件设计

### 1. PluginSelector.vue（主组件）

**功能**：
- 分类树 + 网格卡片布局
- 两栏结构：左侧可选插件，右侧已选插件
- 搜索过滤
- 分类展开/收起控制

**Props**：
```typescript
interface Props {
  modelValue: RoutePlugin[]      // 已选插件列表
  plugins: Plugin[]              // 所有可用插件
}
```

**Events**：
```typescript
emit('update:modelValue', plugins: RoutePlugin[])
emit('edit', plugin: RoutePlugin, index: number)  // 编辑插件
```

### 2. PluginEditorDrawer.vue（配置抽屉）

**功能**：
- Schema 驱动的动态表单渲染
- 表单/JSON 双模式切换
- 支持嵌套对象（如 headers.set/add/remove）

**Props**：
```typescript
interface Props {
  open: boolean
  plugin: RoutePlugin | null
  pluginInfo: Plugin | null  // 包含完整 schema
}
```

**Events**：
```typescript
emit('update:open', val: boolean)
emit('save', config: string)  // JSON 格式的配置
```

### 3. Schema 驱动的动态表单

根据后端提供的 Schema 动态渲染表单控件：

| Schema Type | 表单控件 |
|------------|---------|
| `string` | `<a-input>` |
| `number` | `<a-input-number>` |
| `boolean` | `<a-switch>` |
| `array` | `<a-textarea>` (逗号分隔) |
| `object` | 递归渲染子字段 |

## 文件变更

| 文件 | 变更内容 |
|------|---------|
| `PluginSelector.vue` | 重写为分类树 + 网格卡片布局 |
| `PluginEditorDrawer.vue` | Schema 驱动动态表单，移除硬编码 |
| `ClusterList.vue` | 调整插件管理 Tab 使用新组件 |

## 测试要点

1. 分类展开/收起正常
2. 插件搜索过滤正常
3. 插件选择/移除正常
4. 插件编辑抽屉正常打开
5. 表单模式配置保存正常
6. JSON 模式配置保存正常
7. 表单/JSON 切换同步正常
8. 不同类型插件配置都能正确保存

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 插件 Schema 不完整 | 提供 fallback 到 JSON 模式 |
| 动态表单性能问题 | 使用 `v-memo` 优化渲染 |
| 复杂嵌套对象表单 | 递归组件处理 |
