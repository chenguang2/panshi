## Why

集群管理中有多个交互细节需要改进：展开卡片后页面应滚动到详情区；最大化时应同时收起未分组；分组与详情之间的分隔线应跟随主题色。

## What Changes

1. **展开后滚动定位** — 点击"展开"按钮后页面平滑滚动到该集群的详情区域
2. **最大化时收起未分组** — 修复未分组在最大化时未收起的问题
3. **分隔线颜色** — 分组列表与详情区之间的分隔线使用主题色
4. **移除标题栏点击行为** — 避免用户混淆最大化/展开/还原

## Capabilities

### New Capabilities
- (无新增)

### Modified Capabilities
- `cluster-card-grid`: 展开/最大化交互细节

## Impact

- `frontend/src/views/ClusterList.vue` — 所有改动
