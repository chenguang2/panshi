## Why

路由高级匹配的 `IN`（包含）/ `NOT IN`（不包含）操作符目前使用**单字符串输入框**，序列化输出为 `[key, "IN", "user1,user2"]`（大写 + 字符串）。这与 Edge 端语义冲突：APISIX `in` 操作符要求**右值为数组**（`["arg_name", "in", ["user1","user2"]]`），当前格式可能导致匹配不生效。同时 UI 与已实现的 `ip~` 标签输入不一致。

## What Changes

- **标签输入**：`IN`/`NOT IN` 的 value 控件切换为 `a-select mode="tags"`（复用 ip~ 的列表输入模式）
- **序列化格式修正**（对齐 Edge 手册 3382/3368 行）：
  - `IN` → `[key, "in", ["user1","user2"]]`（小写 `in`，value 数组）
  - `NOT IN` → `[key, "!", "in", ["user1","user2"]]`（4 元组取反，对齐 ip~ 的 not_ip~ 模式）
- **反序列化兼容**（4 种形态）：
  - 4 元组 `[var, "!", "in", [list]]` → NOT IN 规则（前置判断防错解）
  - 3 元组 `[var, "in", [list]]` → IN 规则（小写数组）
  - 旧格式 `[var, "IN", "a,b"]`（大写字符串）→ IN 规则（逗号拆）
  - 旧格式 `[var, "NOT IN", "a,b"]` → NOT IN 规则（逗号拆）
- **核心抽象**：`isListOperator()` 统一 `ip~`/`not_ip~`/`IN`/`NOT IN` 四个列表操作符的控件判断（**与 `isIpOperator` 职责分离**：`isListOperator` 控件切换、`isIpOperator` placeholder 区分，现有测试语义不变）；placeholder 用 `isIpOperator` 区分 IP 与通用提示
- **序列化映射表驱动**：`IN`→`in`、`NOT IN`→`!in` 与 `ip~`/`not_ip~` 对称展开
- **4 元组 type 推导修复（评审确认）**：提取 `deriveRuleType(varName)` 复用 key 前缀推导，修复现有 ip~ 4 元组硬编码 builtin 导致 header 类型错判的 bug（ip~ 与 in 一并修复）
- **`in*` 大小写变体本次不做（评审确认）**：只做 `in`（大小写敏感），避免范围蔓延
- **旧 `NOT IN` 兼容保留（评审确认）**：DB 实测仅 `IN` 21 条、`NOT IN` 0 条，兼容分支保留 + 测试覆盖

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `route-management`: 路由高级匹配的 `IN`/`NOT IN` 操作符改为标签输入，序列化修正为 Edge `in`/`!in` 数组格式，并兼容旧的大写字符串数据。

## Impact

- `frontend/src/components/RouteAdvancedMatch.vue`：`isListOperator` 抽象、value 控件切换、序列化/反序列化 in 分支、`listPlaceholder`
- `frontend/src/components/__tests__/RouteAdvancedMatch.test.ts`：IN/NOT IN 序列化/解析/兼容测试
- DB 现有脏数据（route 42/71：`["remote_addr","IN","192.168.1.0/24"]`）：反序列化兼容，编辑保存后自动升级为新格式
- 后端 schema `vars: List[List[Any]]` 已兼容，**无需修改**；Edge 端原生支持 `in`/`!`，**无需修改**
