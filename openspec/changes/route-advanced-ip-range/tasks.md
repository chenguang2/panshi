## 1. 类型与操作符（TDD）

- [ ] 1.1 `types/index.ts`：`MatchOperator` 扩展 `ip~`/`not_ip~`；`MatchRule.value` 放宽为 `string | string[]`；`Route.vars` 放宽为 `[string, string, string | string[]][]`
- [ ] 1.2 `RouteAdvancedMatch.vue`：操作符下拉新增「IP 匹配（ip~）」「非 IP 匹配（not_ip~）」

## 2. 序列化与反序列化（TDD）

- [ ] 2.1 新增测试：`buildVarsFromRules` ip~ 规则 → 3 元组 `[key, "ip~", [list]]`
- [ ] 2.2 新增测试：`buildVarsFromRules` not_ip~ 规则 → 4 元组 `[key, "!", "ip~", [list]]`
- [ ] 2.3 新增测试：`parseRulesFromVars` 3 元组 `ip~` → ip~ 规则；4 元组 `!` 取反 → not_ip~ 规则；value 为数组
- [ ] 2.4 新增测试：**4 元组前置判断**——`["remote_addr", "!", "ip~", [list]]` 不被固定 3 元组解构错解（operator 不为 `!`、value 不为 `ip~`）
- [ ] 2.5 新增测试：旧数据兼容——3 元组 ip~ value 非数组按逗号拆分；4 元组 `v[3]` 非数组拆分为单元素数组 `[v[3]]`
- [ ] 2.6 新增测试：`parseRulesFromVars` 参数类型放宽为 `(string | string[])[][]`，4 元组可传入
- [ ] 2.7 实现 `buildVarsFromRules`/`parseRulesFromVars` 的 ip~ 分支，测试 GREEN

## 3. 标签输入控件

- [ ] 3.1 `RouteAdvancedMatch.vue`：`isIpOperator()` 判断，ip~/not_ip~ 时 value 切换为 `a-select mode="tags"`（含 placeholder 提示 IP/CIDR）；不限定变量类型（header/query/postarg/cookie/builtin 均可搭配）
- [ ] 3.2 新增测试：标签输入添加多个 IP/CIDR → value 数组；切换操作符控件切换

## 4. 回归验证

- [ ] 4.1 现有 8 操作符测试全绿（`RouteAdvancedMatch.test.ts`），`IN`/`NOT IN` 行为不变（评审确认：不升级为标签输入）
- [ ] 4.2 前端 vitest 全量 + `vue-tsc` + build 通过
- [ ] 4.3 手动链路：路由表单添加 ip~ 条件（builtin remote_addr + header 自定义变量各一）→ 保存 → vars 为 3 元组数组；编辑回显 not_ip~ 4 元组
- [ ] 4.4 确认 `remote_addrs` 死字段未受影响（不涉及本次改动）
