## Context

路由高级匹配（`frontend/src/components/RouteAdvancedMatch.vue`）是路由表单中的条件编辑器，生成 APISIX `vars` 表达式数组。当前支持操作符：`==` `!=` `>` `<` `~~` `~*` `IN` `NOT IN`；value 为单个字符串；vars 类型为固定 3 元组 `[string, string, string][]`。

需要新增 IP 范围/CIDR 匹配。**Edge 端（APISIX 内核）原生支持 `ip~` 操作符**（使用手册 3380 行：`["remote_addr", "ip~", ["192.168.1.1", "192.168.2.0/24"]]`），后端 `dns_wan.py` 已生成该格式（含 4 元组取反 `["remote_addr", "!", "ip~", [list]]`），`edge_import_service.py` 已解析。**后端 schema `vars: List[List[Any]]` 无操作符白名单，Edge 端零改动**——缺口仅在前端。

## Goals / Non-Goals

**Goals:**
- 前端支持 `ip~`（IP 匹配）与 `not_ip~`（非 IP 匹配）两个操作符
- value 支持 IP/CIDR 列表（标签输入）
- 序列化格式与后端先例完全一致（3 元组 / 4 元组取反）
- 内置参数自由输入保留（用户可填 `remote_addr`、`http_x_forwarded_for` 等任意 Nginx 变量）
- 现有 8 个操作符行为不变（回归安全）

**Non-Goals:**
- 不改后端（schema 已兼容）
- 不改 Edge 端（原生支持）
- 不做独立的「IP 范围」规则类型（方案三否决——丢失内置参数自由输入灵活性）
- 不做 UI 内 IP 合法性校验（由 Edge 端校验兜底）

## Decisions

### Decision 1: 内部用 `ip~` / `not_ip~` 两个操作符，序列化时展开为 Edge 格式

内部规则统一用 `ip~`（匹配）和 `not_ip~`（取反）表示，对齐现有 `IN`/`NOT IN` 的成对模式：

```ts
export type MatchOperator =
  | '==' | '!=' | '>' | '<' | '~~' | '~*'
  | 'IN' | 'NOT IN'
  | 'ip~' | 'not_ip~'
```

序列化（`buildVarsFromRules`）：
- `ip~` → `[key, "ip~", ["10.158.40.51", "10.0.0.0/8"]]`（3 元组，value 数组）
- `not_ip~` → `[key, "!", "ip~", ["192.168.0.3", "127.0.0.1/8"]]`（4 元组，对齐 dns_wan.py）

**备选**：序列化时保留单操作符 `ip~` + 独立否定标志——否决，`!` 前缀是 Edge 原生语法，内部展开更贴近 APISIX 数据模型，且与 dns_wan.py/edge_import 解析逻辑一一对应。

### Decision 2: value 用标签输入（a-select mode="tags"）

选中 `ip~`/`not_ip~` 时，value 控件从 `a-input` 切换为 `a-select mode="tags"`，每个 tag 一个 IP/CIDR，天然表达数组语义。

**备选**：逗号分隔字符串 + split——否决，UX 差（无即时反馈、易输错）；字符串类型勉强兼容 3 元组但 4 元组仍需放宽类型，收益不抵复杂度。

### Decision 3: 类型放宽而非新增规则类型

`MatchRule.value: string | string[]`；`Route.vars: [string, string, string | string[]][]`（3 元组为主，4 元组仅在 `not_ip~` 序列化结果中出现，反序列化时归一化回 `not_ip~` 内部表示）。

**备选**：新增 `'ip_range'` 规则类型（方案三）——否决，丢失内置参数自由输入（用户可能匹配 `http_x_forwarded_for`），且需重做类型/模板/解析全链路。

### Decision 4: 反序列化归一化

`parseRulesFromVars` 识别两种形态：
- `[var, "ip~", list]`（3 元组）→ `{ operator: 'ip~', value: list }`
- `[var, "!", "ip~", list]`（4 元组）→ `{ operator: 'not_ip~', value: list }`

**解析前置判断（评审确认）**：4 元组必须在解构前先判断 `v.length === 4 && v[1] === "!" && v[2] === "ip~"` 走独立分支——现有 `const [varName, operator, value] = v` 固定 3 元组解构会把 4 元组错解为 `operator="!"`、`value="ip~"`、list 丢失。`parseRulesFromVars` 参数类型须一并放宽为 `(string | string[])[][]`。

**value 兼容拆分（评审确认）**：
- 3 元组 `ip~` 的 value 非数组时按逗号拆分（旧数据/手写兼容）
- 4 元组取反的 `v[3]` 非数组时拆分为**单元素数组 `[v[3]]`**（CIDR 含 `/` 无逗号，单值场景更常见），不按逗号拆分

### Decision 5: ip~ 不限定变量类型（评审确认）

`ip~`/`not_ip~` 操作符**不限定只能用于 builtin 类型**——header/query/postarg/cookie/builtin 均可搭配（Edge 的 `ip~` 是通用 ipmatcher，对任意变量值做 IP 匹配）。`remote_addr` 只是最常见场景，`http_x_forwarded_for`、自定义 header 等均可。

### Decision 6: 本次范围（评审确认）

- **只做 `ip~`/`not_ip~`**：`IN`/`NOT IN` 保持现状（其 value 数组语义已有 edge 支持，UI 单输入框暂不升级，避免范围蔓延）
- **不动 `remote_addrs` 死字段**：该顶层字段（APISIX 原生 IP 白名单，前端无 UI、`edge_client.build_route` 不序列化）另开变更处理，本次不涉及

## Risks / Trade-offs

- [旧数据兼容] 已存在 vars 中无 `ip~` 操作符（DB 实测仅 `==`/`IN`/`~~`）→ 反序列化对 `ip~` 非数组 value 做兼容拆分（3 元组逗号拆、4 元组单元素数组）；回归测试覆盖
- [操作符大小写] 现有 `IN`/`NOT IN` 大写直接进 vars（Edge 实测接受）；`ip~` 统一用小写对齐文档与先例
- [类型放宽安全] `string | string[]` 放宽后其他操作符的 string 行为不受影响（`Array.isArray` 分支隔离）
- [UI 复杂度] 标签输入与字符串输入双控件 → `isIpOperator()` 单点判断，模板条件渲染，逻辑集中
- [4 元组解析] 现有固定 3 元组解构会错解 4 元组 → 解构前前置判断 `v.length === 4 && v[1] === "!" && v[2] === "ip~"`，独立分支处理（评审确认）
- [remote_addrs 死字段] 顶层字段与 `ip~` 功能部分重叠，但前端无 UI、不序列化 → 本次不涉及，另开变更（评审确认）

## Migration Plan

无 DB 迁移（vars 为 JSON 列，结构向后兼容）。前端类型/组件改动随路由表单发布。

## Open Questions

无（2026-08-07 方案 2 与内置参数自由输入已确认）。
