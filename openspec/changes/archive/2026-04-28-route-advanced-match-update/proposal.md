## Why

路由高级匹配功能需要增强参数位置选项和判断条件，以支持更灵活的业务匹配场景。当前实现缺少 POST 参数和内置参数支持，且运算符选项不完整。

## What Changes

**参数位置变更：**
- 新增 POST参数 选项（key 前缀：`postarg_`）
- 新增 内置参数 选项（无前缀）
- 移除 客户端IP 选项

**判断条件变更：**
- 保留：等于 (`==`)、不等于 (`!=`)
- 新增：大于 (`>`)、小于 (`<`)
- 变更：正则匹配 (`~~`)、大小写敏感正则 (`~*`)
- 新增：包含 (`IN`)、不包含 (`NOT IN`)

## Capabilities

### New Capabilities
- `route-advanced-match`: 路由高级匹配增强，支持 POST 参数和内置参数

### Modified Capabilities
- `route-advanced-match`: 扩展参数位置类型和判断条件运算符

## Impact

**前端修改：**
- `frontend/src/types/index.ts` - 新增 MatchRuleType、MatchOperator 类型
- `frontend/src/components/RouteAdvancedMatch.vue` - 组件逻辑重构
- `frontend/src/components/__tests__/RouteAdvancedMatch.test.ts` - 单元测试

**vars 数据格式（后端不变）：**
```javascript
["postarg_user_id", ">", "100"]   // POST 参数
["uri", "~~", "/api/v\\d+"]        // 内置参数
```
