## Context

当前集群管理页面（路由、上游、节点）列表 API 直接返回所有数据，没有分页、排序和查询功能。当数据量增长时，会导致：
- 前端加载缓慢
- 网络传输量大
- 用户难以快速定位目标数据

需要改造前后端列表 API，支持分页、排序和查询功能。

## Goals / Non-Goals

**Goals:**
- 列表 API 支持分页（page, page_size 参数）
- 列表 API 支持排序（sort_by, sort_order 参数）
- 列表 API 支持查询（search, search_field 参数）
- 前端表格支持分页器（10/20/50/100 默认20）
- 前端表格支持点击列标题排序
- 前端表格支持按列查询和全局模糊搜索

**Non-Goals:**
- 不支持多字段组合排序
- 不支持高级查询表达式
- 不修改路由、上游、节点的创建/更新/删除 API

## Decisions

### 1. API 参数设计

**分页参数：**
- `page`: int, 默认 1
- `page_size`: int, 可选 10/20/50/100, 默认 20

**排序参数：**
- `sort_by`: str, 可选字段名（name, uri, priority, status, created_at 等）
- `sort_order`: str, 可选 asc/desc, 默认 asc

**查询参数：**
- `search`: str, 模糊搜索关键字
- `search_field`: str, 按特定列查询（可选，不传则全局搜索）

### 2. 返回结构

```json
{
  "total": 100,       // 总记录数
  "page": 1,          // 当前页
  "page_size": 20,    // 每页条数
  "items": [...]      // 数据列表
}
```

### 3. 前端实现

使用 Ant Design Vue 的 Table 组件自带分页、排序功能：
- `pagination` 属性配置分页
- `sorter` 配置排序
- 搜索框使用 `a-input-search` 组件

### 4. 后端实现

使用 SQLAlchemy 动态构建查询：
- `limit()` 和 `offset()` 实现分页
- `order_by()` 实现排序
- `ilike()` 或 `like()` 实现模糊查询

## Risks / Trade-offs

- [风险] 模糊查询性能：全局模糊搜索 `ILIKE %keyword%` 在大表上可能慢 → 考虑添加数据库索引或限制查询字段
- [风险] SQL 注入：动态列名需要白名单校验 → 使用预定义允许字段列表验证 sort_by 和 search_field
- [权衡] 前端分页 vs 后端分页：选择后端分页，支持大数据量和跨页排序
