## 1. 修改核心转换函数

- [x] 1.1 修改 `luaToConfigString`：去掉 PREFIX/SUFFIX 包裹，直接 JSON.stringify 输入
- [x] 1.2 修改 `configStringToLua`：JSON.parse 后先尝试新版格式（直接返回），检测到旧版外壳格式时 fallback 剥离
- [x] 1.3 删除不再需要的 `PREFIX` 和 `SUFFIX` 常量

## 2. 更新 UI 显示

- [x] 2.1 更新 Tools.vue 中 Lua 输入框的 placeholder 文字，提示输入完整函数定义

## 3. 验证

- [x] 3.1 LSP 诊断检查修改后的文件无类型错误
- [x] 3.2 前端构建成功（54 个测试全部通过）
