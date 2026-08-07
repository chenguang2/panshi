## Why

路由高级匹配（`RouteAdvancedMatch.vue`）目前仅支持 10 个运算符（`==`/`!=`/`>`/`<`/`~~`/`~*`/`IN`/`NOT IN`/`ip~`/`not_ip~`），远未覆盖 Edge 手册 §8 表达式引擎的完整运算符集合。用户无法配置版本号比较（`v>=`）、大小写不敏感匹配（`==*`）、数组包含（`has`）等手册支持的能力，且现有 `~*` 语义与手册相悖（手册为 `~~*`=忽略大小写，当前 `~*` 被误标为"大小写敏感正则"），`postarg_` 变量前缀与手册 `post_arg_*` 不一致。

## What Changes

- **运算符全扩展**（对齐手册 1.1.1 比较运算符全集）：
  - 新增：`==*`、`!=*`（忽略大小写）、`>=`、`<=`（数值）、`v>`、`v>=`、`v<`、`v<=`（版本号）、`has`、`has*`（左值数组包含，**单值输入**）、`rx~`、`rx~*`（路径优化 in，**数组输入**）、`in*`（忽略大小写 in）
  - **别名兼容**：`ipmatch`（ip~ 别名）不单独展示，仅反序列化时兼容读取并归一化为 `ip~`
  - **去重**：手册 `in`（右值数组）由现有 `IN`（组合）覆盖，UI 不单独展示
  - **修正**：`~*` → `~~*`（忽略大小写正则），删除错误的 `~*`（大小写敏感正则）语义
- **变量前缀对齐手册**：`postarg_` → `post_arg_`（手册 9 节 `post_arg_*`）
- **数组类运算符统一标签输入**：`rx~`/`rx~*`/`in*` 与 `ip~`/`IN` 复用 `isListOperator` 机制；`has`/`has*` 为**单行输入**（手册语义：左值数组包含右值单值）
- **序列化保持扁平结构**（方案 A）：3 元组 `[key, op, value]` / 4 元组取反 `[key, "!", op, value]`，不引入逻辑嵌套（AND/OR 后续变更）
- **保持反序列化兼容**：旧 `postarg_` 数据仍可解析（映射到 post_arg_ 语义）、旧 `~*` 数据映射为 `~~*`、`ipmatch` 归一化为 `ip~`（DB 实测三者均 0 条，防御性兼容）
- **修复 `not_ip~` 下拉缺失（评审确认 2026-08-07）**：`OPERATOR_GROUPS` 的 IP 分组补回 `not_ip~`（非 IP 匹配）——类型/序列化/LIST_OPERATORS 均已支持，仅 UI 分组遗漏
- **操作符行内动态提示（评审确认 2026-08-07）**：每个运算符声明说明文案（语义 + 示例），条件行下方随操作符切换实时显示
- **JSON 编辑双模式（评审确认 2026-08-07）**：高级匹配页新增「JSON 编辑」切换，表单 ⇄ vars JSON 双向同步；开启时显示 vars 原始 JSON 文本区，关闭时严格校验并解析回规则列表（非法 JSON/结构错误提示具体错误不切回）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `route-management`: 路由高级匹配的运算符全集扩展、`~~*` 语义修正与 `post_arg_*` 变量前缀对齐、`not_ip~` 下拉修复、操作符行内提示、JSON 编辑双模式。

## Impact

- `frontend/src/components/RouteAdvancedMatch.vue`：运算符枚举/下拉分组（含 not_ip~）、`MatchOperator` 类型扩展、数组运算符控件切换、`post_arg_` 前缀序列化/反序列化、操作符说明文案、JSON 编辑模式
- `frontend/src/types/index.ts`：`MatchOperator` 类型扩展
- `frontend/src/components/__tests__/RouteAdvancedMatch.test.ts`：新增运算符测试、`postarg_`→`post_arg_` 兼容测试、not_ip~ 下拉测试、行内提示测试、JSON 模式测试
- 后端 schema `vars: List[List[Any]]` 无需修改（扁平结构不变）
- DB 既有数据：`postarg_` 旧数据兼容读取；运算符语义不破坏现有 `==`/`>` 等
