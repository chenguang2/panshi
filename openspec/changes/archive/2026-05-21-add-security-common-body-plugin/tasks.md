## 1. Backend — 注册插件到 BUILTIN_PLUGINS

- [x] 1.1 在 `backend/app/api/v1/plugins.py` 的 `BUILTIN_PLUGINS` 列表末尾添加 `security_common_body` 条目
- [x] 1.2 为每个参数定义完整的 schema：`denylist`（array[string]）、`maxsize`（integer, default 4096）、`status`（integer, default 403）、`message`（string）、`bypass_hugebody`（boolean, default false）
- [x] 1.3 确保 `enable_metadata` 设为 `false`

## 2. Frontend — 添加插件到前端选择器

- [x] 2.1 在 `frontend/src/components/PluginSelector.vue` 的 CATEGORIES 中新增「安全防护」分类
- [x] 2.2 将 `security_common_body` 加入该分类的 plugins 列表
- [x] 2.3 验证无 LSP 报错

## 3. 文档同步修正

- [x] 3.1 根据文档变更，将 `bypass_hugebody` 默认值从 `False` 改为 `True`
- [x] 3.2 将「安全防护」分类移到「监控」上方
- [x] 3.3 同步更新 `docs/edge/plugins/security_common_body.log`
