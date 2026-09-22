## Context

完整架构设计见 `docs/design/relay-gateway.md`（方案三：透明隧道网关，多局形态，VIP 双机 HA）。本变更仅覆盖**平台侧代码**：区域注册表、三通道寻址改写、网关配置下发、链路体检；网关机装机与防火墙申请属 D1 基础设施阶段，不在本变更内。

现状代码锚点（已核实）：

- `EdgeClient.__init__` / `_resolve_edge_url`：`http://{node.ip}:{node.management_port}`，调用方全部经此构造 URL
- `_build_ssh_cmd(ip, ssh_user, cmd, password, port)`：全部裸 SSH（edge_autostart、node_task_service）经 `_run_ssh_with_fallback` 汇入
- inventory 为单一扁平组 `all.children.edge_cluster`（`inventory_service._EDGE_PATH`），`normalize_hosts` 支持任意字段渲染
- `get_ssh_password(ip)`：按 ip 从 inventory 解析凭据的既有模式

## Goals / Non-Goals

**Goals:**

- 节点增减/换 IP 零防火墙操作：武清到每局仅一条永久规则（指向网关/VIP）
- 平台开关默认关闭，合入后存量行为零变化，可随时一键回退
- 多局一等公民：新增一局 = 网关装机 + 一条规则 + 设置页加一行，平台代码零改动

**Non-Goals:**

- 审批期排队容错（方案二职责）
- 网关机装机/系统初始化自动化（仅做配置白名单下发）
- 双机切换的平台侧逻辑（由 keepalived VIP 承担）
- 方案四 VPN 落地（备选终局，见设计文档专章）

## Decisions

1. **区域注册表用 DB 表 + 设置页管理（否决 env JSON 种子）**：多局下 env 无法承载运行时启停与连通性测试；符合平台"设置页管理"风格。集群表加 `region_code` 挂接；直连区域 = `http_base_url`/`ssh_jump` 均空。
2. **寻址解析链统一为 node → cluster.region_code → relay_gateways**：实现为**进程内注册快照**（`relay_registry`：异步入口加载，TTL 30s 兜底 + CRUD 即时失效；同步消费方 `EdgeClient.__init__`/`_build_ssh_cmd` 零 IO 读取）。同 ip 命中多节点且区域不一致 → 判定歧义 → 回退直连 + 告警（`Node.ip` 无唯一约束，跨集群同 IP 存在歧义）。
3. **改写点收敛在三处**：`EdgeClient`（URL + `X-Edge-Target` 头 + 403 映射）、`_build_ssh_cmd`（`-J`）、ansible **运行期注入**。inventory 为用户管理文件（渲染内容来自页面提交），故 ProxyJump 采用 `_inventory_inject_port` 同款先例：运行前按目标 ip 注入 `ansible_ssh_common_args`，finally 恢复，用户清单零落盘修改。
4. **双层开关**：全局总开关 `EDGE_RELAY_ENABLED`（默认 `0`，一键回退）+ 区域级 `status`（单局摘除）；寻址入口处统一判断"总开关 && 区域 enabled && 路由非空"。禁用/未生效时回退直连执行，连接类失败的错误信息附加"该区域中继已禁用，直连通常不可达"提示（不 fail-fast 拦截操作）。
5. **配置下发为显式动作 + 双写校验**：渲染器按区域产出 nginx map / sshd PermitOpen，经 fleet playbook 推该局全部网关机，逐台 `nginx -t`/`sshd -t` + reload，全部成功才算成功；白名单仅由节点表投影，杜绝手改漂移。网关 fleet 使用**独立 `inventory/gateways/` 清单按局分组**，不混入 edge_cluster 扁平组（网关不是 Edge 节点；AGENTS #21① inventory 显式指定）；单机失败后幂等重跑整局直至双机一致。
6. **体检端点全局挂载**：`GET /api/v1/relay/health-check[?region=]`（GET 只读，规避迁移期写锁 #32 与 mutating 审计），三段探测（HTTP 腿 / 跳板 / 抽样节点双端口）；段 1 以 TCP+TLS 握手判定（网关对白名单外目标返回 403，不能以 HTTP 响应码判活）；段级超时 10s、单区域总预算 60s；权限纳入 AGENTS #19 门控体系并补 `test_security_guard` 采样。
7. **跨局 IP 按不重叠设计**（决策记录见设计文档）：inventory 以 IP 为主键是硬约束；重叠实际发生时再立项 IP 别名化，不预留半成品。
8. **PG 方言先行**：`relay_gateways` 新表与 `Cluster.region_code` 触及写库路径，合入前必须过 `TEST_DB_BACKEND=pg` 冒烟（AGENTS #31）。

## Risks / Trade-offs

- [白名单漂移（节点变更忘下发）] → 下发结果校验 + 告警；链路体检把"网关 403 类失败"显式指回下发动作
- [SSRF：网关按头转发任意内网目标] → 网关侧白名单拒绝清单外目标（网关职责）；平台侧仅渲染节点表，不提供自由目标入口
- [inventory 渲染新增字段兼容性] → `normalize_hosts` 已支持任意字段；补渲染回归测试覆盖解析/保存/再渲染 round-trip
- [ControlMaster 复用 socket 随跳板失效] → run_playbook 已有 socket 自愈；档 1 加连接类失败一次立即重试
- [直连回退不彻底] → 全部寻址入口挂同一判断函数，回退即完全还原现状；单测覆盖"开关关闭 == 现状命令/URL"
- [审批期间功能空转] → 总开关默认关，空转无副作用；D3 才按局启用
- [下发引导依赖 D1 规则未批] → 冷启动由路局侧手工放置初始白名单（渲染脚本离线版），规则生效后转平台自动下发
- [双机下发中间态不一致（单机失败时）] → 失败整局幂等重跑直至一致；不一致窗口由体检的间歇 403 暴露

## Migration Plan

1. 建表 `relay_gateways` + `Cluster.region_code`（SQLite/PG 双方言 create_all），总开关默认关
2. 上线顺序：注册表 + 设置页 → 三处寻址改写（关闭态）→ 配置下发 → 体检端点
3. 按局启用灰度：设置页配路由 → 只开 `ssh_jump` 验证 SSH 腿 → 开 `http_base_url` 验证 HTTP 腿 → 生产局后切
4. 回退：`EDGE_RELAY_ENABLED=0` 重启即全量回直连；区域级回退走设置页禁用

## Open Questions

- 一期 HA 档位（档 0 / 档 1）决定"连接类失败重试"是否随本期交付（代码独立、可后补）
- TLS 证书签发流程（内部 CA）——阻塞通道 A 真实启用，不阻塞代码合入
- 网关机归属与网管三件事（VIP/ARP/同 VLAN）——D1 基础设施事项
