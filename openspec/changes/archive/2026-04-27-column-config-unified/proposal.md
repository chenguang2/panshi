## Why

当前系统中：
1. 只有路由表格有列配置功能，节点和上游表格没有
2. 搜索功能是硬编码的，没有纳入列配置管理
3. 搜索框尺寸偏大，美观度不足

## What Changes

1. **列配置功能统一**：为节点表格和上游表格添加列配置功能，与路由表格保持一致
2. **搜索配置化**：将搜索功能纳入列配置管理，默认开启，可配置显示/隐藏
3. **搜索框美化**：缩小搜索框尺寸，优化布局

## Capabilities

### New Capabilities

- `upstream-column-config`: 上游表格列配置
- `node-column-config`: 节点表格列配置
- `search-column-config`: 搜索配置（可配置搜索框显示/隐藏）

### Modified Capabilities

- `route-column-config`: 扩展路由列配置，增加搜索配置项

## Impact

- **前端**：`ClusterList.vue` 修改，添加上游和节点的列配置逻辑，修改搜索框样式
- **后端**：无影响
- **测试**：需新增 Playwright 测试用例