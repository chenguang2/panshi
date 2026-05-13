## Context

工具箱中的 Lua 转换工具位于 `frontend/src/utils/tools/lua.ts`，提供两个函数：

- `luaToConfigString(luaCode: string)` — 将 Lua 代码转为配置字符串（JSON 格式）
- `configStringToLua(configString: string)` — 将配置字符串还原为 Lua 代码

当前实现在转换时自动包裹/剥离 `return function(conf, ctx)\n` 前缀和 `\nend` 后缀。但实际使用场景中用户输入的已经是完整的 Lua 函数定义，这层自动处理会导致重复包装的问题。修改范围仅限于前端工具函数及其调用处。

## Goals / Non-Goals

**Goals:**
- 去掉 `luaToConfigString` 中的自动加壳逻辑，只做纯 JSON.stringify
- 去掉 `configStringToLua` 中的自动剥壳逻辑，只做 JSON.parse 后直通返回
- 更新 Tools.vue 中输入提示文案，反映新输入格式
- 保持兼容性：现有存储的已有配置字符串（带壳格式）在 decode 时仍能正确解析

**Non-Goals:**
- 不修改后端代码
- 不修改其他工具函数
- 不引入新依赖

## Decisions

### 决策 1：configStringToLua 保留兼容 fallback

**问题**：旧版存储的配置字符串仍然带有 `return function(conf, ctx)\n...\nend` 外壳。直接去掉剥壳逻辑后，解析旧数据会得到带外壳的字符串。

**方案**：采用"先尝试新版格式，fallback 到旧版格式"的策略。由于新版格式没有外壳，旧版格式有外壳，而外壳是确定的字符串模式，可以安全地检测并兼容处理：

```ts
function configStringToLua(configString: string): string {
  const parsed = JSON.parse(configString)
  // 兼容旧格式：如果有外壳则剥离
  if (parsed.startsWith('return function(conf, ctx)') && parsed.endsWith('end')) {
    // 剥离外壳逻辑（复用现有逻辑的简化版）
    ...
  }
  return parsed
}
```

**替代方案考虑**：
- **完全不兼容旧数据** — 否决，会破坏用户已有的配置
- **版本号标记** — 过度设计，通过检测外壳模式即可区分新旧格式

### 决策 2：luaToConfigString 不做任何格式校验

**问题**：是否应该在校验输入是否为合法 Lua 函数定义？

**决定**：不校验。工具箱的定位是纯工具函数，不做语义检查。用户自行保证输入格式正确。

## Risks / Trade-offs

- **[兼容性风险]** 旧版存储字符串 decode 后可能包含外壳 → **Mitigation**: configStringToLua 保留检测并剥离外壳的 fallback 逻辑，仅在检测到确定的外壳模式时才做兼容处理
- **[用户习惯变化]** 使用 encode 功能时，用户需要自己输入完整的函数定义 → **Mitigation**: 更新 UI 占位文字明确提示新格式
