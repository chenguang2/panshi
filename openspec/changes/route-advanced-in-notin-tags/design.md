## Context

路由高级匹配（`frontend/src/components/RouteAdvancedMatch.vue`）刚完成 `ip~`/`not_ip~` 支持（change `route-advanced-ip-range`），已实现标签输入与 3/4 元组序列化。但 `IN`/`NOT IN` 仍是**单字符串输入 + 大写字符串序列化**（`[key, "IN", "user1,user2"]`），与 Edge 端语义冲突：

- Edge 手册 3382 行：`in` 右值为**数组** `["arg_name", "in", ["user1","user2"]]`
- Edge 手册 3368 行：`!` 是通用否定前缀（`["arg_name", "!", "~~", "user[12]"]`）
- DB 实况：route 42/71 为 `["remote_addr","IN","192.168.1.0/24"]`（大写字符串，需兼容）

## Goals / Non-Goals

**Goals:**
- `IN`/`NOT IN` 改为标签输入，与 `ip~` 一致
- 序列化修正为 Edge 格式：`in` 小写 + value 数组；`NOT IN` 用 `!` 前缀 4 元组
- 反序列化兼容旧的大写字符串数据（逗号拆）
- 与 `ip~` 完全对称的心智模型

**Non-Goals:**
- 不改后端与 Edge 端（原生支持）
- 不做 `rx~` 等其他列表操作符（YAGNI，映射表结构已预留）
- 不改 `==`/`!=`/`>`/`<`/`~~`/`~*` 六个单值操作符

## Decisions

### Decision 1: 序列化修正为 `in`/`!in`（小写 + 数组 + 4 元组取反）

映射表驱动，与 `ip~`/`not_ip~` 完全对称：

```ts
if (operator === 'ip~') expanded.push([varName, 'ip~', arr])
else if (operator === 'not_ip~') expanded.push([varName, '!', 'ip~', arr])
else if (operator === 'IN') expanded.push([varName, 'in', arr])
else if (operator === 'NOT IN') expanded.push([varName, '!', 'in', arr])
else expanded.push([varName, operator, value])
```

**备选**：保留大写 `IN` + 字符串——否决，与 Edge 手册数组语义冲突，且与 ip~ 不对称。

### Decision 2: 反序列化 4 形态兼容 + 前置判断

```ts
// 1. 4 元组 [var, "!", "in", [list]] → NOT IN（前置判断，防 3 元组解构错解）
if (v.length >= 4 && v[1] === '!' && v[2] === 'in') { ... NOT IN ... }
// 2. 3 元组 [var, "in", [list]] → IN
// 3. 旧 [var, "IN", "a,b"] → IN（逗号拆）
// 4. 旧 [var, "NOT IN", "a,b"] → NOT IN（逗号拆）
```

**前置判断**：`!` + `in` 组合必须在普通 3 元组解构前判断，否则 `[var,"!","in",[list]]` 会被解构成 `operator="!"`、`value="in"`、list 丢失（与 ip~ 评审确认的 4 元组错解问题相同）。

### Decision 3: `isListOperator` 与 `isIpOperator` 职责分离（评审确认）

**职责分离**——两个函数各司其职，现有测试（`isIpOperator('IN') === false`）语义不变：

```ts
const LIST_OPERATORS = new Set(['ip~', 'not_ip~', 'IN', 'NOT IN'])
const isListOperator = (op: string): boolean => LIST_OPERATORS.has(op)  // 控件切换
const isIpOperator = (op: string): boolean => op === 'ip~' || op === 'not_ip~'  // placeholder 区分
```

- 模板 value 控件：`v-if="isListOperator(rule.operator)"` 切换标签/单输入（**改用 `isListOperator`**）
- placeholder：`isIpOperator(op) ? IP 提示 : 通用提示`（`isIpOperator` 语义不变，`IN` 仍返回 false）
- 现有测试 `isIpOperator('IN') === false` 保持通过

**备选**：合并为一个函数——否决，placeholder 区分与控件切换是不同维度，且会破坏现有 `isIpOperator('IN')` 断言。

### Decision 4: 兼容已发布旧数据

DB 中 `IN` 大写字符串数据（route 42/71，实测共 21 条 `IN`、0 条 `NOT IN`、`!` 1 条为 ip~ 取反）在反序列化时映射为 IN 规则（逗号拆）；用户重新编辑保存后自动升级为 `in` 小写数组格式。Edge 端两种格式语义等价（都指向 `in` 数组匹配），无破坏性。

**旧 `NOT IN` 兼容保留（评审确认）**：DB 实测无 `NOT IN` 数据，但保留旧格式兼容分支（防手写/未来数据）+ 测试覆盖。

### Decision 5: 4 元组分支复用 key 前缀推导（评审确认，修复现有 ip~ bug）

当前 ip~ 的 4 元组解析**硬编码 `type: 'builtin'`**（`[var,"!","ip~",[list]]`），导致 header 类型的 `not_ip~` 被错判为 builtin。本次修复：提取公共 `deriveRuleType(varName)` 复用 3 元组的 key 前缀推导（`arg_`→query、`http_`→header、`postarg_`→postarg、`cookie_`→cookie、无前缀→builtin），**4 元组分支（ip~ 与 in）统一调用**——一次修复 ip~ 与 in 两个操作符的 4 元组 type 推导。

### Decision 6: `in*` 大小写变体本次不做（评审确认）

手册 3382 行 `in`/`in*`（`*` 表示忽略大小写）——本次**只做 `in`**（大小写敏感）。`in*` 作为未来增强，需引入大小写切换 UI，避免范围蔓延。

## Risks / Trade-offs

- [旧数据格式变更] 已发布路由 vars 从 `IN` 大写字符串 → `in` 小写数组 → 反序列化兼容 + Edge 语义等价，编辑保存后自动升级；回归测试覆盖
- [4 元组错解] `[var,"!","in",[list]]` 被 3 元组解构错解 → 前置判断独立分支（与 ip~ 同款防护）；`!in` 与 `!ip~` 前置判断需合并识别
- [4 元组 type 推导] 现有 ip~ 4 元组硬编码 builtin（header 类型错判）→ 提取 `deriveRuleType` 复用前缀推导，一次修复 ip~ 与 in
- [大小写敏感] 输出统一小写 `in`；解析兼容大写旧数据 → 解析时对 `IN`/`NOT IN`（大写）与 `in`/`!in`（小写）均识别；`in*` 不做
- [UI 一致性] IN/NOT IN 标签输入与 ip~ 一致 → `isListOperator` 控件切换 + `isIpOperator` placeholder 区分，职责分离
- [旧 NOT IN 无数据] DB 实测仅 `IN` 21 条、`NOT IN` 0 条 → 兼容分支保留 + 测试覆盖（防手写/未来数据）

## Migration Plan

无 DB 迁移。前端组件改动随路由表单发布；旧 vars 数据在编辑保存时自动升级为新格式。

## Open Questions

无（2026-08-07 方案二已确认）。
