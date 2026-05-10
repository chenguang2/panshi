## 1. 类型定义

- [ ] 1.1 在 `types/index.ts` 中添加 `MatchRuleType` 联合类型
- [ ] 1.2 在 `types/index.ts` 中添加 `MatchOperator` 联合类型
- [ ] 1.3 在 `types/index.ts` 中添加 `MatchRule` 接口

## 2. 组件逻辑修改

- [ ] 2.1 修改参数类型下拉选项：移除"客户端IP"，添加"POST参数"和"内置参数"
- [ ] 2.2 修改运算符下拉选项：8种运算符
- [ ] 2.3 更新 `buildVarsFromRules()` 处理 `postarg_` 前缀和无前缀内置参数
- [ ] 2.4 更新 `parseRulesFromVars()` 解析 `postarg_` 和内置参数类型
- [ ] 2.5 更新 `getKeyPlaceholder()` 返回内置参数的占位符提示

## 3. 单元测试

- [ ] 3.1 编写 `parseRulesFromVars` 测试用例（POST参数、内置参数解析）
- [ ] 3.2 编写 `getKeyPlaceholder` 测试用例
- [ ] 3.3 编写 `addRule/removeRule` 测试用例
- [ ] 3.4 编写 `handleTypeChange` 测试用例（切换类型时清空输入）
- [ ] 3.5 编写 `buildVarsFromRules` 测试用例（完整 vars 构建）
- [ ] 3.6 运行所有测试确保通过

## 4. 构建验证

- [ ] 4.1 运行 `npm run build` 确保构建成功
- [ ] 4.2 检查是否有新增的 TypeScript 错误
