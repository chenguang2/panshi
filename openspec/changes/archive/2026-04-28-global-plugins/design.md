## Context

PANSHI Admin API 支持在集群级别设置插件的 metadata。当前系统的路由管理已有完整的插件管理 UI（PluginSelector 组件支持 Form/JSON 双模式），但缺少集群级别的全局插件 metadata 管理。

全局插件 metadata 与路由插件的区别：
- 路由插件：绑定到特定路由，配置路由级别的插件参数
- 全局插件 metadata：集群全局的插件默认配置，所有路由共享

## Goals / Non-Goals

**Goals:**
- 在集群卡片中新增"全局插件" Tab 页
- 支持添加/编辑/删除全局插件 metadata
- 支持 Form 和 JSON 两种编辑模式切换
- 支持单个插件发布到 PANSHI
- 支持全局插件版本管理（查看历史、回滚到指定版本）
- 支持搜索功能

**Non-Goals:**
- 不修改现有路由插件管理功能
- 不修改 PANSHI 插件 schema（使用后端定义的 BUILTIN_PLUGINS）
- 不支持批量发布（太危险），插件只能一个一个发布

## Decisions

### 1. UI 布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  集群节点    全局插件    上游    路由                                  │
├─────────────────────────────────────────────────────────────────────┤
│  🔍 搜索插件 ________________________________                        │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐  ┌─────────────────────────────────────────┐   │
│ │ ▼ 限流类          │  │  [limit-req]                              │   │
│ │   [+添加] limit-req│  │    rate: 100                              │   │
│ │   [+添加] limit-count│ │    状态: ✓ 已发布                          │   │
│ │                   │  │    [查看] [编辑] [删除] [发布] [版本]       │   │
│ │ ▼ 认证类          │  │                                          │   │
│ │   [+添加] jwt-auth│  │  [cors]                                   │   │
│ │                   │  │    allow_origins: *                       │   │
│ │ ▼ 缓存类          │  │    状态: ✗ 未发布                         │   │
│ │                   │  │    [查看] [编辑] [删除] [发布] [版本]      │   │
│ └───────────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**说明：**
- Tab 顺序：集群节点 → 全局插件 → 上游 → 路由
- 搜索框在顶部，用于搜索/过滤左侧插件列表
- 左侧只显示 `enable_metadata=True` 的插件（后端已过滤）
- 右侧显示已配置插件列表，带操作按钮

### 2. 左侧插件列表

- 搜索框在顶部，用于过滤插件
- 分类展示插件（限流、认证、缓存等）
- 每行显示 `[+添加]` 按钮
- 已添加的插件不显示在左侧

### 3. 右侧已配置插件

```
│  [limit-req]                              │
│    rate: 100                              │
│    状态: ✓ 已发布                          │
│    [查看] [编辑] [删除] [发布] [版本]      │
```

**按钮分组：**
- 基本操作组：`[查看] [编辑] [删除]`
- 同步管理组：`[发布] [版本]`

### 4. 查看抽屉（只读）

- Form 模式：显示只读表单
- JSON 模式：显示只读 JSON
- 只有"关闭"按钮

### 5. 编辑抽屉

```
┌─────────────────────────────────────────────────────────────────┐
│  编辑 limit-req Metadata                                  [X]   │
├─────────────────────────────────────────────────────────────────┤
│  [Form] [JSON]                                                  │
│  ┌─ Form 模式 ──────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  rate:    [100________________]  (请求速率)                │   │
│  │  burst:   [50___________________]  (突发容量)               │   │
│  │  key:     [remote_addr__________]  (限流依据)             │   │
│  │                                                             │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                    [取消]  [💾 保存]            │
└─────────────────────────────────────────────────────────────────┘
```

**只有保存和取消按钮，没有发布按钮**

### 6. 删除功能

点击"删除"后弹出确认框：
```
┌─────────────────────────────────────────┐
│  ⚠️ 确认删除                               │
├─────────────────────────────────────────┤
│                                          │
│  删除会将插件状态实时重置为默认状态。        │
│  确定要删除 limit-req 的配置吗？          │
│                                          │
│                        [取消]  [确定删除] │
└─────────────────────────────────────────┘
```

**删除后执行：**
1. 数据库：`metadata = {}`，`version` 设为该版本的版本号（不是递增）
2. 调用 PANSHI 将该插件的 metadata 重置为 `{}`
3. 该插件从右侧消失，回到左侧可选列表

### 7. 版本管理（完全复制路由版本管理）

复用现有的 `VersionManagementModal.vue` 组件，只需新增 `resource-type="plugin_metadata"` 类型支持。

**功能：**
- 左侧版本列表，点击选择
- 右侧显示版本详情（JSON 格式）
- 对比模式：选择两个版本对比差异
- 回滚：切换到选中的版本

**回滚逻辑（重要）：**
```
当前版本: v5
选择回滚到: v3
→ version 变为 3（不是 6）
→ metadata 恢复为 v3 的值
→ is_published = false
```

### 8. API 设计

| Method | Endpoint | 功能 |
|--------|----------|------|
| GET | `/clusters/{id}/plugin-metadata` | 获取所有已配置的插件 |
| POST | `/clusters/{id}/plugin-metadata` | 添加插件（初始 metadata={}） |
| PUT | `/clusters/{id}/plugin-metadata/{plugin_name}` | 更新插件 metadata |
| DELETE | `/clusters/{id}/plugin-metadata/{plugin_name}` | 重置插件为默认 |
| POST | `/clusters/{id}/plugin-metadata/{plugin_name}/publish` | 发布到 PANSHI |
| GET | `/clusters/{id}/plugin-metadata/{plugin_name}/versions` | 获取版本历史 |
| POST | `/clusters/{id}/plugin-metadata/{plugin_name}/rollback/{version}` | 回滚到指定版本 |

### 9. 数据结构

#### 9.1 BUILTIN_PLUGINS 增加标识

```python
BUILTIN_PLUGINS = [
    {
        "name": "limit-req",
        "description": "请求速率限制",
        "category": "限流",
        "enable_metadata": True,   # 可配置 metadata
        "schema": {...}
    },
    {
        "name": "proxy-cache",
        "description": "代理缓存",
        "category": "缓存",
        "enable_metadata": False,  # 不可配置 metadata
        "schema": {...}
    },
    ...
]
```

#### 9.2 数据库表设计

**cluster_plugin_metadata（插件 metadata 配置）**
```sql
CREATE TABLE cluster_plugin_metadata (
    id              SERIAL PRIMARY KEY,
    cluster_id      INTEGER REFERENCES clusters(id),
    plugin_name     VARCHAR(64) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    version         INTEGER NOT NULL,
    is_published    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(cluster_id, plugin_name)
);
```

**plugin_metadata_versions（版本历史）**
```sql
CREATE TABLE plugin_metadata_versions (
    id              SERIAL PRIMARY KEY,
    cluster_plugin_metadata_id  INTEGER REFERENCES cluster_plugin_metadata(id),
    metadata        JSONB NOT NULL,
    version         INTEGER NOT NULL,
    action          VARCHAR(32) NOT NULL,  -- 'create', 'update', 'reset'
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 10. 数据流

```
添加插件
────────────────────────────────────────
左侧点击 [+添加] limit-req
→ POST /clusters/{id}/plugin-metadata
  { plugin_name: "limit-req" }
→ 返回初始 metadata={}, version=1
→ 右侧出现该插件，状态"未发布"


编辑插件
────────────────────────────────────────
点击"编辑" → 弹出抽屉
→ 修改表单 → 点击"保存"
→ PUT /clusters/{id}/plugin-metadata/limit-req
  { metadata: {rate: 200, burst: 100} }
→ 数据库更新，version 变为新值，is_published=false


发布插件
────────────────────────────────────────
点击"发布"
→ POST /clusters/{id}/plugin-metadata/limit-req/publish
→ PANSHI 同步该插件 metadata
→ is_published=true
→ 状态变为"已发布"


删除（重置）插件
────────────────────────────────────────
点击"删除" → 确认弹窗
→ 确定后：
  1. DELETE /clusters/{id}/plugin-metadata/limit-req
     → 数据库 metadata={}, version=该版本号, is_published=false
     → 插入版本记录 action='reset'
  2. 调用 PANSHI 重置该插件 metadata
  3. 该插件从右侧消失，回到左侧


版本管理
────────────────────────────────────────
点击"版本"
→ GET /clusters/{id}/plugin-metadata/limit-req/versions
→ 显示版本历史（与路由版本管理相同）

回滚到 v2：
→ POST /clusters/{id}/plugin-metadata/limit-req/rollback/2
→ 数据库 version=2, metadata=旧值, is_published=false
→ 调用 PANSHI 同步
```

## Risks / Trade-offs

- 后端 API 需要新增 `/clusters/{id}/plugin-metadata` 系列接口
- 全局插件与路由插件的优先级关系需要 PANSHI 层面保证
- 删除操作会实时重置 PANSHI 集群配置，需谨慎操作

## Open Questions

1. 后端是否已有 plugin-metadata 相关接口？
2. PANSHI 的全局插件 metadata API 是什么？
