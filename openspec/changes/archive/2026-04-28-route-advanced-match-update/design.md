## Context

路由高级匹配功能位于 `RouteAdvancedMatch.vue` 组件中，负责构建 APISIX 条件匹配规则（vars）。vars 格式为 `[[变量名, 运算符, 值], ...]`，前端需要根据用户选择的参数位置添加不同的前缀。

## Goals / Non-Goals

**Goals:**
- 支持 5 种参数位置：请求头、查询参数、POST参数、Cookie、内置参数
- 支持 8 种判断条件运算符
- 保持与后端 vars 格式的兼容性

**Non-Goals:**
- 不修改后端 API 契约（vars 格式保持不变）
- 不支持客户端 IP 匹配（已移除）

## Decisions

1. **参数位置前缀映射**
   - 请求头 → `http_`（已有）
   - 查询参数 → `arg_`（已有）
   - POST参数 → `postarg_`（新增）
   - Cookie → `cookie_`（已有）
   - 内置参数 → 无前缀（新增，直接使用变量名）

2. **运算符实现**
   - 使用原生字符串运算符传递给后端
   - 不在后端做额外转换

3. **类型安全**
   - 在 `types/index.ts` 中定义 `MatchRuleType` 和 `MatchOperator` 联合类型
   - 在组件中使用类型断言确保类型安全

## Risks / Trade-offs

- [风险] 模板中箭头函数的隐式 any 类型错误 → 已知问题，vue-tsc 无法从模板内联处理器推断类型

## Open Questions

无
