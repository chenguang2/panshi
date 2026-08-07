## 1. 序列化修正（TDD）

- [ ] 1.1 新增测试：`buildVarsFromRules` IN 规则（value 数组）→ `[key, "in", [list]]`（小写）
- [ ] 1.2 新增测试：`buildVarsFromRules` NOT IN 规则（value 数组）→ 4 元组 `[key, "!", "in", [list]]`
- [ ] 1.3 新增测试：IN/NOT IN value 非数组（旧 string 输入残留）→ 逗号拆分后序列化
- [ ] 1.4 实现 `buildVarsFromRules` 的 IN/NOT IN 分支（`in`/`!in`），测试 GREEN

## 2. 反序列化兼容（TDD）

- [ ] 2.1 新增测试：`parseRulesFromVars` 3 元组 `["arg_name","in",[list]]` → IN 规则（value 数组，type=query）
- [ ] 2.2 新增测试：4 元组 `["arg_name","!","in",[list]]` → NOT IN 规则（前置判断不错解）
- [ ] 2.3 新增测试：旧格式 `["arg_name","IN","a,b"]` → IN 规则（逗号拆）
- [ ] 2.4 新增测试：旧格式 `["arg_name","NOT IN","a,b"]` → NOT IN 规则（逗号拆）
- [ ] 2.5 实现 `parseRulesFromVars` 的 in 分支与前置判断，测试 GREEN

## 3. deriveRuleType 提取与 4 元组 type 修复（评审确认）

- [ ] 3.1 新增测试：`deriveRuleType` 对 `arg_`/`http_`/`postarg_`/`cookie_`/无前缀返回正确 type
- [ ] 3.2 新增测试：**现有 ip~ 4 元组 bug 修复**——`["http_x_real_ip","!","ip~",[list]]` → type=header（非 builtin）
- [ ] 3.3 新增测试：`["http_x_real_ip","!","in",[list]]` → NOT IN 规则 type=header
- [ ] 3.4 重构 `parseRulesFromVars` 3 元组与 4 元组分支复用 `deriveRuleType`，测试 GREEN（含现有 ip~ 测试回归）

## 4. isListOperator/isIpOperator 职责分离（评审确认）

- [ ] 4.1 新增测试：`isListOperator` 对 `ip~`/`not_ip~`/`IN`/`NOT IN` 返回 true，单值操作符返回 false
- [ ] 4.2 回归测试：`isIpOperator('ip~')` true、`isIpOperator('IN')` false（现有断言不破）
- [ ] 4.3 实现：模板 value 控件用 `isListOperator` 切换标签/单输入，placeholder 用 `isIpOperator` 区分，测试 GREEN

## 5. 回归验证

- [ ] 5.1 现有测试全绿：`RouteAdvancedMatch.test.ts`（含 ip~ 与单值操作符回归）
- [ ] 5.2 前端 vitest 全量 + `vue-tsc` + build 通过
- [ ] 5.3 手动链路：创建含 IN/NOT IN 条件路由 → vars 为 `in`/`!in` 数组格式；编辑回显；旧 `IN` 字符串数据编辑升级
- [ ] 5.4 确认 DB 旧数据（route 42/71，`IN` 21 条）反序列化兼容；`in*` 未引入（本次不做）
