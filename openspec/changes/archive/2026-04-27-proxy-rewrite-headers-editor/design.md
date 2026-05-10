# Proxy-Rewrite Headers 瀑布流编辑器 - 设计规范

## UI/UX 设计

### 1. 单字段行内布局（通用）

所有单字段（如 `uri`、`regex_uri`、`host`、`scheme`）采用行内布局：

```
┌─────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ uri                                                          │  │
│  │ 目标 URI - 转发到上游的新 URI，支持 NGINX 变量                   │  │
│  │ ┌───────────────────────────────────────────────────────┐    │  │
│  │ │ /api/v2/users                                         │    │  │
│  │ └───────────────────────────────────────────────────────┘    │  │
│  │ 示例: /api/v2/users                                         │  │
│  │ 💡 支持 $uri、$request_uri 等变量                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**布局说明：**
- **字段名**：`key` 名称，大字体（16px），加粗，颜色 `#333`
- **描述文字**：字段的 `description`，小字体（12px），颜色 `#666`，位于字段名下方的次要行
- **输入框**：全宽输入框，占据一行
- **示例值**：底部小字，带浅蓝背景色（`#e6f7ff`），蓝色文字（`#1890ff`）
- **提示信息**：底部小字，黄色/橙色文字（`#faad14`），带 Info 图标

**样式实现：**
```scss
.field-block {
  margin-bottom: 20px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
}

.field-label {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.field-description {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.field-input {
  margin-bottom: 6px;
}

.field-example {
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  display: inline-block;
}

.field-hints {
  font-size: 12px;
  color: #faad14;
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### 2. Headers 瀑布流布局（特殊）

针对 `proxy-rewrite` 插件的 `headers` 字段（含 `set`/`add`/`remove`），使用瀑布流手风琴布局。

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ uri                                                          │  │
│  │ 目标 URI - 转发到上游的新 URI，支持 NGINX 变量                   │  │
│  │ ┌───────────────────────────────────────────────────────┐    │  │
│  │ │ /api/v2/users                                         │    │  │
│  │ └───────────────────────────────────────────────────────┘    │  │
│  │ 示例: /api/v2/users                                         │  │
│  │ 💡 支持 $uri、$request_uri 等变量                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ headers                                                     │  │
│  │ Header 操作 - 设置、追加、删除请求头                            │  │
│  │                                                              │  │
│  │ ┌─────────────────────────────────────────────────────┐    │  │
│  │ │ ▼ Set  设置 Header                         (2)  [添加] │    │  │
│  │ │   ├─────────────────────────────────────────────┐  │    │  │
│  │ │   │ X-Request-ID    │ abc123456       │ [删除] │  │    │  │
│  │ │   │ Authorization   │ Bearer xxx     │ [删除] │  │    │  │
│  │ │   │                                               │  │    │  │
│  │ │   │ [+ 添加一行]                                 │  │    │  │
│  │ │   └─────────────────────────────────────────────┘  │    │  │
│  │ └─────────────────────────────────────────────────────┘    │  │
│  │                                                              │  │
│  │ ┌─────────────────────────────────────────────────────┐    │  │
│  │ │ ▶ Add   追加 Header                         (0)         │    │  │
│  │ └─────────────────────────────────────────────────────┘    │  │
│  │                                                              │  │
│  │ ┌─────────────────────────────────────────────────────┐    │  │
│  │ │ ▶ Remove 删除 Header                        (1)         │    │  │
│  │ │   ├─────────────────────────────────────────────┐  │    │  │
│  │ │   │ X-Debug                                     │  │    │  │
│  │ │   │                                              │  │    │  │
│  │ │   │ [+ 添加一项]                                 │  │    │  │
│  │ │   └─────────────────────────────────────────────┘  │    │  │
│  │ └─────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 展开/折叠状态

- **展开状态**：显示向下箭头 `DownOutlined`，内容区可见
- **折叠状态**：显示向右箭头 `RightOutlined`，内容区隐藏
- **默认状态**：`Set` 展开，`Add` 和 `Remove` 折叠

### 颜色编码

| Section | 边框颜色 | 图标 | 含义 |
|---------|----------|------|------|
| Set | `#52c41a` (绿色) | CheckCircleOutlined | 设置/覆盖已有 Header |
| Add | `#1890ff` (蓝色) | PlusCircleOutlined | 追加新 Header |
| Remove | `#ff4d4f` (红色) | MinusCircleOutlined | 删除指定 Header |

### 行内布局

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌────────────────────────┐  ┌────────────────────────┐        │
│   │ Header 名称             │  │ 值                     │        │
│   └────────────────────────┘  └────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Key 输入框：`flex: 1`
- Value 输入框：`flex: 2`
- 删除按钮：固定宽度，位于右侧

### Remove Section 特殊样式

Remove 只需要 Key，没有 Value 列：

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌────────────────────────────┐  ┌───────┐                    │
│   │ Header 名称                 │  │ [删除] │                    │
│   └────────────────────────────┘  └───────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 样式定义

```scss
// Accordion 容器
.headers-accordion {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 12px;
}

// Accordion 项
.accordion-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

// Accordion 标题行
.accordion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;

  &:hover {
    background: #f0f0f0;
  }

  // Section 类型边框
  &.set { border-left: 3px solid #52c41a; }
  &.add { border-left: 3px solid #1890ff; }
  &.remove { border-left: 3px solid #ff4d4f; }
}

// Accordion 内容区
.accordion-content {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-top: none;
  border-radius: 0 0 4px 4px;
  padding: 12px;
  margin-top: -1px;
}

// Key-Value 行
.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .key-input { flex: 1; }
  .value-input { flex: 2; }
  .delete-btn { color: #ff4d4f; cursor: pointer; }
}

// Section 标题中的数量徽章
.count-badge {
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #666;
}
```

## 组件状态管理

### 展开状态

```typescript
const expanded = reactive({
  set: true,   // 默认展开
  add: false,   // 默认折叠
  remove: false // 默认折叠
})

const toggleSection = (section: 'set' | 'add' | 'remove') => {
  expanded[section] = !expanded[section]
}
```

### 数据状态

```typescript
const headersData = reactive({
  set: [{ id: 1, key: '', value: '' }],
  add: [{ id: 2, key: '', value: '' }],
  remove: [{ id: 3, key: '' }]
})

const addRow = (section: 'set' | 'add' | 'remove') => {
  const id = Date.now()
  if (section === 'remove') {
    headersData[section].push({ id, key: '' })
  } else {
    headersData[section].push({ id, key: '', value: '' })
  }
}

const removeRow = (section: 'set' | 'add' | 'remove', index: number) => {
  if (headersData[section].length > 0) {
    headersData[section].splice(index, 1)
  }
}
```

## 与 JSON 模式的数据同步

### 表单 → JSON

```typescript
const serializeHeaders = (data: typeof headersData): Record<string, any> => {
  const result: Record<string, any> = {}

  if (data.set.length > 0 && data.set.some(h => h.key)) {
    result.set = {}
    data.set.forEach(h => {
      if (h.key) result.set[h.key] = h.value
    })
  }

  if (data.add.length > 0 && data.add.some(h => h.key)) {
    result.add = {}
    data.add.forEach(h => {
      if (h.key) result.add[h.key] = h.value
    })
  }

  if (data.remove.length > 0 && data.remove.some(h => h.key)) {
    result.remove = data.remove.map(h => h.key).filter(Boolean)
  }

  return result
}
```

### JSON → 表单

```typescript
const deserializeHeaders = (json: Record<string, any>): typeof headersData => {
  let id = 1
  const data = {
    set: [] as Array<{ id: number; key: string; value: string }>,
    add: [] as Array<{ id: number; key: string; value: string }>,
    remove: [] as Array<{ id: number; key: string }>
  }

  if (json.set) {
    Object.entries(json.set).forEach(([key, value]) => {
      data.set.push({ id: id++, key, value: String(value) })
    })
  }

  if (json.add) {
    Object.entries(json.add).forEach(([key, value]) => {
      data.add.push({ id: id++, key, value: String(value) })
    })
  }

  if (json.remove) {
    json.remove.forEach((key: string) => {
      data.remove.push({ id: id++, key })
    })
  }

  // 至少保有一行空行
  if (data.set.length === 0) data.set.push({ id: id++, key: '', value: '' })
  if (data.add.length === 0) data.add.push({ id: id++, key: '', value: '' })
  if (data.remove.length === 0) data.remove.push({ id: id++, key: '' })

  return data
}
```

## 实现检查清单

- [ ] Accordion 组件样式
- [ ] Set/Add/Remove 三个 Section
- [ ] 各 Section 的展开/折叠状态管理
- [ ] Key-Value 行添加/删除功能
- [ ] Remove Section 仅显示 Key 列
- [ ] 数据序列化/反序列化
- [ ] 与 PluginEditorDrawer 的集成
- [ ] 表单/JSON 模式切换时的数据同步