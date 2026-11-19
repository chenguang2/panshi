# Design

## Decisions

- **D1 · 服务端过滤 = JSON 键精确 LIKE**：`PluginConfig.plugins` / `GlobalRule.plugins` 均为 TEXT 列存 JSON 对象（`{"<plugin_name>": <config>}`）。过滤条件 `LIKE '%"name":%'`（键的序列化形态固定为 `"name":`）——冒号后缀规避前缀串碰撞（`jwt-auth` 不命中 `jwt-auth-v2`）。SQLite/PG 双方言可移植（TEXT 上 LIKE 语义一致，#28 已核两方言序列化同构）。不做 json_each/JSON 函数：方言分叉成本高于收益，LIKE 精确键形态足够。
- **D2 · 过滤范围**：仅两个**全局跨集群列表端点**（`GET /plugin_configs`、`GET /global_rules`）——即插件开关「查看引用」的目标面与两卡片页数据源。集群作用域列表（统一管理 Tab）不接入（Tab 无插件筛选需求，避免面扩散）。
- **D3 · 下拉选项源**（落地修订 2026-11-19）：`GET /plugins/builtin`（与 RouteList「全部插件」同源；**不带 all=1**——遵循开关双层过滤语义，禁用的插件不出现在筛选下拉，用户不可能在"查看引用"语境下需要筛一个已禁用插件的引用……修正：**带 all=1**。理由：禁用插件的既有引用恰恰是「查看引用」的高频场景（禁用被引用插件的警示文案直接指向这里），选项集应含禁用插件。与 RouteList 选项源不同构属有意差异，在代码注释注明）。**落地发现**：`all=1` 也绕不开
  features.yaml `enabled_plugins` 白名单（部署级契约硬上限，api/plugins.py Layer 1）——历史引用的插件可能不在部署契约内，深链预选会因「值无匹配 option」下拉空白（约束 #204）；故选项集在加载后**追加深链值兜底**（裸名选项，display 回落标识名）。
- **D4 · 深链语义迁移**：`?plugin=<name>` 深链保留，从「客户端行过滤」改为「预选下拉」（下拉 change 已有的加载链路自然带上参数）。批 7A 的 `matchPluginRef` 客户端过滤与 `pluginRefFilter` 退场。路由腿（`/routes?plugin=`）不动。
- **D5 · 参数语义**：`plugin` 参数缺省不过滤（全量）；空串不过滤；非法值（不存在的插件名）→ 空结果集（与其它筛选参数同语义，不 400）。
- **D6 · 计数口径**：chips「全部 N」= 过滤后服务器 total（与分页列表页一致）；「已启用/已禁用」等状态档计数基于已加载行（两页为全量卡片页，page_size=CARD_GRID 上限内与其它全量页同口径）。

## Risks

- **R1 · LIKE 转义**：插件名含 `%`/`_` 的理论可能（当前目录全为标识符，不含）——实现仍对 name 做 LIKE 转义（`\%`/`\_`），防御未来目录变化。
- **R2 · plugins 列为 NULL/空串**：直接不命中过滤（NULL 行在选了插件时不出现在结果里，语义正确：未挂任何插件的资源不算引用）。

## MEASURABLE OUTCOMES

- 两端点 `?plugin=` 精确过滤（前缀碰撞用例钉死：`jwt-auth` 不命中 `jwt-auth-v2` 的引用行）
- 两页工具条常驻「插件」下拉，选择后请求带 `plugin=`；`?plugin=` 深链预选下拉
- 全量回归 + `openspec validate --all` 0 error
