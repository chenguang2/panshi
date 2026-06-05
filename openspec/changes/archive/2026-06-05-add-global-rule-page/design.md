## Context

与插件组完全一致的设计。卡片网格布局，查看用 Drawer，删除用 `showDeleteConfirm`，发布用 `PublishConfirmModal`。

## Key Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| 布局 | CSS Grid 固定 3 列 | 与插件组一致 |
| 表单 | Ant Design `<a-modal>` + `<a-form>` | 与插件组一致 |
| 操作按钮 | ghost 风格（查看/编辑/删除）+ 次级按钮（发布/版本管理） | 与插件组一致 |
| 查看详情 | Drawer 展示 | 与插件组一致 |
| 删除 | `showDeleteConfirm` + `executeDeleteWithProgress` | 与插件组一致 |
| 发布 | `PublishConfirmModal` + `executePublish` | 与上游/插件组一致 |
