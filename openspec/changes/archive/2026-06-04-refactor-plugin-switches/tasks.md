## 1. 后端：插件定义补充字段

- [x] 1.1 plugin_definitions.py — 为每个插件补充 `display_name`、`category` 字段
- [x] 1.2 plugins.py — GET /plugins/builtin 返回新增字段，过滤逻辑改为无开关记录视为已启用

## 2. 后端：API 安全加固

- [x] 2.1 添加 `PluginSwitchItem` Pydantic schema，校验 plugin_name 合法性
- [x] 2.2 PUT /plugin-switches 改为事务包裹（async with db.begin()）+ 异常处理
- [x] 2.3 PUT /plugin-switches 保存时扫描被禁用插件的引用（routes/plugin_configs/global_rules），返回警告列表

## 3. 前端：PluginSwitches.vue 按 plugins.html 重写

- [x] 3.1 CSS Grid 卡片网格布局（auto-fill, minmax 320px）
- [x] 3.2 卡片结构：header(名称+分类标签) → desc → footer(plugin name + schema toggle + switch)
- [x] 3.3 分类筛选 pill 行（从 category 字段动态生成）
- [x] 3.4 搜索输入框（按 display_name/name 实时过滤）
- [x] 3.5 状态下拉框（全部/已启用/已禁用）+ "共 N 个插件"计数
- [x] 3.6 Schema 预览（点击"⚙ schema"展开/收起 JSON schema）
- [x] 3.7 状态栏 + 批量操作 + 未保存检测 + 保存按钮 + beforeRouteLeave
- [x] 3.8 页面加载时从 GET /plugin-switches + GET /plugins/builtin 获取数据

## 4. 前端：PluginSelector 适配

- [x] 4.1 PluginSelector 改为消费后端返回的 `category` 字段分类（移除硬编码 CATEGORIES）
- [x] 4.2 PluginSelector 优先显示 `display_name`，fallback 到 `name`

## 5. 验证

- [x] 5.1 后端测试全部通过
- [x] 5.2 前端测试全部通过
- [x] 5.3 手动验证：网格布局、筛选、搜索、schema 预览、保存、引用警告
