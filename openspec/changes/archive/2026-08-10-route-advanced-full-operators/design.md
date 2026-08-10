## Context

路由高级匹配（`frontend/src/components/RouteAdvancedMatch.vue`）已支持 `ip~`/`not_ip~`（change `route-advanced-ip-range`）与 `IN`/`NOT IN`（change `route-advanced-in-notin-tags`），实现了标签输入与 3/4 元组序列化。当前 `MatchOperator` 类型仅含 10 个运算符，与 Edge 手册 §8.1.1 的完整运算符集合相比缺失 12 个；且存在两处与手册不一致：

1. `~*` 被误标为"大小写敏感正则"——手册无此运算符，手册的忽略大小写正则是 `~~*`
2. POST 参数前缀用 `postarg_`——手册 §9 为 `post_arg_*`

用户已确认采用**方案 A**：只补齐运算符全集，保持扁平结构（不引入 AND/OR 逻辑嵌套），并修正上述两处不一致。

## Goals / Non-Goals

**Goals:**
- `MatchOperator` 扩展到手册 1.1.1 全集（22 个运算符 + IN/NOT IN 前端语义）
- 数组类运算符（`has`/`in`/`ip~`/`rx~` 及 `*` 变体）统一标签输入
- `~~*` 语义修正 + 旧 `~*` 数据兼容读取
- `post_arg_` 前缀对齐 + 旧 `postarg_` 数据兼容读取与升级
- 反序列化兼容所有新旧格式

**Non-Goals:**
- 逻辑运算符（AND/OR/!AND/!OR）与嵌套表达式——后续变更（方案 B/C）
- 通用 `!` 取反前缀（4 元组）扩展到任意运算符——仅保留现有 `!ip~`/`!in` 取反
- 后端 schema 修改（`vars: List[List[Any]]` 扁平结构不变）
- `rx~`/`in*` 等忽略大小写变体的 UI 特殊标注（与普通运算符一致处理）

## Decisions

### Decision 1: 运算符全集映射表驱动（与 ip~/IN 对称）

运算符元数据用常量表驱动，每个运算符声明类别、值类型（单值/数组）、显示名：

```ts
const OPERATOR_GROUPS = [
  { label: '等于', operators: [['==', '等于'], ['==*', '等于(忽略大小写)']] },
  { label: '不等于', operators: [['!=', '不等于'], ['!=*', '不等于(忽略大小写)']] },
  { label: '数值', operators: [['>', '大于'], ['>=', '大于等于'], ['<', '小于'], ['<=', '小于等于']] },
  { label: '版本号', operators: [['v>', '版本大于'], ['v>=', '版本大于等于'], ['v<', '版本小于'], ['v<=', '版本小于等于']] },
  { label: '正则', operators: [['~~', '正则匹配'], ['~~*', '正则匹配(忽略大小写)']] },
  { label: 'IP', operators: [['ip~', 'IP 匹配']] },
  { label: '包含(列表)', operators: [['has', '包含'], ['has*', '包含(忽略大小写)'], ['rx~', '路径存在'], ['rx~*', '路径存在(忽略大小写)'], ['in*', '存在(忽略大小写)']] },
  { label: '组合', operators: [['IN', '包含(组合)'], ['NOT IN', '不包含(组合)']] },
]
```

**备选**：硬编码模板 if-else——否决，运算符已达 23 个，表驱动便于分组渲染与扩展。

**注（评审确认 2026-08-07）**：
- `ipmatch` 不列入分组——`ip~` 的别名，仅反序列化兼容读取并归一化为 `ip~`
- `has`/`has*` 为**单值输入**（手册语义：左值数组包含右值单值，示例 `["custom_names", "has", "user1"]`），**不是**标签输入——与 `in`（右值数组）语义方向相反
- `in`（手册右值数组）不单独展示——与 `IN`（组合）序列化完全相同（`[key,"in",[list]]`），UI 避免重复；仅新增 `in*`（忽略大小写）

### Decision 2: `MatchOperator` 类型扩展 + 内部规范形式

`MatchOperator` 扩展为手册运算符 + 前端语义运算符的并集：

```ts
export type MatchOperator =
  | '==' | '==*' | '!=' | '!=*' | '>' | '>=' | '<' | '<=' 
  | 'v>' | 'v>=' | 'v<' | 'v<='
  | '~~' | '~~*'
  | 'ip~' | 'not_ip~'
  | 'has' | 'has*' | 'in*' | 'rx~' | 'rx~*'
  | 'IN' | 'NOT IN'
```

内部规则用**规范形式**（`in` 统一为 `IN`、`~~*` 修正映射），序列化时按 Edge 格式输出：
- `IN`（UI）→ `in`（Edge）；`NOT IN`（UI）→ `["!","in"]` 4 元组
- 其余运算符原样透传

**注（评审确认 2026-08-07）**：`ipmatch` 不进入 `MatchOperator` 类型——反序列化时若遇到 `ipmatch` 直接归一化为 `ip~` 规则（类型层面无需表示）；`in`（手册右值数组）也不在类型中——由 `IN` 覆盖。

### Decision 3: `isListOperator` 扩展覆盖数组类运算符

```ts
const LIST_OPERATORS = new Set(['ip~', 'not_ip~', 'IN', 'NOT IN', 'in*', 'rx~', 'rx~*'])
```

`rx~`/`rx~*`/`in*` 与 `ip~`/`IN` 一样使用标签输入（value 数组）；placeholder 用 `isIpOperator` 区分 IP 提示与通用提示。

**注（评审确认 2026-08-07）**：
- `has`/`has*` **不在** `LIST_OPERATORS` 中——手册语义为左值数组包含右值单值，右值是**单值输入**（与 `in` 的右值数组方向相反）
- `ipmatch` 因反序列化已归一化为 `ip~`，无需加入集合
- 反序列化时逗号拆分集合与 `LIST_OPERATORS` 一致（见 Decision 5），确保数组 value 正确还原

### Decision 4: 序列化展开表驱动

`buildVarsFromRules` 的展开逻辑扩展为：

```ts
if (operator === 'ip~') → [key, 'ip~', arr]
else if (operator === 'not_ip~') → [key, '!', 'ip~', arr]
else if (operator === 'IN') → [key, 'in', arr]
else if (operator === 'NOT IN') → [key, '!', 'in', arr]
else if (LIST_ARRAY_OPERATORS.has(operator)) → [key, operator, arr]  // in*/rx~/rx~*
else → [key, operator, value]  // 单值运算符原样（含 has/has*）
```

数组运算符（`in*`/`rx~`/`rx~*`）value 非数组时逗号拆分（与现有 IN/ip~ 行为一致）；`has`/`has*` 走单值分支原样透传；`ipmatch` 无需序列化分支（内部已归一化为 `ip~`）。

### Decision 5: 反序列化前缀推导对齐手册

`deriveRuleType` 增加 `post_arg_` 前缀（→ postarg），并兼容旧 `postarg_`：

```ts
if (varName.startsWith('post_arg_')) return 'postarg'
if (varName.startsWith('postarg_')) return 'postarg'  // 旧数据兼容
```

`deriveRuleKey` 对应剥离 `post_arg_` 或 `postarg_` 前缀。运算符归一化映射（反序列化时）：
- `~*` → `~~*`（旧数据语义修正）
- `ipmatch` → `ip~`（别名归一化）
- 反序列化逗号拆分集合与 `LIST_OPERATORS` 一致：`ip~`/`not_ip~`/`in`/`IN`/`NOT IN`/`in*`/`rx~`/`rx~*`（value 非数组时逗号拆分；`not_ip~` 4 元组非数组按单元素数组处理）

**注（评审确认 2026-08-07）**：DB 实测 `~*` 与 `postarg_` 数据均为 **0 条**，兼容分支为**防御性代码**（防手写/未来数据），与已归档的 `IN` 旧数据兼容同理。

**备选**：不兼容旧 `postarg_`——否决，DB 已有数据（前端手动验证创建过 postarg 规则），需平滑升级。

### Decision 6: 4 元组取反仅限 ip~/in（保持现状）

4 元组 `[key, "!", op, value]` 前置判断仅识别 `ip~`/`in`（现行为），不扩展到 `has`/`rx~`/`in*` 等其他数组运算符——手册的通用 `!` 取反属方案 B/C 范围。

### Decision 7: 修复 `not_ip~` 下拉缺失（评审确认）

`OPERATOR_GROUPS` 的 IP 分组补回 `not_ip~`：

```ts
{ label: 'IP', operators: [['ip~', 'IP 匹配'], ['not_ip~', '非 IP 匹配']] },
```

`not_ip~` 在 `MatchOperator` 类型、`LIST_OPERATORS`、序列化展开（4 元组 `[key,"!","ip~",arr]`）均已支持，仅 UI 分组遗漏导致无法选择——本次补齐，并新增测试断言 IP 分组含 2 个选项。

### Decision 8: 操作符行内动态提示（评审确认）

每个运算符在元数据中声明说明文案（语义 + 示例），条件行下方随操作符切换实时显示：

```ts
type OperatorMeta = { op: MatchOperator; label: string; desc: string }
// 例：{ op: 'v>=', label: '版本大于等于', desc: '版本号比较：http_appv v>= 1.2.3' }
```

`OPERATOR_GROUPS` 的 operators 项扩展为 `[op, label, desc]` 三元组；模板在规则行下方渲染当前 operator 的 desc（`OPERATOR_DESC[rule.operator]` 查找）。无说明的运算符（如默认 `==`）显示通用提示或不显示。

### Decision 8a: 下拉选项文本缩短 + tooltip 兜底（评审确认）

忽略大小写变体的完整 label（如「等于(忽略大小写)」）长达 13-16 字，160px 下拉显示不全。采用方案 A + D：

- **选项文本缩短**：忽略大小写变体的 label 统一为「中文 + `*` 后缀」短形式（如「等于*」「正则*」「路径存在*」「存在*」）——`*` 与手册「运算符中 * 表示忽略大小写」语义一致，下拉底部附一行说明
- **tooltip 兜底**：operators 元组扩展为 `[op, shortLabel, fullLabel, desc]` 四元组——shortLabel 渲染选项文本，fullLabel 作为 `<a-select-option :title>` 悬停提示（显示完整中文名），desc 保持行内提示

### Decision 9: JSON 编辑双模式（评审确认）

高级匹配页新增「JSON 编辑」切换开关，表单 ⇄ vars JSON 双向同步：

```ts
const jsonMode = ref(false)
const jsonText = ref('')
const ruleToJson = () => { jsonText.value = JSON.stringify(buildVarsFromRules(), null, 2) }
const jsonToRules = (): boolean => {
  try {
    const parsed = JSON.parse(jsonText.value)
    if (!Array.isArray(parsed)) throw new Error('必须是数组')
    for (const item of parsed) {
      if (!Array.isArray(item) || (item.length !== 3 && item.length !== 4)) throw new Error(`非法表达式: ${JSON.stringify(item)}`)
    }
    parseRulesFromVars(parsed)
    return true
  } catch (e) {
    return false  // 调用方展示具体错误，不切回表单
  }
}
```

- **开启 JSON 模式**：`jsonText` 初始化为当前 `buildVarsFromRules()` 的格式化 JSON；隐藏表单编辑区，显示只读预览 + 可编辑 JSON 文本区
- **关闭 JSON 模式**：严格校验后 `parseRulesFromVars(parsed)` 切回表单；非法 JSON/结构错误（非数组/非 3/4 元组）提示具体错误，保持 JSON 模式不切换
- **保存时**：以当前模式下的 vars 为准（JSON 模式直接用 `JSON.parse(jsonText)` 结果，失败则阻止保存）
- **同步策略**：表单模式编辑规则 → 开启 JSON 时用最新序列化结果；JSON 模式编辑 → 关闭时解析回表单，两模式单向切换保证一致性

**备选**：只读预览（不可编辑）——否决，无法覆盖复杂条件编辑诉求；折叠 JSON 区——否决，双态语义更清晰。

## Risks / Trade-offs

- [旧 `~*` 数据语义变化] 旧 `~*` 数据原本被当作"大小写敏感正则"展示，现映射为 `~~*`（忽略大小写）——语义变化，但手册无 `~*` 运算符，旧行为本就是 bug；DB 实测无此数据，纯防御性兼容
- [`postarg_` → `post_arg_` 前缀变更] 已发布路由 vars 前缀变化——反序列化兼容 + 编辑保存自动升级，Edge 端 `post_arg_` 为手册正确变量名，语义正确；DB 实测无 `postarg_` 数据，纯防御性兼容
- [`has`/`in` 语义方向相反] `has` 为左值数组包含右值单值（单值输入），`in` 为右值数组存在（标签输入）——UI 分组与 placeholder 需区分，测试覆盖两种输入形态
- [`in` 不单独展示] 手册 `in` 由 `IN`（组合）覆盖——序列化相同，仅 UI 层面合并避免重复
- [运算符下拉分组复杂度] 23 个运算符分组展示——表驱动渲染，测试覆盖分组数量
- [JSON 模式数据一致性] 表单 ⇄ JSON 双向切换可能丢失未保存编辑——切换时以当前模式序列化为准，JSON 解析严格校验防非法数据
- [JSON 严格校验] 仅校验数组结构与 3/4 元组长度——运算符合法性不深度校验（与表单一致，交由保存后端校验）

## Migration Plan

无 DB 迁移。前端组件改动随路由表单发布；旧 `postarg_`/`~*` 数据在编辑保存时自动升级为 `post_arg_`/`~~*`。

## Open Questions

无（2026-08-07 方案 A 已确认，`post_arg_*` 与 `~~*` 语义已确认按手册）。
