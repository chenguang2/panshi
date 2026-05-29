## Why

集群管理的分组功能存在多个体验问题：编辑集群时分组字段可空导致无法清除分组；新建分组用浏览器原生 prompt() 弹窗；未分组区域没有展开收起；缺少一键展开/收起所有分组的功能。

## What Changes

1. **分组改为必填** — `group_name` 始终有值（`''` 表示未分类），去掉 `allow-clear`
2. **新增「未分类」默认选项** — Select 第一项为"未分类"（`value=""`）
3. **内联新建分组** — 下拉框底部嵌入输入框+添加按钮，替代 `prompt()`
4. **未分组支持展开收起** — 与命名分组一致的 toggle 行为
5. **全部展开/全部收起按钮** — 搜索栏右侧，一键控制所有分组

## Capabilities

### New Capabilities
- (无新增)

### Modified Capabilities
- `cluster-card-grid`: 分组管理增强

## Impact

- `frontend/src/views/ClusterList.vue` — 所有改动在这个文件
