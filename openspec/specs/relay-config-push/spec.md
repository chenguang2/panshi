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

### Requirement: 空名单下发防护与节点计数回填
`POST /relay/gateways/{id}/push-config` SHALL 在渲染白名单后统计该区域启用节点数（`status==1`）：当为 0 且请求未显式携带 `allow_empty=true` 时，SHALL 拒绝下发（HTTP 409），detail SHALL 明确提示修复动作「将节点状态改为『启用』」并点名挂接集群与禁用节点数，同时说明可确认空名单下发；SHALL NOT 触发 ansible 推送。显式携带 `allow_empty=true` 时 SHALL 照常下发空名单。该区域存在启用节点时，无论是否携带 `allow_empty` 均 SHALL 照常下发。`GET /relay/gateways` 列表 SHALL 逐区域回填 `enabled_node_count` 与 `total_node_count`。前端「下发配置」确认弹窗 SHALL 展示本次将下发的启用节点数与全量替换语义；区域 0 启用节点时 SHALL 升级为危险确认（明确警示白名单将被清空、该局发布/节点任务将被 403 拒绝，并提示先到集群节点列表将节点状态改为「启用」），用户显式确认后才携带 `allow_empty: true`。`init` 端点与「查看配置」预览 SHALL NOT 受空名单拦截（装机引导与只读预览语义保持）。

#### Scenario: 无启用节点时默认拒绝
- **WHEN** 某区域所属集群的节点全部为禁用状态（启用数 0），对该区域触发下发且未携带 `allow_empty`
- **THEN** 返回 409，detail 含「请先将节点状态改为『启用』」与挂接集群名及禁用节点数，该局网关机配置未被改动

#### Scenario: 显式确认空名单下发放行
- **WHEN** 同一 0 启用节点区域，下发请求显式携带 `allow_empty=true`
- **THEN** 下发照常执行，白名单以空表（仅 `default ""`）覆盖该局网关机

#### Scenario: 有启用节点时不受影响
- **WHEN** 区域存在 ≥1 个启用节点（另有若干禁用节点），下发未携带 `allow_empty`
- **THEN** 下发照常执行，白名单仅含启用节点

#### Scenario: 列表回填节点计数
- **WHEN** 打开中继区域管理页加载区域列表
- **THEN** 每个区域行携带 `enabled_node_count` 与 `total_node_count`，与该区域集群节点实况一致

#### Scenario: 前端空名单危险确认
- **WHEN** 对 0 启用节点的区域点击「下发配置」并在确认弹窗中确认
- **THEN** 弹窗为危险样式，警示白名单将被清空与 403 后果，并提示先到集群节点列表将节点状态改为「启用」；下发请求体携带 `allow_empty: true`

#### Scenario: init 不受空名单拦截
- **WHEN** 对 0 启用节点的区域触发「初始化网关」
- **THEN** 初始化照常执行（写 8443 server 块与当前白名单），不返回 409

### Requirement: 下发漂移预览
系统 SHALL 持久化每个区域最后一次成功写入网关机的白名单快照（`relay_gateways.last_pushed_nodes`，`ip:管理端口` 列表 + `last_pushed_at`）：`push-config` 与 `init` 终态成功时 SHALL 更新快照（`allow_empty=true` 的空名单下发成功后 SHALL 如实写空列表），终态失败或假成功 SHALL NOT 更新，sshd-setup SHALL NOT 触碰快照。快照写入 SHALL 在终态成功后的流收尾阶段经请求会话完成，SHALL NOT 写在生成器 `finally` 内（客户端断连即跳过——快照停留旧值，与 advisory 定位一致）。`GET /relay/gateways` SHALL 逐区域回填 `push_drift`（当前启用节点集合相对快照的 `{added, removed}` 差集；无快照为 null）与 `last_pushed_at`，纯平台侧计算。前端「下发配置」确认弹窗 SHALL 呈现漂移：将移除节点时 SHALL 琥珀警示并列出移除节点清单（≤10 全列，超出列前 10 并标注总数）且确认按钮文案 SHALL 标明移除数；仅新增 SHALL 以弱化文案提示；无快照 SHALL 提示首次写入；集合一致 SHALL 不加提示行。0 启用节点的危险确认路径不受本需求影响。漂移提示为 advisory 性质：快照不代表网关机实况（人工手改、SSE 断连窗口不覆盖）。

#### Scenario: 将移除节点时警示
- **WHEN** 上次成功下发含节点 A、B、C、D，当前启用节点为 A、B、C（D 被禁用），管理员点击「下发配置」
- **THEN** 确认弹窗出现琥珀警示行「与上次成功下发（{时间}）相比，本次将移除 1 个节点：D:端口」，确认按钮文案为「开始下发（将移除 1 个节点）」

#### Scenario: 仅新增节点时弱提示
- **WHEN** 上次成功下发含 A、B，当前启用节点为 A、B、C（新增 C），管理员点击「下发配置」
- **THEN** 确认弹窗以灰字提示将新增 C，确认按钮文案不变

#### Scenario: 首次下发无快照
- **WHEN** 区域从未成功下发（快照为空）且存在启用节点，管理员点击「下发配置」
- **THEN** 确认弹窗显示「该区域尚无成功下发记录，本次为首次写入白名单」，不显示漂移差集

#### Scenario: 集合一致不加行
- **WHEN** 当前启用节点集合与快照完全一致，管理员点击「下发配置」
- **THEN** 确认弹窗不出现任何漂移提示行

#### Scenario: 快照仅在成功时更新
- **WHEN** push-config 或 init 终态返回失败（含空匹配假成功改判）
- **THEN** 快照两列保持原值不变；终态成功（含 `allow_empty` 空名单成功下发写 `[]`）才更新为本次写入内容

#### Scenario: 断连窗口的 advisory 定位
- **WHEN** 客户端在下发流式过程中途断开，ansible 实际执行完成
- **THEN** 快照可能停留旧值，下一次弹窗显示的差集允许陈旧；系统不将其当错误处理，再次成功下发即自愈
