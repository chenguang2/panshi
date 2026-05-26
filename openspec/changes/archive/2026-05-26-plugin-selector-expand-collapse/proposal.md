## Why

插件分类太多时全部展开导致左侧面板过高；保存空插件组时因空 dict 未序列化导致 SQLite 报错。

## What Changes

- 左侧分类默认全部折叠，顶部加「全部展开/全部折叠」按钮
- 有已选插件的分类自动展开
- 每次打开弹窗重置展开状态
- 修复空 dict 保存时 `json.dumps` 跳过导致的 SQLite 错误

## Impact

- `frontend/src/components/PluginSelector.vue` — 展开/折叠逻辑 + UI
- `backend/app/api/v1/clusters.py` — 修复空 dict 序列化
