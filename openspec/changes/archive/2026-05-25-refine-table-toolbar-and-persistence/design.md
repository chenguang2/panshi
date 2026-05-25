## Decisions

- **搜索框右对齐**: 使用 `.toolbar-right { margin-left: auto }` 推至工具栏右侧
- **localStorage 持久化**: key 格式 `{resource}_cfg_{userId}`，按用户隔离，无需后端数据库
- **watch + deep**: 配置变化时自动保存，页面加载时自动恢复
