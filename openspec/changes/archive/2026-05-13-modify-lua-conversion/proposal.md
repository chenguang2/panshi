## Why

当前工具箱的 Lua 函数与配置字符串之间的转换，在 `luaToConfigString` 中会自动包裹 `return function(conf, ctx)\n...\nend`，在 `configStringToLua` 中又剥离这层外壳。但实际场景中输入本身已经是一个完整的 Lua 函数定义，自动加壳/剥壳不仅多余，而且会导致函数定义嵌套错误。需要去掉这一层自动包装逻辑，让转换变成纯字符串化的直通操作。

## What Changes

- **`luaToConfigString`**：去掉自动添加 `return function(conf, ctx)\n` 前缀和 `\nend` 后缀的逻辑，改为直接对输入进行 JSON.stringify
- **`configStringToLua`**：去掉自动剥离 `return function(conf, ctx)\n` 前缀和 `\nend` 后缀的逻辑，改为 JSON.parse 后直接返回
- **Tools.vue 用户界面**：更新左面板的输入提示占位文字，反映新预期输入格式（完整函数定义）

## Capabilities

### New Capabilities
- `lua-conversion`: Lua 函数与配置字符串之间的双向转换能力，提供将完整 Lua 函数定义序列化为 JSON 字符串及反向恢复的能力

### Modified Capabilities
（无现有 spec 被修改）

## Impact

- `frontend/src/utils/tools/lua.ts` — 两个转换函数的逻辑被修改
- `frontend/src/views/Tools.vue` — 占位文字更新
- 无 API/后端/数据库影响
- 无新增依赖
