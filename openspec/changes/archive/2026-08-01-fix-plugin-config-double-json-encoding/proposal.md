## Why

发布路由到 Edge 节点时，插件配置（如 `proxy_rewrite`）在 JSON 编辑模式下保存会**双重 JSON 编码**：`json-editor-vue` 在 text 模式下发的是原始文本字符串，`PluginEditorDrawer.vue` 的 `watch(jsonEditorValue)` 又对其执行 `JSON.stringify()`，导致存入数据库的 config 是 `'"{\n \"headers\": {...}}"'`。发布时后端 `json.loads()` 只解一层，得到字符串而非对象，Edge API 返回 400 `wrong type: expected object, got string`。

## What Changes

- 修复 `frontend/src/components/PluginEditorDrawer.vue` 的两个同步 watch（必须成对）：
  - `jsonEditorValue → jsonConfig`：仅当值为非字符串时才 `JSON.stringify()`，字符串值原样保留，杜绝二次编码；
  - `jsonConfig → jsonEditorValue`：增加 `typeof jsonEditorValue.value !== 'string'` 守卫，阻断字符串→对象回写，防止修复后编辑器反馈环（内容重置/光标跳变）。
- 移除 `fullJsonConfig` 死代码（声明 + 赋值均无读取）。
- 修复存量数据：route 8 已入库的双重编码 `proxy_rewrite` config 需要解一层（通过重新保存或数据迁移）；`ps_plugin_config` / `ps_global_rule` 的 `plugins` 列需递归检查 dict 值（当前 0 行，防御未来）。
- 补充前端单元测试，覆盖 JSON 编辑模式保存时 config 保持单层 JSON 编码、反馈环收敛、表单模式无回归。

## Capabilities

### New Capabilities

- `plugin-config-json-serialization`: 插件配置在 JSON 编辑模式下的序列化行为——保存时必须是单层 JSON 编码字符串，任何模式下（表单/JSON）存储到数据库的 config 都应被 Edge 发布流程正确解析为对象。双 watch 同步不得产生编辑器反馈环。

### Modified Capabilities

- `route-plugins-config`: 插件配置保存行为增加约束——JSON 编辑模式不得二次编码 config。

## Impact

- `frontend/src/components/PluginEditorDrawer.vue` — 两个 watch 逻辑（成对修复）+ `fullJsonConfig` 死代码移除
- `frontend/src/components/__tests__/` — 新增单元测试
- 存量数据库：`ps_route_plugin` route 8 的 `proxy_rewrite` 双重编码数据（当前唯一受影响行）；`ps_plugin_config` / `ps_global_rule` 当前 0 行
- 所有使用该抽屉的插件（路由插件、插件组、全局规则、插件元数据）均受益——修复对所有插件通用；插件组/全局规则的提交路径有独立 `JSON.parse` 层，修复后自动产生正确对象，无需额外改动
