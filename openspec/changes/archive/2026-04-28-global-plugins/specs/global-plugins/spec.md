# Global Plugins Spec

## Overview

全局插件管理功能允许用户在集群级别配置插件，这些插件将作用于该集群的所有路由。

## UI/UX

### Tab 页结构

```
[集群节点] [全局插件] [上游] [路由]
```

### 全局插件 Tab 内容

1. **工具栏**
   - 添加插件按钮
   - 发布选中插件按钮
   - 版本管理按钮
   - 列配置下拉框
   - 搜索框

2. **插件列表**
   - 表格展示：名称、描述、配置状态、操作
   - 支持多选（checkbox）
   - 支持排序

3. **添加/编辑模态框**
   - 插件选择下拉框（显示插件名称和描述）
   - Form/JSON 模式切换
   - Form 模式：根据插件 schema 动态生成表单
   - JSON 模式：JSON 编辑器
   - 确定/取消按钮

### 列配置

```
列选择：☐ 名称 ☐ 描述 ☐ 配置状态 ☐ 操作
操作按钮：☐ 发布 ☐ 版本管理 ☐ 删除
搜索：☑ 显示搜索框
```

## Functionality

### 添加插件

1. 点击"添加插件"按钮
2. 弹出模态框，显示插件选择下拉框
3. 选择插件后，根据插件 schema 显示配置表单
4. 用户填写配置，可切换 Form/JSON 模式
5. 点击确定，调用后端 API 创建
6. 成功后关闭模态框，刷新列表

### 编辑插件

1. 点击插件行的"编辑"按钮
2. 弹出预填充的模态框
3. 修改配置，点击确定

### 删除插件

1. 选中插件，点击"删除"按钮
2. 确认对话框
3. 调用后端 API 删除

### 发布插件

1. 选中插件，点击"发布"按钮
2. 调用后端 API 同步到 APISIX
3. 显示成功/失败提示

### 版本管理

1. 选中插件，点击"版本管理"按钮
2. 弹出版本历史列表
3. 可选择版本进行回滚

## Data Structures

### GlobalPlugin

```typescript
interface GlobalPlugin {
  name: string
  description?: string
  config: Record<string, any>
  version?: number
  published?: boolean
  created_at?: string
  updated_at?: string
}
```

### PluginConfig

```typescript
interface PluginConfig {
  name: string
  description: string
  schema: Record<string, any>
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /clusters/{cluster_id}/plugins | 获取全局插件列表 |
| POST | /clusters/{cluster_id}/plugins | 创建全局插件 |
| PUT | /clusters/{cluster_id}/plugins/{plugin_name} | 更新全局插件 |
| DELETE | /clusters/{cluster_id}/plugins/{plugin_name} | 删除全局插件 |
| POST | /clusters/{cluster_id}/plugins/{plugin_name}/publish | 发布插件 |
| GET | /clusters/{cluster_id}/plugins/{plugin_name}/versions | 获取版本历史 |
| POST | /clusters/{cluster_id}/plugins/{plugin_name}/rollback | 回滚到指定版本 |

## Dependencies

- 后端实现集群插件 API
- PluginSelector 组件复用
- 版本管理模态框组件复用（VersionManagementModal）
