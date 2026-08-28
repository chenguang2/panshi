## 1. 后端：解析容忍行尾制表符

- [x] 1.1 写失败测试：`parse_inventory` 对含行尾制表符的输入应成功解析（RED）
- [x] 1.2 实现：`parse_inventory` 解析前剥离每行行尾空白（`line.rstrip()`）
- [x] 1.3 验证：制表符容忍测试通过；引号内制表符不受影响；`raw_text` 原文保真

## 2. 后端：GET 返回解析错误

- [x] 2.1 写失败测试：文件存在但解析失败时 GET 返回 `errors`；缺失文件返回 `errors: []`（RED）
- [x] 2.2 实现：`_read_raw_text` 返回 `(text, exists)` 元组；`get_inventory` 响应新增 `errors` 字段，文件不存在时置空
- [x] 2.3 验证：API 测试通过；全量后端测试无回归（1381 passed）

## 3. 前端：展示解析错误

- [x] 3.1 `InventoryData` 类型新增 `errors: string[]`
- [x] 3.2 页面加载到错误时展示红色错误条（含具体错误信息）
- [x] 3.3 解析失败时强制进入源码视图，展示真实文件内容供修复
- [x] 3.4 验证：前端构建通过；E2E 链路测试通过；无新增 TS 错误

## 4. 文档同步

- [x] 4.1 创建 openspec change 工件（proposal / design / specs / tasks）