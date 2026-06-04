## Why

当前插件开关页面使用的是 Ant Design Vue 表格（Table）布局，显示简陋，缺少插件分类、描述、schema 预览等关键信息。根据设计稿 `docs/ui/Live-Artifact-3/plugins.html`，需重构为卡片网格布局，提升可用性和视觉一致性。

## What Changes

- **前端 PluginSwitches.vue**：表格 → CSS Grid 卡片网格，每项显示名称、分类标签、描述、开关、schema 预览
- **分类筛选**：分类标签 pill 过滤（安全/流量控制/可观测/协议/转换/其他）
- **搜索栏**：按插件名称搜索
- **状态筛选**：下拉框筛选（全部/已启用/已禁用）
- **计数提示**："共 N 个插件"，随筛选变化
- **schema 预览**：点击"⚙ schema"展开/收起插件的 JSON schema
- **状态栏**：显示"已启用 X / N 个插件"计数
- **批量操作**：全部启用 / 全部禁用按钮
- **未保存提示**：开关变更时显示"有未保存的更改"
- **后端 plugin_definitions.py**：补充 `display_name`、`category` 字段
- **后端 plugins API**：`GET /plugins/builtin` 返回新增字段

## Capabilities

### Modified Capabilities

- `plugin-management`（现有 spec，若存在）: 插件开关页面 UI 重设计

## Impact

- `frontend/src/views/PluginSwitches.vue` — 完全重写
- `backend/app/config/plugin_definitions.py` — 补充 display_name/category 字段
- `backend/app/api/v1/plugins.py` — builtin 插件列表返回新增字段
- `backend/app/schemas/plugin_switch.py` — 新增 PluginSwitchItem schema
- `backend/app/api/v1/plugin_switches.py` — 事务保护 + 引用扫描警告
