## Context

磐石 Admin 当前没有内置开发者工具箱。用户配置 `pre_functions` 插件时需手动将 Lua 函数格式化为嵌入字符串（`"return function(conf, ctx) ... end"`），引号转义容易出错。SM4 加解密、URL/Base64 编解码等日常操作依赖外部工具（在线网站、Postman 等），频繁切换窗口效率低下。

项目技术栈：Vue 3 Composition API + TypeScript + Ant Design Vue + Vite。导航使用水平菜单（`DefaultLayout.vue`），无侧边栏二级菜单。后端 FastAPI + async SQLAlchemy。

## Goals / Non-Goals

**Goals:**
- 提供统一的工具箱页面，包含 5 个实用工具
- Lua 函数 ↔ 配置字符串互转，覆盖 `pre_functions` 插件的格式
- SM4 ECB + PKCS7 加解密与后端 EdgeClient 逻辑一致（同密钥 `a16bc20453da220f`）
- 工具函数模块化，`src/utils/tools/` 下独立组织，便于后续复用和测试
- 无需后端改动，全部纯前端实现

**Non-Goals:**
- 不在第一期做 Lua 编辑器的 PluginEditorDrawer 内联嵌入（留到第二期）
- 不增加后端 API
- 不引入外部 UI 组件库以外的依赖（SM4 自行实现）
- 不修改现有插件配置页面的行为

## Decisions

### 1. 工具页面外层导航：左侧图标栏 + 右侧工作区

- **选择**：`<a-layout-sider>` 实现窄图标侧边栏（类 VS Code / Postman），右侧全宽工作区按选中工具切换内容
- **理由**：
  - 空间利用率最高，图标栏仅占 ~56px，工作区不受 Tab 标签行挤占
  - 扩展性最好，未来增加工具只需加一个图标，不会折行或溢出
  - 视觉专业干净，符合开发者工具类产品的通用模式（DevToys、Postman、Chrome DevTools 均采用）
- **替代方案**：
  - `<a-tabs>` —— 5 个工具基本可用，但标签行始终占高度，工具多了会折行
  - 卡片网格 —— 适合「概览型」工具，SM4 / Lua 需要大编辑区，卡片空间不足
  - 独立路由 `/tools/lua` 等 —— 5 个工具不值得多级路由

### 2. 工具内部布局：统一左右双栏

- **选择**：所有 5 个工具统一采用左右双栏布局
- **理由**：
  - **交互一致性**：用户学会一个就会用全部。左边是「源」，右边是「目标」
  - **减少滚动**：纵向布局在内容长时需要来回滚；左右布局充分利用宽屏（1920px）
  - **对比直观**：SM4 密文 ↔ 明文、URL 编码前 ↔ 后、Lua 函数 ↔ 配置字符串，并排对比比上下对比效率高
- **行为约定**：
  - 双向工具（Lua / SM4 / Base64 / URL）：任一边输入，另一边自动或手动转换
  - 单向工具（JSON）：左边输入，右边只读输出；格式化/压缩按钮放在两栏之间

### 3. SM4 实现：纯 TypeScript 自行实现

- **选择**：参照 `backend/app/services/edge_client.py:86-103` 的 SM4 ECB + PKCS7 逻辑，用 TypeScript 实现
- **理由**：避免引入 `sm-crypto` 等第三方依赖，代码量小（SM4 约 200 行），可控性好
- **替代方案**：引入 `sm-crypto` npm 包 —— 增加依赖但减少开发量。考虑到后续可能需要调整算法细节（与 Edge 网关保持一致），自行实现更灵活

### 4. Lua 转换规则

- **Lua → 配置字符串**：用模板字符串包裹 `"return function(conf, ctx) ... end"`，将函数体内的 `\n` 转 `\\n`、双引号转 `\"`
- **配置字符串 → Lua**：去掉外层 `return function(conf, ctx)` 和 `end` 包裹，还原转义
- 两边各一个 `<a-textarea>`，输入即转换（watch 驱动的即时转换）

### 5. 工具函数组织

```
src/utils/tools/
  lua.ts        # luaToConfigString / configStringToLua
  sm4.ts        # SM4 ECB encrypt/decrypt with PKCS7
  base64.ts     # encode / decode（简单封装 btoa/atob）
  url.ts        # encodeURIComponent / decodeURIComponent 封装
  json.ts       # format / minify
```

每个工具函数纯函数，无副作用，便于单元测试。Vue 组件只负责 UI 和调用。

### 6. 菜单入口

- **选择**：在 `DefaultLayout.vue` 顶栏 `<a-menu>` 后追加 `工具箱` 菜单项，图标 `ToolOutlined`
- **理由**：和现有「仪表盘」「集群管理」「边缘节点」风格一致，无需改动布局结构

## Risks / Trade-offs

- **[风险] SM4 加解密与 Edge 网关不一致** → 严格参照 `backend/app/services/edge_client.py` 实现，使用相同默认密钥 `a16bc20453da220f`，加密后结果与后端对比验证
- **[风险] Lua 转换无法处理复杂嵌套引号** → 第一期只处理基础场景（双引号转义），遇 `[[]]` 多行字符串等边界情况，降级为用户手动修正
- **[权衡] 不做内联编辑器** → 用户需「复制 → 跳转工具箱 → 粘贴回插件页」，操作路径稍长。但第一期先快速交付独立工具，第二期再嵌入 PluginEditorDrawer，降低首期复杂度
- **[风险] 图标导航可发现性低** → 图标栏无文字标签，新用户需 hover 查看 tooltip 才能定位目标工具。通过为每个图标配置 `a-tooltip` 缓解，且 5 个图标数量少，认知负担可控
