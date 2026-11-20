# plugin-ref-filter Specification

## Purpose
TBD - created by archiving change plugin-ref-filter. Update Purpose after archive.

## Requirements

### Requirement: 插件组全局列表按插件引用服务端过滤

`GET /plugin_configs` SHALL 支持 `plugin` 查询参数：仅返回 `plugins` JSON 内包含该插件**键**的资源（键序列化形态 `"name":` 精确匹配，非子串）；`plugin` 缺省/空串时不过滤；过滤 SHALL 在 SQL 层完成（TEXT LIKE，SQLite/PG 双方言一致），插件名 SHALL 做 LIKE 转义。

#### Scenario: 精确键过滤

- **WHEN** 存在引用 `cors` 的插件组 A、引用 `jwt-auth-v2` 的插件组 B，以 `plugin=cors` 查询
- **THEN** 结果仅含 A（SHALL NOT 因前缀串命中 B）

#### Scenario: 未挂插件资源不命中

- **WHEN** 以 `plugin=cors` 查询且存在 `plugins` 为空的插件组 C
- **THEN** C SHALL NOT 出现在结果中

#### Scenario: 缺省全量

- **WHEN** 不带 `plugin` 参数查询
- **THEN** 返回全量（现有行为不变）

### Requirement: 全局规则全局列表按插件引用服务端过滤

`GET /global_rules` SHALL 支持同款 `plugin` 查询参数与过滤语义（`plugins` JSON 键精确匹配）。

#### Scenario: 全局规则精确过滤

- **WHEN** 以 `plugin=<name>` 查询全局规则
- **THEN** 仅返回 `plugins` JSON 含该插件键的规则

### Requirement: 两页常驻「插件」下拉与深链预选

插件组页与全局规则页工具条 SHALL 提供常驻「全部插件」下拉（选项 = `GET /plugins/builtin?all=1`，含已禁用插件——禁用插件的既有引用是「查看引用」高频场景）；选择后 SHALL 随请求下发 `plugin` 参数（服务端过滤）。`?plugin=<name>` 深链 SHALL 预选该下拉。下拉的值 SHALL 与后端参数语义一致（插件标识名，非显示名）。批 7A 的客户端行过滤 SHALL 退场。

#### Scenario: 下拉选择后请求带参

- **WHEN** 用户在插件组页「插件」下拉选择某插件
- **THEN** 列表请求携带 `plugin=<标识名>` 且结果为服务端过滤后的集合

#### Scenario: 深链预选下拉

- **WHEN** 经插件开关页「查看引用（插件组 N）」进入 `/plugin-configs?plugin=<name>`
- **THEN** 「插件」下拉预选为该插件，列表按服务端过滤展示

#### Scenario: 客户端过滤退场

- **WHEN** 该变更合入后检查两页源码
- **THEN** SHALL NOT 再存在 `matchPluginRef` 客户端过滤实现
