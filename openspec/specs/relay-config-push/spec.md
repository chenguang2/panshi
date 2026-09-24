# relay-config-push Specification

## Purpose

按区域渲染网关白名单配置（nginx map 节点清单 + sshd `PermitOpen`）并经 ansible fleet 向该局全部网关机双机下发（`nginx -t` / `sshd -t` 校验后 reload）；下发为显式动作、SSE 流式回显、同区域并发 409 防重入，并提供只读「查看配置」预览作为 ansible 不可用时的手工兜底。

## Requirements

### Requirement: 按区域渲染网关配置
系统 SHALL 以区域为单元渲染网关白名单配置：nginx map（该局节点 `IP:management_port` 清单）与 sshd `PermitOpen`（该局节点 `IP:ansible_port` 清单）；渲染结果 SHALL 仅含本局节点，白名单外目标在网关侧被拒绝。两类投影的节点范围 SHALL 不同：nginx map 仅含 `status==1`（启用）节点（流量语义）；sshd `PermitOpen`（SSH **管理**语义）SHALL 含**全部**节点，含禁用节点（禁用节点仍需状态查询/节点任务）。`PermitOpen` SHALL 以**单条指令 + 逗号分隔**输出全部目标；当该 sshd 不支持逗号格式（厂商差异，实测 LinxOS 报 `bad port number in permitopen`）时 SHALL 回退为仅 `AllowTcpForwarding yes`，并在结果中回显已回退及原因。

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

### Requirement: 下发执行过程流式回显
`POST /relay/gateways/{id}/init` 与 `POST /relay/gateways/{id}/push-config` SHALL 以 SSE 流式返回执行过程（逐行 `{line,percent}` 与终态 `{rc,status,hosts_pattern,listen_port}`）；前端 SHALL 复用节点安装的执行抽屉实时展示。端点 SHALL 在交出流之前结束数据库事务并落审计，SHALL 以进程内 in-flight 集合对**同区域并发**触发返回 409。

#### Scenario: 实时过程可见
- **WHEN** 对某区域触发初始化
- **THEN** 界面抽屉实时出现 ansible PLAY/TASK/ok 行、进度与用时，终态给出 rc 与关键信息（主机组/监听端口）

#### Scenario: 同区域并发被拒
- **WHEN** 同区域已有进行中的 init/push
- **THEN** 再次触发返回 409

### Requirement: 待写入配置预览
系统 SHALL 提供只读 `GET /relay/gateways/{id}/config-preview`，用与下发**相同的渲染函数**产出待写入网关机的文件内容（`relay_8443.conf`、`edge_targets.conf`、nginx include 片段、sshd 跳板配置）、目标路径与手工步骤；该端点 SHALL NOT 改动远端。

#### Scenario: ansible 不可用时手工兜底
- **WHEN** 运维打开「查看配置」
- **THEN** 可复制各文件内容与目标路径，并按给出的 `nginx -t` / reload 命令手工落地
