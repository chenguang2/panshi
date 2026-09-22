## ADDED Requirements

### Requirement: 按区域渲染网关配置
系统 SHALL 以区域为单元渲染网关白名单配置：nginx map（该局节点 `IP:management_port` 清单）与 sshd `PermitOpen`（该局节点 `IP:ansible_port` 清单）；渲染结果 SHALL 仅含本局节点，白名单外目标在网关侧被拒绝。

#### Scenario: 渲染该局清单
- **WHEN** luju 区域含节点 192.168.0.13、192.168.0.14
- **THEN** 渲染产物中的 map 行与 PermitOpen 行仅覆盖该两节点的管理端口与 SSH 端口，不出现他局节点

#### Scenario: 节点变更后重渲染
- **WHEN** 节点换 IP 或新增节点后触发下发
- **THEN** 渲染产物反映节点表最新状态

### Requirement: 双写推送与校验
配置下发 SHALL 经 ansible fleet 同时推送该局全部网关机（HA 双机各一份），逐台校验（`nginx -t` / `sshd -t`）后 reload；仅当该局全部网关机下发成功才算成功。

#### Scenario: 双机成功
- **WHEN** luju 区域双网关机均推送并 reload 成功
- **THEN** 下发结果标记成功

#### Scenario: 单机失败告警
- **WHEN** luju 双机中任一台推送或校验失败
- **THEN** 下发标记失败并产生该局告警；另一台不受阻塞，他局下发不受影响

#### Scenario: 幂等重跑至一致
- **WHEN** 单机失败后重新触发该局下发
- **THEN** 整局双机重跑（渲染→推送→校验→reload），直至双机配置一致才算成功；故障期间的双机不一致由链路体检的间歇 403 显式暴露

### Requirement: 下发为显式动作
网关配置下发 SHALL 为平台显式触发的动作（含下发结果回报）；节点寻址配置与网关白名单出现漂移时（该局节点不在白名单）SHALL 在链路体检中显式暴露。

#### Scenario: 漂移暴露
- **WHEN** 节点已换 IP 但未触发下发
- **THEN** 链路体检对该节点的 HTTP 腿探测报告白名单外目标（网关 403）类失败，指明需重新下发
