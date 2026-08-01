## Context

`PluginEditorDrawer.vue` 是路由插件、插件组、全局规则、插件元数据共用的配置编辑器，支持表单/JSON 双模式。JSON 模式使用 `json-editor-vue`（v0.18.1），其 text 模式下 `v-model` 发出的是**原始文本字符串**（库内 `stringified` 默认 `true`）。

当前代码在 `watch(jsonEditorValue)` 中对值无条件执行 `JSON.stringify(newVal)`：

```js
watch(jsonEditorValue, (newVal) => {
  jsonConfig.value = JSON.stringify(newVal)   // newVal 是字符串时 → 二次编码
})
```

结果：用户输入 `{"headers": {...}}`，编辑器发出字符串，`JSON.stringify` 再包一层引号 → `'"{\n \"headers\": {...}}"'`。该双重编码字符串经 `handleSave` → `PluginSelector` → 后端 `update_route_plugins`（字符串原样存库）→ 发布时 `json.loads()` 只解一层得到字符串 → Edge API 400。

表单模式不受影响：`buildConfigFromForm()` 内部对对象执行一次 `JSON.stringify`，输出本就是单层 JSON 字符串。

## Goals / Non-Goals

**Goals:**
- 修复 JSON 编辑模式下的二次编码，保存的 config 始终是单层 JSON 编码字符串
- 修复对所有插件通用（路由插件、插件组、全局规则、插件元数据）
- 修复存量已损坏数据（route 8 的 proxy_rewrite）
- 补充单元测试防止回归

**Non-Goals:**
- 不修改后端序列化逻辑（`json.loads` 一次解码是正确语义，问题在数据源头）
- 不修改 `json-editor-vue` 库或替换编辑器
- 不改变表单模式现有行为

## Decisions

**D1: 双向 watch 均加类型守卫（必须成对修改）**

只改 watch1（`jsonEditorValue → jsonConfig`）会触发**反馈环**：用户输入字符串 S → watch1 将 `jsonConfig` 设为 S（原样）→ watch2 触发 `JSON.parse(S)` 得对象 P，而 `jsonEditorValue` 是字符串 S，两者 `JSON.stringify` 必不等 → watch2 把 `jsonEditorValue` 回写为对象 P → json-editor-vue 的 modelValue 监听调用 `editor.set({json: P})` → **编辑器内容整体替换、光标跳变**。因此两个 watch 必须同时加守卫：

```js
// watch1: jsonEditorValue → jsonConfig（字符串原样，对象才 stringify）
watch(jsonEditorValue, (newVal) => {
  try {
    jsonConfig.value = typeof newVal === 'string' ? newVal : JSON.stringify(newVal)
    jsonError.value = ''
  } catch { /* keep old value */ }
}, { deep: true })

// watch2: jsonConfig → jsonEditorValue（仅当 jsonEditorValue 不是字符串时才回写对象）
watch(jsonConfig, (newVal) => {
  try {
    const parsed = JSON.parse(newVal || '{}')
    if (typeof jsonEditorValue.value !== 'string' && JSON.stringify(parsed) !== JSON.stringify(jsonEditorValue.value)) {
      jsonEditorValue.value = parsed
    }
    jsonError.value = ''
  } catch { /* invalid JSON, don't sync back */ }
})
```

- **备选 A：** 给 `<JsonEditorVue>` 传 `:stringified="false"` 强制库输出对象。被否决——改变库的 v-model 契约，初始值 `JSON.parse(props.plugin.config)` 已是对象，text 模式期望字符串，两者冲突会导致编辑器内容显示异常。
- **备选 B：** 在 `handleSave` 里对 `jsonConfig.value` 做 `JSON.parse(JSON.parse(...))` 深度解包。被否决——数据已损坏才需要两层解析，正确做法是源头不产生坏数据，且深解包在合法单层数据上会破坏对象语义。
- **选 D1 理由：** 类型判断精确匹配 json-editor-vue 的双向行为（text 模式发字符串、tree 模式发对象），watch2 的 `typeof jsonEditorValue.value !== 'string'` 守卫阻断字符串→对象回写，反馈环收敛。

**D2: 插件组/全局规则的写路径有独立的 JSON.parse 层，修复对其同样生效但路径不同**

`useClusterPluginEntity.ts:111` 与 `PluginEntityFormModal.vue:118` 在提交前执行 `JSON.parse(sp.config)`：

```js
try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config }
```

- **修复前**：双重编码串 `'"{\n...}"'` 一次 parse 得到**字符串**（不抛错）→ `plugins[name]` 仍是字符串 → 存库 → 发布报错。插件组/全局规则与路由插件同样中招。
- **修复后**：单层串 `'{"headers":...}'` 一次 parse 得到**对象** → 正确。D1 修复对它们自动生效，无需改动这两处。
- 存储差异：路由插件存 `ps_route_plugin.config`（单行单插件）；插件组/全局规则存 `ps_plugin_config.plugins` / `ps_global_rule.plugins`（整个 dict 的 JSON）。

**D3: 存量数据修复采用「重新保存」而非 SQL 迁移**

route 8 的 proxy_rewrite 已在 DB 中双重编码。修复后在界面上重新保存该插件配置即可覆盖（`update_route_plugins` 会删除重建）。修复后的 watch 同步会使打开旧数据时 `jsonConfig` 自动归一为单层，直接保存即完成修复。若用户希望脚本修复，提供一次性 Python 脚本：

- `ps_route_plugin.config`：行级 `json.loads` 一次后仍为 str 的行解包一层（当前仅 route 8 proxy_rewrite 一行）。
- `ps_plugin_config.plugins` / `ps_global_rule.plugins`：整个 dict 需**递归检查每个插件值**，对值为"可解析 JSON 的字符串"的解包为对象。注意：这两张表当前为 0 行，脚本主要防御未来场景。

**D4: fullJsonConfig 死代码清理**

`PluginEditorDrawer.vue:672` 声明、`1051` 赋值，再无任何读取。本次变更一并移除该变量及其赋值。

**D5: 测试策略**

- 单元测试：直接测两个 watch 的同步逻辑（提取为可测试函数或用组件挂载 + 触发编辑器值变更），断言：
  1. `jsonConfig.value` 是单层 JSON（`JSON.parse` 结果为对象）——watch1 字符串原样分支
  2. watch2 在 `jsonEditorValue` 为字符串时不回写对象（反馈环收敛）
  3. 表单模式 `buildConfigFromForm` 输出保持单层（无回归）
- 不做 E2E（无浏览器交互必需性，单元层已覆盖逻辑）。

## Risks / Trade-offs

- [json-editor-vue 行为依赖] → 修复依赖库当前 v-model 语义（text 发字符串）。若库升级改变语义，类型判断仍健壮（对象则 stringify、字符串则原样）。
- [只改 watch1 会引入编辑器反馈环] → 必须成对修改 watch1 + watch2（D1），watch2 加 `typeof jsonEditorValue.value !== 'string'` 守卫阻断字符串→对象回写。
- [存量损坏数据不止 route 8] → 扫描范围分两类：`ps_route_plugin.config` 行级解包；`ps_plugin_config` / `ps_global_rule.plugins` 需递归检查 dict 值。当前除 route 8 外全表 0 行。
- [tree 模式回归] → watch 改动对对象值路径（`JSON.stringify(newVal)`）行为不变，仅新增字符串分支。
- [插件组/全局规则提交路径的 JSON.parse] → 该 parse 层在修复后产生正确对象，无需改动；但若未来该处被移除，需重新评估。

## Migration Plan

1. 修改 `PluginEditorDrawer.vue` 两个 watch（D1），移除 `fullJsonConfig` 死代码（D4）
2. 新增前端单元测试，`npx vitest run` 验证
3. 前端构建 `npm run build` 验证
4. 存量数据：重新保存 route 8 插件配置；可选运行修复脚本全量扫描

## Open Questions

- ~~插件元数据 `PluginMetadataList.vue:304` 读取 `item.config_data`，但后端列表返回 `metadata` 字段 → 编辑时配置恒为 `{}`（独立既有 bug）。**本次变更不纳入**，建议单独立项修复。~~
- **更正（2026-08-01 核实）：该问题不存在。** 经重新核实，两个页面调用的是**不同端点**，各自读取的字段均与端点匹配：
  - `PluginMetadataList.vue` → **全局端点** `GET /api/v1/plugin_metadata`（`plugin_metadata.py:82`），后端返回 `config_data`，前端读取 `config_data`（line 110/304）→ ✅ 匹配
  - `PluginMetadata.vue` → **集群端点** `GET /api/v1/clusters/{id}/plugin-metadata`（`cluster_plugin_metadata.py:30`），后端返回 `metadata`，前端读取 `metadata`（line 94/281）→ ✅ 匹配
  - 最初论断只审查了集群端点（返回 `metadata`），未意识到 `PluginMetadataList.vue` 走的是另一个全局端点。两个端点字段名不同（`metadata` vs `config_data`）仅是命名不统一的风格问题，**非功能性 bug**，无需修复。
