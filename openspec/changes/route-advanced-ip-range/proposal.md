## Why

路由高级匹配（RouteAdvancedMatch）目前支持 `==`/`!=`/`>`/`<`/`~~`/`~*`/`IN`/`NOT IN` 等操作符，但**缺少 IP 范围/CIDR 匹配**。运维需要按客户端 IP 段分流（如仅允许内网 IP 段访问、排除特定来源）。Edge 端（APISIX 内核）原生支持 `ip~` 操作符，后端 `dns_wan.py` 也已生成该格式的 vars，但前端高级匹配 UI 无法表达。

## What Changes

- **前端操作符扩展**：`RouteAdvancedMatch.vue` 操作符下拉新增「IP 匹配（ip~）」和「非 IP 匹配（not_ip~）」
- **标签输入控件**：选中 ip~/not_ip~ 时，value 输入框切换为 Ant Design Vue `a-select mode="tags"`（每个 tag 一个 IP/CIDR，如 `10.158.40.51`、`10.0.0.0/8`）
- **类型放宽**：`MatchRule.value` 由 `string` 扩展为 `string | string[]`；`Route.vars` 由 `[string,string,string][]` 放宽为 `[string, string, string | string[]][]`
- **序列化格式**（与后端 `dns_wan.py` 先例及 Edge 使用手册一致）：
  - `ip~` → `["remote_addr", "ip~", ["10.158.40.51", "10.0.0.0/8"]]`（3 元组，value 为数组）
  - `not_ip~` → `["remote_addr", "!", "ip~", ["192.168.0.3", "127.0.0.1/8"]]`（4 元组取反）
- **反序列化**：`parseRulesFromVars` 识别 3 元组 `ip~` 与 4 元组 `!` 取反格式，映射回 `ip~`/`not_ip~` 规则
- **内置参数自由输入保持不变**：用户仍可手动填写 `remote_addr`/`http_x_forwarded_for` 等任意 Nginx 变量

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `route-management`: 路由高级匹配条件新增 IP 范围匹配（`ip~`）与非匹配（`not_ip~`）操作符，支持 IP/CIDR 列表值，取反使用 4 元组 vars 格式。

## Impact

- `frontend/src/types/index.ts`：`MatchOperator` 扩展、`MatchRule.value` 放宽、`Route.vars` 类型放宽
- `frontend/src/components/RouteAdvancedMatch.vue`：操作符下拉、标签输入切换、序列化/反序列化逻辑
- `frontend/src/components/__tests__/RouteAdvancedMatch.test.ts`：新增 ip~ 解析/序列化测试
- 后端 `schemas/route.py` 的 `vars: List[List[Any]]` 已兼容，**无需修改**
- Edge 端原生支持 `ip~`/`!`，**无需修改**
