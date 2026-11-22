# page-header-stat-badges Specification

## Purpose
TBD - created by archiving change page-header-stat-badges. Update Purpose after archive.

## Requirements

### Requirement: 页头统计徽标只承载补充维度

页头统计徽标 SHALL 提供状态筛选 chips 之外的信息（分组数、节点数、目标数、域名数、插件数、引用处数、资源总量、证书过期数等）。
当页面已用 chips 展示总数（「全部 N」）时，页头徽标 SHALL NOT 重复该总数。
每页徽标 SHALL 至多两枚，首枚为主统计（accent）。

#### Scenario: 不重复 chips 总数

- **WHEN** 页面状态行显示「全部 N」
- **THEN** 页头徽标不出现同一个「N 个资源」总数，而是给出另一维度

#### Scenario: 无合适维度时不出徽标

- **WHEN** 页面的数字已在页内统计卡中完整呈现
- **THEN** 该页不放页头徽标

### Requirement: 页头徽标与设计页一一对应

设计页 `proposal-c/*.html` 页头有统计徽标（`.ph-inline`）的页面，实现 SHALL 渲染 `PageStatBadges`；设计页没有的，实现 SHALL NOT 渲染。
新增或移除徽标时 SHALL 同步修改设计页与实现两侧。

#### Scenario: 设计页有徽标实现必须有

- **WHEN** 某设计页标题旁存在 `.ph-inline` 胶囊
- **THEN** 对应页面视图渲染 `PageStatBadges` 且 `headerStatItems` 非空

#### Scenario: 概览页不放徽标

- **WHEN** 渲染概览页
- **THEN** 页头不显示统计徽标（数字由页内统计卡承担）

### Requirement: 徽标数据如实、缺数据即降级

徽标数值 SHALL 取自当前已加载数据集或既有聚合端点，SHALL NOT 为缺失字段编造数值。
维度不可得（字段为空、证书解析失败、总量为 0）时 SHALL 省略该枚徽标或显示 `—`，不得显示 0 冒充真实值。

#### Scenario: 证书解析失败不计入过期统计

- **WHEN** 某证书 `expire_days` 为 null
- **THEN** 该证书不计入「即将过期 / 已过期」计数

#### Scenario: 资源总量为 0

- **WHEN** 当前数据集没有任何静态资源文件大小
- **THEN** 「总量」徽标显示 `—` 而非 `0 B`
