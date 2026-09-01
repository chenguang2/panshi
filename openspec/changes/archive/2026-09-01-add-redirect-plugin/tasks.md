## 1. 后端插件定义

- [x] 1.1 在 `backend/app/config/plugin_definitions.py` 的 `BUILTIN_PLUGINS` 列表末尾（`dns_upstream` 之后）新增 `redirect` 插件定义，包含 name、display_name、category、description、enable_metadata、schema 六个字段
- [x] 1.2 验证 `PluginSwitchItem` 校验器自动接受 `redirect`（运行相关测试）

## 2. 前端验证

- [x] 2.1 确认插件开关页面正确显示 `redirect` 插件（手动验证或自动化测试）
- [x] 2.2 确认 PluginEditorDrawer 表单模式正确渲染 redirect 的所有字段
