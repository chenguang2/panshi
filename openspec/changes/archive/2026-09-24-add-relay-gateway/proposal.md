## Why

武清（管理端）与各路局（Edge 节点）之间的防火墙按"目标节点 IP + 端口"逐条开洞，新增节点、换 IP 都触发新申请且周期长；多路局之后规则数按 局数 × 节点数 增长，业务等不起。需要在每个路局侧引入透明隧道网关（方案三，详见 `docs/design/relay-gateway.md`）：武清到每局只保留一条永久防火墙规则，此后节点增减/换 IP 对防火墙零操作。

## What Changes

- 新增**区域注册表**：`relay_gateways` 表（code/name/http_base_url/ssh_jump/status）+ 设置页管理（增删改、启停、连通性测试）；集群表新增 `region_code` 挂接；全局总开关 `features.yaml` 的 `features.relay_gateway`（显式 opt-in，默认关，热加载可一键回退直连）
- 新增**跨中心通道寻址**：EdgeClient 网关模式（`http_base_url` + `X-Edge-Target` 头）；裸 SSH 经 `resolve_relay_jump(ip)` 加 `-J`（覆盖 edge_autostart 与 node_task 全部裸 SSH 路径）；inventory 渲染按节点所在区域写入行级 `ansible_ssh_common_args`（ProxyJump）；直连区域（路由为空）三条通道保持现状
- 新增**网关配置下发**：按区域渲染 OpenResty map 白名单与 sshd PermitOpen 清单，经 ansible fleet 推送双机 reload 并校验，失败告警该局不阻塞他局
- 新增**链路体检端点**（GET，只读）：三段式（网关 8443 → 跳板 22 → 抽样节点两腿）探活，支持 `?region=` 单局体检与全量巡检
- （档 1 HA 配套）`_run_ssh_with_fallback` 连接类失败立即重试一次，覆盖 VIP 漂移窗口
- 不改变：SM4 载荷加密、`EDGE_ADMIN_KEY` 端到端校验、SSE 日志流聚合位置（仍在武清）、inventory 密码字段（AGENTS 红线 #10）

## Capabilities

### New Capabilities

- `relay-region-registry`：区域注册表数据模型与设置页管理（区域 CRUD/启停/连通性测试、集群区域挂接、全局总开关）
- `relay-channel-routing`：三条管理通道（Edge Admin API / 裸 SSH / Ansible）按节点所属区域经网关寻址；直连区域与总开关关闭时回退现状直连；连接类失败立即重试
- `relay-config-push`：网关白名单配置（nginx map / sshd PermitOpen）按区域渲染、双写推送、reload 校验与失败告警
- `relay-health-check`：三段式链路体检端点（支持 region 参数与全量巡检）

### Modified Capabilities

（无——现有 spec 均不规定"直连节点"这一实现前提；通道寻址是叠加行为，存量需求不受影响）

## Impact

- 后端：`app/services/edge_client.py`（URL 构造 + 请求头）、`app/services/ansible_service.py`（`_build_ssh_cmd` / `resolve_relay_jump` / inventory 渲染联动）、`app/services/inventory_service.py`（节点行级 `ansible_ssh_common_args`）、`node_task_service`（经共享函数自动生效）；新增 relay 相关 model/service/api
- 数据库：新表 `relay_gateways`；`Cluster` 模型加 `region_code`（SQLite/PG 双方言，需过 PG 冒烟 #31）
- 前端：设置页新增区域管理块；集群表单加区域选择；业务页面零改动
- 测试：新增区域路由/寻址/下发渲染单测；`tests/test_security_guard.py` 补新端点采样（AGENTS #19）；触及写库路径需跑 PG 方言冒烟
- 平台代码之外的基础设施（网关机、防火墙规则、TLS 证书）不在本变更实现范围，依赖 `docs/design/relay-gateway.md` 的 D1 阶段
