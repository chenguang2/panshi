## Purpose

SSL 证书匹配名单（sni）与证书本体 SAN 的一致性保障：证书 PEM 为唯一事实源——回滚恢复键名双读并从 SAN 重同步、发布时匹配名单从 SAN 推导并回写、不一致时响应携带派生布尔并由卡片提供一键同步，消除「节点证书有 IP 而平台匹配名单没有」类脱节（uapm 案例）。

# ssl-cert-rollback-consistency 变更规格

## Requirements
### Requirement: 回滚恢复的键名兼容

SSL 证书回滚恢复匹配名单时，SHALL 同时兼容版本快照中的 `snis`（数组）与 `sni`（字符串）两种键格式，取存在者规范化为逗号分隔字符串写入 `cert.sni`（并合并系统保留 SNI）。

#### Scenario: 回滚到多 SNI 版本（snis 键）
- **GIVEN** 某证书版本快照的配置含 `snis: ["edge.local", "a.com", "192.168.0.13"]`（无 `sni` 键）
- **WHEN** 用户回滚到该版本
- **THEN** 证书的 `sni` 字段 SHALL 恢复为 `edge.local,a.com,192.168.0.13`

#### Scenario: 回滚到单 SNI 版本（sni 键）
- **GIVEN** 某证书版本快照的配置含 `sni: "a.com"`（无 `snis` 键）
- **WHEN** 用户回滚到该版本
- **THEN** 证书的 `sni` 字段 SHALL 恢复为含 `a.com` 与系统保留项的列表

#### Scenario: 两者皆无
- **GIVEN** 某证书版本快照的配置不含 `sni` 也不含 `snis`
- **WHEN** 用户回滚到该版本
- **THEN** `sni` 字段 SHALL 保持回滚前的值不被清空

### Requirement: 回滚后匹配名单与证书 SAN 同源

回滚恢复证书本体（PEM）后，系统 SHALL 从该 PEM 解析 SAN（DNS + IP）并重写 `cert.sni`（保留系统保留项合并）；PEM 解析失败时 SHALL 回退为键名兼容恢复的结果，SHALL NOT 抛错。

#### Scenario: 回滚消除 sni 与 SAN 脱节
- **GIVEN** 版本快照中的证书 PEM 的 SAN 为 `a.com` 与 `192.168.0.13`，而快照 `snis` 键只有 `["a.com"]`
- **WHEN** 用户回滚到该版本
- **THEN** 回滚完成后 `cert.sni` SHALL 包含 `a.com` 与 `192.168.0.13`（以 PEM SAN 为准，而非快照 snis）

#### Scenario: 不可解析 PEM 的降级
- **GIVEN** 版本快照中的证书 PEM 不可解析（如国密非标双证书）
- **WHEN** 用户回滚到该版本
- **THEN** `cert.sni` SHALL 为键名兼容规则恢复的值，且回滚请求 SHALL 成功

### Requirement: 发布时匹配名单从证书 SAN 推导

发布 SSL 证书时，Edge 配置的匹配名单（`sni`/`snis`）SHALL 从证书 PEM 的 SAN（DNS + IP）解析推导；PEM 解析失败时 SHALL 回退为当前 `cert.sni` 拆分。发布成功后系统 SHALL 将推导结果回写 `cert.sni` 以保持库内一致。

#### Scenario: 存量脱节证书发布自愈
- **GIVEN** 某证书 `sni` 字段为 `edge.local,qcg.com`，而其 PEM SAN 含额外的 `192.168.0.13`
- **WHEN** 用户发布该证书
- **THEN** 下发到 Edge 的匹配名单 SHALL 包含 `192.168.0.13`
- **AND** 发布完成后库内 `cert.sni` SHALL 更新为含 `192.168.0.13` 的全量列表

#### Scenario: 解析失败回退现值
- **GIVEN** 某证书的 PEM 不可解析
- **WHEN** 用户发布该证书
- **THEN** Edge 匹配名单 SHALL 按现 `cert.sni` 拆分下发（行为与现状一致）

### Requirement: 匹配名单与 SAN 不一致的可见性

服务器证书的列表与详情响应 SHALL 携带派生布尔 `sni_mismatch`：`cert.sni` 规范化集合与 PEM SAN 集合不一致时为 `true`；PEM 解析失败时恒为 `false`。服务器证书卡片在 `sni_mismatch` 为真时 SHALL 显示警示与「同步」操作，点击后 SHALL 以 SAN 推导值更新 `sni` 字段并刷新。

#### Scenario: 不一致证书的卡片警示
- **GIVEN** 某服务器证书 `sni` 与其 PEM SAN 不一致
- **WHEN** 用户查看服务器证书页卡片
- **THEN** 该卡片 SHALL 显示「匹配名单与证书 SAN 不一致」警示
- **AND** 卡片 SHALL 提供「同步」操作

#### Scenario: 一键同步修复
- **WHEN** 用户点击不一致卡片上的「同步」
- **THEN** 系统 SHALL 以 PEM SAN 推导值（含系统保留项）更新该证书 `sni`
- **AND** 列表刷新后该卡片的警示 SHALL 消失

#### Scenario: 一致或不可判定时不告警
- **GIVEN** 某服务器证书 `sni` 与 SAN 一致，或其 PEM 不可解析
- **WHEN** 用户查看服务器证书页卡片
- **THEN** 该卡片 SHALL NOT 显示不一致警示
