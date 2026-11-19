# Proposal

## Why

插件开关页「查看引用」的插件组腿与全局规则腿目前是**客户端行过滤深链**（批 7 bug4A 临时方案）：页面加载后才在前端按 plugins JSON 键过滤行，过滤不进请求、不留痕、换筛选/翻页即失效，且与路由腿（`/routes?plugin=` 服务端过滤 + 常驻「全部插件」下拉）不同构。插件组与全局规则两页需要一个**常驻「插件」下拉 + 服务端过滤**，三腿体验对齐（AGENTS #85：优先服务端过滤）。

## What Changes

- 后端 `GET /plugin_configs`、`GET /global_rules`（全局跨集群列表端点）新增 `plugin` 查询参数：按资源 `plugins` JSON 内是否含该插件**键**过滤（序列化形态 `"name":` 精确匹配，规避 jwt-auth / jwt-auth-v2 前缀串碰撞）
- 前端插件组 / 全局规则两页工具条新增常驻「插件」下拉（选项源 = `/plugins/builtin`，与路由页「全部插件」同源），选择后随请求下发 `plugin` 参数
- 批 7A 的客户端行过滤（`matchPluginRef`）退场：`?plugin=` 深链改为预选下拉（走服务端过滤），深链行为不变（「查看引用」出口零改动）
- 路由页已有服务端过滤不动；插件开关页自身不动
- 过滤作用于计数口径：状态 chips 的「全部 N」与下拉联动（与既有分页列表页口径一致）

## Capabilities

### New Capabilities

- `plugin-ref-filter`: 插件引用跨页过滤——插件组 / 全局规则全局列表端点按插件引用键做服务端过滤，页面工具条提供常驻「插件」下拉，深链 `?plugin=` 预选下拉

### Modified Capabilities

（无——两列表端点的既有规格（plugin-config-publish-status 等）描述发布状态语义，不涉及引用过滤；本变更为新增查询能力）

## Impact

- 改动文件：后端 2 个全局列表端点 + 前端 2 个卡片页 + 共享解析（无 schema/迁移/写库路径变更，PG 冒烟非强制但随批跑一次收口）
- 过滤实现：LIKE `'%"<name>":%'`（TEXT 列 JSON 键精确形态），SQLite/PG 双方言可移植（#28 序列化一致性已核）
- 风险：plugin 名为标识符、JSON 键序列化带冒号，误匹配概率极低；测试用前缀碰撞用例钉死
