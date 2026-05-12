## 1. 工具函数模块

- [x] 1.1 创建 `src/utils/tools/` 目录结构
- [x] 1.2 实现 `lua.ts` —— `luaToConfigString()` 和 `configStringToLua()` 互转函数
- [x] 1.3 实现 `base64.ts` —— `encode()` / `decode()` 封装
- [x] 1.4 实现 `url.ts` —— `encode()` / `decode()` 封装
- [x] 1.5 实现 `json.ts` —— `format()` / `minify()` 函数
- [x] 1.6 实现 `sm4.ts` —— SM4 ECB 加解密 + PKCS7 填充，参照 `backend/app/services/edge_client.py:86-103`

## 2. 工具箱页面

- [x] 2.1 创建 `src/views/Tools.vue` 页面组件：左侧 `<a-layout-sider>` 图标栏（5 个图标 + tooltip）+ 右侧工作区（根据选中工具切换内容）
- [x] 2.2 Lua 互转：左右双 `<a-textarea>`，左边写函数右边出字符串，watch 驱动双向实时转换
- [x] 2.3 URL 编解码：左右双 `<a-textarea>`，按钮在中间，编码/解码后填入对侧
- [x] 2.4 JSON 格式化：左右双 `<a-textarea>`，按钮在中间，格式化/压缩后右侧只读显示；解析失败显示错误
- [x] 2.5 SM4 加解密：顶部 `<a-input-password>` 密钥框（默认值预填），左右双 `<a-textarea>`，按钮在中间
- [x] 2.6 Base64 编解码：左右双 `<a-textarea>`，按钮在中间，编码/解码后填入对侧

## 3. 路由与导航

- [x] 3.1 在 `src/router/index.ts` 注册 `/tools` 路由
- [x] 3.2 在 `src/views/DefaultLayout.vue` 顶栏菜单添加「工具箱」入口（`ToolOutlined` 图标）

## 4. 验证

- [x] 4.1 运行前端 build 确保无类型错误和编译错误
- [x] 4.2 手动测试 5 个工具 Tab 功能正确
- [x] 4.3 验证 SM4 加密结果与后端 Python 实现一致
