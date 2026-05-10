## Why

当前集群管理页面（路由、上游、节点等）没有分页功能，所有数据一次性加载，在数据量大时会导致页面加载缓慢、用户体验差。同时缺乏排序和查询功能，用户难以快速找到目标数据。需要添加分页、排序和查询功能来提升用户体验和操作效率。

## What Changes

- **集群管理列表分页**：路由列表、上游列表、节点列表添加分页控件，支持选择每页显示条数
- **排序功能**：点击列表表头可按该列升序/降序排列
- **查询功能**：支持按特定列查询和全局模糊搜索
- **后端 API 改造**：列表 API 支持分页、排序、查询参数
- **单元测试**：后端 API 测试覆盖分页、排序、查询场景
- **E2E 测试**：Playwright 测试覆盖分页、排序、查询功能

## Capabilities

### New Capabilities
- `table-pagination`: 表格分页能力，支持选择每页条数（10/20/50/100），默认20条
- `table-sorting`: 表格排序能力，点击列标题切换升序/降序
- `table-search`: 表格查询能力，支持按列精确查询和全局模糊搜索

### Modified Capabilities
- `route-list-selection`: 路由列表现有 spec 需要扩展，添加分页、排序、查询参数
- `route-actions-config`: 路由操作配置不受影响
- `route-column-config`: 路由列配置不受影响

## Impact

- **后端 API**：`/api/v1/clusters/{id}/routes`、`/api/v1/clusters/{id}/upstreams`、`/api/v1/clusters/{id}/nodes` 需要支持 `page`、`page_size`、`sort_by`、`sort_order`、`search`、`search_field` 参数
- **前端组件**：ClusterList.vue 需要改造表格组件，添加分页器、排序图标、搜索框
- **测试**：`backend/tests/test_route_api.py` 需要添加分页排序查询测试用例
- **E2E**：`frontend/e2e/route.spec.ts` 需要添加分页、排序、查询测试用例
