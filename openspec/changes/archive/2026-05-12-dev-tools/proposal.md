## Why

当前 `pre_functions` 插件配置要求用户手动输入 Lua 函数转化后的字符串格式（`"return function(conf, ctx) ... end"`），编写体验差、容易出错。同时平台缺少日常开发调试常用的编解码工具（URL、Base64、JSON、SM4），用户需频繁切换到外部工具。提供一个内置工具箱可显著提升配置效率和开发体验。

## What Changes

- 顶部导航新增「工具箱」菜单入口
- 新增路由 `/tools`，展示工具页面
- 实现 5 个实用工具 Tab：
  - **Lua 函数 ↔ 配置字符串互转**：针对 `pre_functions` 插件格式，双向转换
  - **URL 编解码**：`encodeURIComponent` / `decodeURIComponent`
  - **JSON 格式化/压缩**：格式化美化 + 压缩为一行
  - **SM4 加解密**：ECB 模式 + PKCS7 填充，与 Edge 网关通信加密逻辑一致
  - **Base64 编解码**：标准 Base64 编解码

## Capabilities

### New Capabilities

- `dev-tools`: 开发者工具箱页面，提供 5 项实用工具的独立 UI 界面

### Modified Capabilities

（无——不修改任何现有功能的 spec 级别行为）

## Impact

- **前端**：新增 `src/views/Tools.vue`、`src/utils/tools/` 工具函数模块、路由配置、导航菜单项
- **后端**：无改动（SM4 加解密在前端纯 JS 实现，无需后端 API）
- **依赖**：SM4 加解密需引入 `sm-crypto` 或自行实现 SM4 ECB + PKCS7（推荐自行实现以保持轻量，逻辑参照 `backend/app/services/edge_client.py:86-103`）
