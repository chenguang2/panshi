# Tasks

## 1. 后端服务端过滤

- [x] 1.1 `GET /plugin_configs` / `GET /global_rules` 新增 `plugin` 查询参数：`plugins` TEXT LIKE `'%"<name>":%'`（键精确形态 + LIKE 转义防御 `%`/`_`）；缺省不过滤（D5）
- [x] 1.2 后端测试：精确键过滤（jwt-auth vs jwt-auth-v2 前缀碰撞钉死）、空 plugins 不命中、缺省全量；两端点同款（parametrize）
- [x] 1.3 PG 方言冒烟随批跑一次（读路径新增，非强制项但收口）

## 2. 前端常驻下拉 + 深链迁移

- [x] 2.1 插件组页 / 全局规则页工具条新增「插件」下拉（选项 = `/plugins/builtin?all=1`，含已禁用；D3 注明与 RouteList 选项源差异的理由）；选择 → 请求带 `plugin=`
- [x] 2.2 `?plugin=` 深链改预选下拉（服务端过滤）；批 7A `matchPluginRef`/`pluginRefFilter` 客户端过滤退场
- [x] 2.3 测试：选择后请求带 `plugin=`（#85⑤ 三要件）；深链预选；旧客户端过滤断言反转

## 3. 守卫与收口

- [x] 3.1 mockupParity 增段：两页下拉接线（值语义 = 标识名、请求断言、客户端过滤禁回潮）
- [x] 3.2 全量回归 + `openspec validate --all` 收口；真机验收：插件开关「查看引用（插件组/全局规则）」→ 下拉预选 + 列表命中

> 落地记录（2026-11-19）：后端两全局端点 plugin 参数（LIKE '"name":' 键精确 + 转义；plugin_ref_like_pattern 落 plugin_config_refs 单点），测试 8 例（前缀碰撞/空 plugins/缺省全量/未知名空集，两端点 parametrize）；PG 冒烟 11 passed。前端两页常驻「插件」下拉（选项 = builtin?all=1 含已禁用，D3）+ 深链预选（发现 all=1 绕不开 features.yaml 白名单硬上限 → 深链值兜底追加选项，#204；design D3 已补落地修订）；批 7A matchPluginRef 退场。mockupParity 两段守卫（接线三要件 + 客户端过滤禁回潮）。全量 3091 passed（2 例 #58 波动隔离复跑绿）；真机：下拉选 proxy_rewrite → 请求带参 1 卡命中 global_comm；深链 jwt-auth（白名单外）预选正常。
