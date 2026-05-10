# Proxy-Rewrite Headers 瀑布流编辑器

## 背景问题

当前 `PluginEditorDrawer` 中的表单字段布局存在以下问题：

1. **headers 字段问题**：包含 `set`、`add`、`remove` 三个操作混在一起，界面杂乱，无法直观看到每个操作有多少条配置

2. **普通字段问题**：字段名、描述、输入框、示例混在一起，层次不清，阅读困难

## 目标

1. **普通字段**：改为行内布局，字段名醒目、描述次要、示例突出显示
2. **headers 字段**：改为瀑布流（手风琴/Accordion）布局，每个操作（Set/Add/Remove）独立展开

## 用户体验设计

### 布局效果

```
┌─────────────────────────────────────────────────────────────┐
│ headers                                                       │
│ Header 操作 - 设置、追加、删除请求头                             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ ▼ [Set] 设置 Header  ────────────────────── (2)  [添加]   │ │
│   └─────────────────────────────────────────────────────┐   │
│   │  X-Request-ID  │  abc123456          │  [删除]  │   │
│   │  Authorization  │  Bearer xxx         │  [删除]  │   │
│   │                                                    │   │
│   │  [+ 添加一行]                                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ▶ [Add] 追加 Header  ────────────────────────── (0)          │ │
│                                                             │
│ ▶ [Remove] 删除 Header  ────────────────────── (1)          │ │
│   └─────────────────────────────────────────────────────┐   │
│   │  X-Debug                                          │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 各 Section 说明

| Section | 含义 | 数据结构 | 布局 |
|---------|------|----------|------|
| **Set** | 设置/覆盖 Header | `{key: string, value: string}[]` | Key + Value + 删除 |
| **Add** | 追加 Header | `{key: string, value: string}[]` | Key + Value + 删除 |
| **Remove** | 删除 Header | `{key: string}[]` | 仅 Key + 删除 |

### 字段行内提示设计

每个主字段（如 `uri`、`regex_uri`）改为行内布局：

```
┌─────────────────────────────────────────────────────────────┐
│ uri                                                           │
│ 目标 URI - 转发到上游的新 URI，支持 NGINX 变量                   │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ /api/v2/users                                          │  │
│ └─────────────────────────────────────────────────────────┘  │
│ 示例: /api/v2/users                                         │
│ 💡 支持 $uri、$request_uri 等变量                             │
└─────────────────────────────────────────────────────────────┘
```

## 技术实现

### 前端组件

1. **修改 `PluginEditorDrawer.vue`**
   - 为 `object` 类型字段（如 `headers`）渲染为手风琴布局
   - 根据 `properties` 中的 `set`/`add`/`remove` 生成对应的 Section

2. **新增手风琴组件 `HeadersAccordion.vue`**（可选独立组件）
   - 接收 `headers` schema 和数据
   - 管理展开/折叠状态
   - 处理 Set/Add/Remove 三个子项的增删改

### 数据结构

```typescript
// 前端内部数据结构
interface HeadersData {
  set: Array<{ id: number; key: string; value: string }>
  add: Array<{ id: number; key: string; value: string }>
  remove: Array<{ id: number; key: string }>
}

// 序列化后保存到后端
interface HeadersSerialized {
  set?: Record<string, string>
  add?: Record<string, string>
  remove?: string[]
}
```

### 序列化逻辑

```typescript
// 表单数据 → 后端 JSON
function serializeHeaders(data: HeadersData): Record<string, any> {
  const result: Record<string, any> = {}

  if (data.set.length > 0) {
    result.set = {}
    data.set.forEach(item => {
      if (item.key) result.set[item.key] = item.value
    })
  }

  if (data.add.length > 0) {
    result.add = {}
    data.add.forEach(item => {
      if (item.key) result.add[item.key] = item.value
    })
  }

  if (data.remove.length > 0) {
    result.remove = data.remove.map(item => item.key).filter(Boolean)
  }

  return result
}

// 后端 JSON → 表单数据
function deserializeHeaders(json: Record<string, any>): HeadersData {
  const data: HeadersData = { set: [], add: [], remove: [] }
  let id = 1

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

  return data
}
```

## 方案选项

### 选项 A：直接在 `PluginEditorDrawer` 中处理（推荐）

- 优点：复用现有组件，改动最小
- 缺点：代码会变复杂

### 选项 B：新增 `HeadersAccordion.vue` 组件

- 优点：职责分离，代码清晰
- 缺点：需要新文件

### 推荐路径

采用 **选项 A + 抽取子组件**，在 `PluginEditorDrawer` 中检测到 `headers` 字段时，使用手风琴布局渲染，其他 object 字段保持现有递归渲染。

## 影响范围

- `frontend/src/components/PluginEditorDrawer.vue` - 修改手风琴布局渲染逻辑
- `backend/app/api/v1/plugins.py` - 已有完整的 schema 定义，无需修改

## 验收标准

### 单字段行内布局
1. ✅ 字段名大字体醒目显示（16px，加粗）
2. ✅ 描述文字次要显示（12px，灰色）
3. ✅ 示例值突出显示（浅蓝背景，蓝色文字）
4. ✅ 提示信息带图标显示（黄色文字）

### Headers 瀑布流布局
5. ✅ Headers 字段渲染为瀑布流布局，Set/Add/Remove 三个 Section 可独立展开折叠
6. ✅ 每个 Section 显示当前配置数量
7. ✅ Set/Add 支持 Key-Value 输入，Remove 仅需 Key
8. ✅ 每个 Section 支持添加、删除操作
9. ✅ 切换到 JSON 模式时，手风琴数据正确序列化为 `headers.set`/`headers.add`/`headers.remove` 结构
10. ✅ 从 JSON 切换回表单模式时，正确反序列化到对应的 Section