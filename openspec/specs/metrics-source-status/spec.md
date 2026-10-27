# metrics-source-status

## Purpose

在指标页面暴露 ClickHouse 数据源的可用性：数据源不可达时以横幅明示并引导到配置页，避免「无数据」与「取不到数据」混淆。

## Requirements

### Requirement: 指标页数据源不可用横幅

指标查询的 summary 响应 SHALL 携带 `source_ok` 布尔值（数据源连接级可用性，取自指标查询的实际执行结果，与用户可见数据同源）；`source_ok` 为 false 时，指标总览页与指标查询页 SHALL 在页面顶部展示横幅：说明「指标数据源不可用：无法连接 ClickHouse（{host}:{port}）」并提供跳转「ClickHouse 配置」页的链接；`source_ok` 为 true 时 MUST NOT 展示横幅。

#### Scenario: 数据源不可达时横幅出现
- **GIVEN** 激活 ClickHouse 连接不可达（查询返回空结果而非错误）
- **WHEN** 用户进入指标总览页或指标查询页
- **THEN** 页面顶部 SHALL 展示数据源不可用横幅与跳转链接
- **AND** 页面其余行为（空图表渲染、自动刷新）MUST NOT 因横幅改变

#### Scenario: 数据源恢复后横幅消失
- **WHEN** 数据源恢复可达且 summary 刷新返回 `source_ok: true`
- **THEN** 横幅 SHALL 消失，无需重启或手动刷新页面

#### Scenario: 横幅引导跳转
- **WHEN** 用户点击横幅中的「查看 ClickHouse 配置」
- **THEN** SHALL 跳转至「监控 → ClickHouse 配置」页
