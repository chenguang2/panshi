# relay-health-check Specification

## Purpose

跨中心链路体检：按区域依次探测三段——网关 HTTP 腿可达（TCP+TLS 握手）、SSH 跳板可达、抽样节点两腿经中继路径探活（管理腿经网关 `X-Edge-Target`、SSH 腿经跳板 `ssh -W` stdio 转发，免节点凭据）；每段独立成败与耗时，支持单区域与全量巡检、抽样策略与耗时预算。

## Requirements

### Requirement: 三段式链路体检
系统 SHALL 提供链路体检端点 `GET /api/v1/relay/health-check`（只读语义，GET 以规避迁移期写锁与 mutating 审计），按区域依次探测：段 1 网关 HTTP 腿可达（TCP+TLS 握手成功即通过，不依赖 HTTP 响应码）、段 2 SSH 跳板可达、段 3 抽样节点两腿可达；每段 SHALL 返回独立成败与耗时。

段 3 节点端口从武清不可直探，SHALL 经中继路径探测（无需节点凭据）：管理腿经网关 HTTP 携带 `X-Edge-Target`（任何 HTTP 响应即路径存活；网关 403 白名单拦截 SHALL 报白名单下发提示），SSH 腿经跳板 stdio 转发（`ssh -W`）建立到节点 SSH 端口的通路。

#### Scenario: 全链路健康
- **WHEN** 对 luju 区域执行体检且三段均可达
- **THEN** 返回三段全部成功及各段耗时

#### Scenario: 分段失败可定位
- **WHEN** 跳板不可达而网关 HTTP 腿正常
- **THEN** 返回段 1 成功、段 2 失败、段 3 失败（依赖段 2），失败段指明排障方向

### Requirement: 单区域与全量巡检
体检端点 SHALL 支持 `?region=<code>` 单区域体检；不带参数时 SHALL 对全部启用区域巡检并按区域分组返回。

#### Scenario: 单区域体检
- **WHEN** 请求 `?region=luju`
- **THEN** 仅返回 luju 区域的三段结果

#### Scenario: 全量巡检
- **WHEN** 不带 region 参数请求
- **THEN** 返回全部启用区域各自的三段结果，区域间互不阻塞

#### Scenario: 抽样策略
- **WHEN** 某区域节点数超过抽样上限
- **THEN** 段 3 仅探测每集群一台抽样节点，避免长耗时全量探测

#### Scenario: 抽样优先非自环节点
- **WHEN** 某集群同时含自环节点（ip 与区域跳板主机相同）与经跳板的远端节点
- **THEN** 段 3 优先抽远端节点，使跳板转发问题不被自环节点的跳过所掩盖

#### Scenario: 自环节点跳过跳板腿
- **WHEN** 抽样节点的 ip 与其区域跳板主机相同（网关机自身）
- **THEN** 该节点 SSH 腿不探测跳板，按成功返回并标注「走直连，不适用跳板」，避免误报失败

### Requirement: 体检耗时预算
体检 SHALL 设段级超时 10 秒、单区域总预算 60 秒；超时的段 SHALL 按失败返回并标注超时。

#### Scenario: 超时按失败返回
- **WHEN** 某段探测超过段级超时
- **THEN** 该段标记失败并标注超时，其余段继续探测
