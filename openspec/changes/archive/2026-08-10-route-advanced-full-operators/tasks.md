## 1. MatchOperator 类型扩展与运算符元数据（TDD）

- [x] 1.1 新增测试：`types` 中 `MatchOperator` 包含全部新增运算符（`==*`/`!=*`/`>=`/`<=`/`v>`/`v>=`/`v<`/`v<=`/`~~*`/`has`/`has*`/`in*`/`rx~`/`rx~*`），且不包含 `ipmatch` 与 `in`
- [x] 1.2 实现：扩展 `MatchOperator` 类型；组件内新增 `OPERATOR_GROUPS` 表驱动常量（分组 + 显示名）
- [x] 1.3 新增测试：`OPERATOR_GROUPS` 覆盖手册 1.1.1 全部运算符（除 ipmatch 别名与 in 重复项）且分组正确

## 2. 运算符下拉分组渲染（TDD）

- [x] 2.1 新增测试：模板渲染 8 个运算符分组（等于/不等于/数值/版本号/正则/IP/包含(列表)/组合），`~~*` 存在、`~*`/`ipmatch`/`in` 不存在
- [x] 2.2 实现：模板 operator `<a-select>` 改为按 `OPERATOR_GROUPS` 循环渲染 `<a-select-option-group>`

## 3. isListOperator / isIpOperator 扩展（TDD）

- [x] 3.1 新增测试：`isListOperator` 对 `in*`/`rx~`/`rx~*` 返回 true；`has`/`has*` 返回 **false**（单行输入）；单值运算符返回 false
- [x] 3.2 实现：扩展 `LIST_OPERATORS` 集合为 `['ip~', 'not_ip~', 'IN', 'NOT IN', 'in*', 'rx~', 'rx~*']`（ipmatch 因反序列化已归一化为 ip~，无需加入）

## 4. 序列化扩展（TDD）

- [x] 4.1 新增测试：`buildVarsFromRules` 单值运算符（`>=`/`v>=`/`==*`/`~~*`/`has`/`has*`）原样序列化
- [x] 4.2 新增测试：`buildVarsFromRules` 数组运算符（`in*`/`rx~`/`rx~*`）→ value 数组；非数组逗号拆分
- [x] 4.3 新增测试：`buildVarsFromRules` POST 参数规则 → `post_arg_` 前缀
- [x] 4.4 实现：`buildVarsFromRules` 数组运算符展开分支 + `post_arg_` 前缀

## 5. 反序列化扩展（TDD）

- [x] 5.1 新增测试：`parseRulesFromVars` `post_arg_` 前缀 → type=postarg，key 还原
- [x] 5.2 新增测试：`parseRulesFromVars` 旧 `postarg_` 前缀兼容 → type=postarg（DB 实测无数据，防御性）
- [x] 5.3 新增测试：`parseRulesFromVars` 旧 `~*` 运算符 → 映射为 `~~*` 规则（DB 实测无数据，防御性）
- [x] 5.4 新增测试：`parseRulesFromVars` `ipmatch` 别名 → 归一化为 `ip~` 规则（value 数组）
- [x] 5.5 新增测试：`parseRulesFromVars` 数组运算符（`rx~`/`rx~*`/`in*`）value 数组还原 + 逗号拆分
- [x] 5.6 实现：`deriveRuleType`/`deriveRuleKey` 增加 `post_arg_`（兼容 `postarg_`）前缀；`~*` → `~~*`、`ipmatch` → `ip~` 归一化；反序列化逗号拆分集合与 `LIST_OPERATORS` 一致

## 6. 回归验证

- [x] 6.1 现有测试全绿：`RouteAdvancedMatch.test.ts`（含 ip~/IN/NOT IN 回归）
- [x] 6.2 前端 vitest 全量 + `vue-tsc` + build 通过
- [x] 6.3 手动链路：创建含 `v>=`/`has`/`rx~`/`~~*` 条件路由 → vars 正确；has 单值、rx~ 数组形态正确

## 7. not_ip~ 下拉修复与操作符行内提示（评审确认，TDD）

- [x] 7.1 新增测试：`OPERATOR_GROUPS` IP 分组包含 `not_ip~`（2 个选项），模板渲染 IP 分组含「非 IP 匹配」
- [x] 7.2 实现：`OPERATOR_GROUPS` IP 分组补回 `not_ip~`；修复后现有 not_ip~ 序列化测试回归全绿
- [x] 7.3 新增测试：运算符元数据含说明文案（desc），选择 `v>=` 时条件行下方显示对应说明
- [x] 7.4 实现：`OPERATOR_GROUPS` operators 扩展为 `[op, label, desc]` 三元组；模板行内渲染当前 operator 说明

## 8. JSON 编辑双模式（评审确认，TDD）

- [x] 8.1 新增测试：开启 JSON 模式 → jsonText 为当前规则序列化 JSON（格式化）；表单区隐藏
- [x] 8.2 新增测试：关闭 JSON 模式且 JSON 合法 → 解析还原规则列表（含数组 value 运算符）
- [x] 8.3 新增测试：JSON 非法（非数组/非 3/4 元组）→ 提示错误且保持 JSON 模式
- [x] 8.4 实现：`jsonMode`/`jsonText` 状态、`ruleToJson`/`jsonToRules`、切换开关与校验逻辑

## 9. 回归验证（增量）

- [x] 9.1 `RouteAdvancedMatch.test.ts` 全绿（含 not_ip~/行内提示/JSON 模式）
- [x] 9.2 `vue-tsc` + build 通过
- [x] 9.3 手动链路：下拉含 not_ip~；选择 v>= 显示行内提示；JSON 模式切换与非法输入拦截

## 10. 下拉选项文本缩短 + tooltip（评审确认，TDD）

- [x] 10.1 新增测试：忽略大小写变体选项文本为短形式（「等于*」「正则*」「路径存在*」「存在*」），全部选项文本不超过 10 字
- [x] 10.2 新增测试：运算符元数据含 fullLabel 完整名（如「等于(忽略大小写)」），短选项 title 属性为完整名
- [x] 10.3 实现：OPERATOR_GROUPS 扩展为 `[op, shortLabel, fullLabel, desc]` 四元组；模板短 label 渲染 + `:title` tooltip + 下拉底部 `*` 说明
- [x] 10.4 回归：`vue-tsc` + build + `RouteAdvancedMatch.test.ts` 全绿
