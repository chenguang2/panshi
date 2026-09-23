# 跨中心透明隧道网关设计（武清 ⇄ 路局）

> 状态：设计评审稿（2026-09-22，同日增补多局扩展设计）。背景：武清（管理端）与多个路局（Edge 节点）之间防火墙逐节点开洞周期长，需要每个路局侧一个中继执行层。本文详述选定的**方案三：透明隧道网关**，按"武清 + N 个路局"的多局形态设计，并保留向方案一/二演进的衔接位。

## 背景与问题

磐石管理端部署在武清中心，通过两条通道管理各路局中心的 Edge 节点（规划存在**多个路局**，下文以"路局 A/B/…"指代）：

- **Ansible/SSH**：`ansible-runner` 在武清本机执行 playbook；`_run_ssh_with_fallback` 用 `sshpass ssh` 直连节点执行裸命令
- **Edge Admin API**：`EdgeClient` 直连 `http://{节点IP}:{management_port}` 推送路由/上游/插件等配置

两类流量都必须穿越武清—各路局防火墙，规则按"目标节点 IP + 端口"逐条申请。新增节点、节点换 IP 都触发新的防火墙申请，审批周期长，业务等不起；多局之后规则数按 局数 × 节点数 增长，问题进一步放大。

## 方案选型结论

共评估四个方案，结论如下（完整对比见评审记录）：

| 方案 | 通道形态 | 结论 |
| --- | --- | --- |
| 一：执行网关（推模式） | 武清调用路局侧网关 API，网关本地执行 | 保留为演进方向 |
| 二：拉模式执行代理 | 代理反连武清领任务，可排队 | 保留为演进方向 |
| **三：透明隧道网关** | **网关只做网络层转发，平台逻辑零改动** | **本文，先行落地** |
| 四：VPN 组网 | WireGuard 站点互联 | 审批风险高暂不推进；网络自有时可升级为终局形态（详见"方案四详析（备选）"） |

选三的理由：落地最快（天级）、凭据不下沉路局、改造点集中且可一键回退；网关机、防火墙规则、TLS 证书在将来切方案一/二时全部复用。

## 目标与非目标

**目标**

- 武清 → 每个路局只保留**一条永久防火墙规则**（武清后端网段 → 该局网关机 TCP 22 + 8443），此后该局节点增减/换 IP 零防火墙操作；防火墙规则总数 = 局数 N，与节点数 M 彻底解耦
- 平台业务逻辑零改动，仅三处"寻址改写"，由全局总开关 + 区域注册表控制，可随时回退直连
- SSH 密码、`EDGE_ADMIN_KEY`、SM4 密钥全部留在武清，网关不持有任何节点凭据
- 多局开箱即用：新增一个路局 = 一台同构网关 + 一条一次性规则 + 区域表加一行，平台代码零改动

**非目标**

- 不解决"防火墙审批期间继续干活"（无排队能力，那是方案二的职责）
- 不做多租户、不做通用命令总线
- 网关不做任何业务语义处理（不解析、不改写、不缓存载荷）

## 总体架构

### 多局拓扑（武清 + N 个路局）

防火墙规则数 = 局数 N（每局一条、一次批完），与节点数彻底解耦；网关机全部同构，按 ansible fleet 统一管理。三条通道按"节点所属区域"解析路由：

```text
                    武清中心（磐石管理端，唯一）
   ┌────────────────────────────────────────────────┐
   │ EdgeClient   → 区域注册表 → 该局 http_base_url   │
   │ 裸 SSH       → resolve_relay_jump(ip) → 该局跳板 │
   │ Ansible      → inventory 节点行按区域写入 jump     │
   └──────┬───────────────┬───────────────┬─────────┘
          │规则①(一次性)    │规则②(一次性)    │规则③(一次性)
          ↓               ↓               ↓
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │ 路局A 网关   │  │ 路局B 网关  │  │ 路局N 网关  │
   │ OpenResty + │  │ (同构配置)  │  │ (同构配置)  │
   │ sshd 跳板   │  │            │  │            │
   └─┬──┬──┬────┘  └─┬──┬──┬───┘  └────────────┘
     ↓  ↓  ↓         ↓  ↓  ↓            本局节点
   局A 节点（本地直连，无防火墙）
```

### 单局通道细节

```text
武清中心                                        路局中心
┌─────────────────────────────┐               ┌─────────────────────────────────┐
│ 磐石管理端（逻辑零改动）        │               │  隧道网关（1 台，唯一防火墙目标）    │
│                             │               │                                 │
│ ① EdgeClient                │  HTTPS:8443   │  [HTTP 反向代理]                 │
│   http://GW:8443            │ ────────────→ │   X-Edge-Target → upstream      │
│   + X-Edge-Target: ip:port  │               │   (map 白名单，平台生成 + reload)  │
│                             │               │                                 │
│ ② ansible-runner            │  SSH:22       │  [sshd 跳板]                     │
│   inventory: ProxyJump=gw   │ ────────────→ │   受限账号 tunnel                │
│                             │  (一条规则)     │   PermitOpen 节点:22 白名单       │
│ ③ _run_ssh_with_fallback    │               │                                 │
│   sshpass ssh -J tunnel@gw  │               │   OpenResty + sshd + systemd    │
│   user@节点真实IP            │               │   （可选 keepalived VIP 双机）     │
└─────────────────────────────┘               └──────┬─────────┬─────────┬──────┘
                                                  本地直连（无防火墙）
                                                     ↓         ↓         ↓
                                                   节点 1     节点 2     节点 3
                                                (SSH:22)  (mgmt_port) (mgmt_port)
```

### 设计原则

1. **透明转发**：网关是 L4/L7 管道，不理解业务。平台侧 ansible-runner、sshpass、SM4 加解密全部原地不动。
2. **凭据不下沉**：与方案一/二的本质区别。网关只有一个受限跳板账号，转发的是端到端认证/加密过的流量。
3. **平台是寻址事实源**：节点表是唯一权威，网关配置（HTTP map 白名单、sshd PermitOpen 清单）都是它的投影，由平台自动下发。
   - **已落地（2026-09-22）**：sshd 部分走独立 root 通道 `POST /relay/gateways/{id}/sshd-setup`（界面「配置跳板转发」，`relay_sshd.yml`）：以 root 写 `sshd_config.d/relay-tunnel.conf`（`AllowTcpForwarding yes` + `PermitOpen`），改前备份 + `sshd -t` + `sshd -T` 生效性验证 + 失败回滚 + 仅 reload；root 凭据仅本次注入网关清单、流 `finally` 还原。
4. **开关可回退**：三处改写全部挂 feature flag（环境变量），关闭即回直连，存量防火墙规则在观察期内保留。

## 三条通道设计

平台触达节点的代码路径经核实共三条，每条一个改写点。

### 通道 A：Edge Admin API（HTTP 反向代理 + 路由头）

**现状**：`backend/app/services/edge_client.py` 的 `EdgeClient` 在 `__init__` / `_resolve_edge_url` 中拼出 `http://{node.ip}:{node.management_port}`（Node 表 `management_port` 字段）。

**改法**：按节点所属区域查区域注册表（见"多局扩展设计"）取该局网关 `http_base_url`（如 `http://10.10.1.1:8443`）。设置后 `edge_url` 统一指向该局网关，真实目标放请求头；区域无网关（武清本地）则保持直连 URL 不变：

```text
POST /apisix/admin/routes/xxx  HTTP/1.1
Host: gw:8443
X-Edge-Target: 192.168.0.13:16620     ← 真实节点目标（ip + management_port）
X-Edge-Key: <原 EDGE_ADMIN_KEY>        ← 不变，端到端透传
<SM4 加密载荷>                          ← 不变，端到端加密
```

- SM4 加解密、API key 校验全部端到端，网关不解密、看不到业务内容
- `EdgeClient` 的所有调用方（edge_sync 发布、edge_import 探测等）零改动——URL 构造集中在一个类里

**网关侧路由**：OpenResty 按 `X-Edge-Target` 选 upstream，map 为静态生成文件，节点清单变化时平台推送并 reload（见"配置下发机制"）。SSE/流式响应需 `proxy_buffering off` 透传。

### 通道 B：Ansible（ProxyJump）

**现状**：`ansible_service.run_playbook` 经 inventory 直连节点（`ip` / `ansible_ssh_user` / `ansible_ssh_pass` / `ansible_port`，见 `inventory_service.py` 的必填字段集）。

**改法**：inventory 渲染时在**节点行上**追加该局 ProxyJump 变量。多局下各局 jump 不同，不能用单一组变量；且已核实 inventory 是单一扁平组 `all.children.edge_cluster`（`inventory_service.py` 的 `_EDGE_PATH`）。

**节点真实 IP、`ansible_port`、`ansible_ssh_pass` 全部保持原样**，只是 TCP 路径多一跳：

```yaml
all:
  children:
    edge_cluster:
      hosts:
        192.168.0.13:                       # 路局A 节点
          ansible_ssh_user: ops
          ansible_ssh_pass: xxx
          ansible_port: 22
          ansible_ssh_common_args: '-o ProxyCommand="ssh -W %h:%p -p 22 -i ~/.ssh/relay_ed25519 tunnel@10.10.1.1"'
        192.168.1.20:                       # 路局B 节点（jump 各自区域）
          ansible_ssh_user: ops
          ansible_ssh_pass: xxx
          ansible_port: 22
          ansible_ssh_common_args: '-o ProxyCommand="ssh -W %h:%p -p 22 -i ~/.ssh/relay_ed25519 tunnel@10.10.2.1"'
```

`%h:%p` 引用节点真实地址，因此 `resolve_ssh_port`、playbook 逻辑、false-success 输出扫描（AGENTS 约定 #21）全部零改动。**红线：不得动 `ansible_ssh_pass`（AGENTS 约定 #10）。**

### 通道 C：裸 SSH（`_run_ssh_with_fallback` 加 `-J`）

**现状**：`ansible_service._build_ssh_cmd(ip, ssh_user, cmd, password, port)` 生成 `sshpass -p xxx ssh user@ip` 命令。

调用方：`edge_autostart`（自启动管理）与 `node_task_service`（脚本执行、文件分发，import 自 `ansible_service`），全部经 `_run_ssh_with_fallback` 汇入此函数。

**改法**：这是全方案最省的一点——一处改动覆盖全部裸 SSH 路径：

```python
# 区域注册表：DB 表 relay_gateways（见"多局扩展设计"）
# resolve_relay_jump(ip)：按 节点 → 集群 → 区域 解析该局跳板，
# 解析模式与现有 get_ssh_password(ip) 同款（按目标查路由）。

def _build_ssh_cmd(ip, ssh_user, cmd, password=None, port=None):
    base_opts = [
        "-o", "ConnectTimeout=30",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
    ]
    jump = resolve_relay_jump(ip)  # 该局跳板；直连区域返回 None
    if jump:
        base_opts += ["-J", jump, "-i", RELAY_KEY_PATH]
    ...
```

前端"命令 tab"展示的完整手工命令（`_build_ssh_cmd` 的产物）会自然带上 `-J` 段，运维可直接复现。

## 网关侧部署规格

### 组件清单

| 组件 | 选型 | 要点 |
| --- | --- | --- |
| HTTP 反代 | OpenResty（或 nginx） | map 白名单 + reload；`proxy_buffering off` 保 SSE；TLS 必配 |
| SSH 跳板 | 系统自带 sshd | **建议**：专用账号 `tunnel`（密钥登录、无有效 shell、`PermitOpen` 白名单）。现实部署可用普通账号 + 平台默认 SSH 身份，已受支持 |
| 常驻 | systemd | 服务化 + 开机自启 |
| HA | keepalived VIP 双机（推荐档 1） | 防火墙规则指向 VIP，秒级漂移，平台无感；详见"网关高可用"章 |
| 审计 | nginx access log | 记录源 IP / `X-Edge-Target` / 耗时；sshd 侧可选 tlog 会话录制 |

### sshd 跳板账号配置

```text
# /etc/ssh/sshd_config.d/relay-tunnel.conf
Match User tunnel
    PasswordAuthentication no
    PubkeyAuthentication yes
    AllowTcpForwarding local
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitListen none
    PermitOpen 192.168.0.13:22
    PermitOpen 192.168.0.14:22
    # ↑ 与 HTTP map 白名单同源，均由平台下发渲染
```

`tunnel` 账号 shell 设为无效值；`ssh -W`（stdio 转发）走 direct-tcpip 通道，不执行 shell，因此交互式登录被彻底禁止。落地时需实测 `-W` 在该配置下可用。

### OpenResty 配置模板

```nginx
# /etc/openresty/conf.d/edge_targets.conf —— 由磐石平台自动生成，勿手改
map $http_x_edge_target $edge_upstream {
    default                "";
    "192.168.0.13:16620"   "192.168.0.13:16620";
    "192.168.0.14:16620"   "192.168.0.14:16620";
}

server {
    listen 8443 ssl;
    ssl_certificate     /etc/ssl/panshi-relay.crt;   # 内部 CA 签发
    ssl_certificate_key /etc/ssl/panshi-relay.key;

    location / {
        # 安全关键：白名单外目标直接拒绝（防 SSRF 扫内网）
        if ($edge_upstream = "") { return 403; }
        proxy_pass http://$edge_upstream;
        proxy_set_header Host $http_x_edge_target;
        proxy_buffering off;              # SSE / 流式响应透传
        proxy_read_timeout 300s;
    }
}
```

sshd 的 `PermitOpen` 渲染进 `relay-tunnel.conf` 后 `sshd -t && systemctl reload sshd`。

## 网关高可用：keepalived VIP 双机（推荐档位）

### 问题与档位选择

单网关是该局单点：systemd 自启只兜"进程挂"，主机宕 / 虚机宿主迁移 / 维护重启仍需人工介入（虚机平台 HA 也要 1~5 分钟）。VIP 双机把恢复压到秒级全自动。

| 档位 | 形态 | 恢复时间 | 结论 |
| --- | --- | --- | --- |
| 档 0 | systemd 自启（+ 虚机平台 HA） | 进程级秒级；主机级分钟级+人工 | 默认基线，能接受偶发分钟级失管时够用 |
| **档 1（推荐）** | keepalived VIP 双机 | 秒级全自动 | 平台零改动、防火墙零增量；多局下每局复制 |
| 档 2 | 平台感知多网关健康切换 | 秒级 | 否决——改表结构 + EdgeClient 切换逻辑，复杂度与收益不成比例 |

### 架构与工作机制

```text
              武清（所有配置只认 VIP: 10.10.1.100）
                      │ 唯一防火墙规则 → VIP TCP 22+8443
                      │（不增加第二条规则）
      ┌───────────────┴────────────────┐
 ┌────────────────┐  VRRP 心跳/选主  ┌────────────────┐
 │ GW-A 10.10.1.1  │◄──────────────►│ GW-B 10.10.1.2  │
 │ MASTER prio=100 │  unicast 1s/次  │ BACKUP prio=80  │
 │ 持有 VIP .100    │                │ 待命             │
 └──────┬─────────┘                 └──────┬─────────┘
        │ 本地直连                           │ 本地直连
        ↓                                 ↓
      局内节点（两台都能到达全部节点，配置完全一致）
```

keepalived 在两机间跑 VRRP：MASTER 周期发心跳，BACKUP 连续约 3 秒收不到即接管 VIP（免费 ARP 宣告）。防火墙规则与平台配置全部只写 VIP，主机怎么漂，武清无感。

### 关键设计点

1. **漂移条件 = "失去服务能力"而非"进程死了"**：track_script 同时检查 8443 健康与 sshd 活性，OpenResty hang / sshd 打满同样触发漂移（模板见下）。
2. **配置双写一致性（最易翻车）**：BACKUP 白名单若为旧版，漂移后表现为 403/拒连，比单点更隐蔽。下发以 fleet playbook 双写：每局组 `[gw-a, gw-b]`，一份 conf 推两台，逐台 reload + 校验，两台都成功才算完成，任一失败告警该局。可选兜底：keepalived notify 在"成为 MASTER"时 diff 双机配置并告警。
3. **漂移瞬间的连接语义**：HTTP 腿无状态，仅断进行中请求；SSH 腿 ControlMaster 复用 socket 随漂移失效、新连接自动重建（run_playbook 已有 socket 自愈逻辑），进行中任务失败走任务中心 retry。
4. **抢占策略**：默认 `preempt`（GW-A 恢复夺回 VIP，角色固定便于排障，代价是多一次 3 秒抖动）。
5. **脑裂与心跳**：`unicast_peer` 直指对端、`virtual_router_id` 与认证密钥按局唯一、模板渲染防手工错配；上线前双机分别 `tcpdump vrrp` 验证心跳互见。脑裂后果为流量劈叉 + 审计分裂（双机配置一致，业务请求不坏）。

### 配置模板

```text
# /etc/keepalived/keepalived.conf —— GW-A（GW-B 对称改 state/priority）
global_defs {
    enable_script_security
    script_user root
}
vrrp_script chk_http {
    script "/usr/local/bin/check_gw.sh"
    interval 2
    fall 2
    rise 2
}
vrrp_instance VI_1 {
    state MASTER                  # GW-B 写 BACKUP
    interface ens192
    virtual_router_id 51          # 每局唯一（多局多 VLAN 防撞号）
    priority 100                  # GW-B 写 80
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass <每局唯一密钥>
    }
    unicast_src_ip 10.10.1.1
    unicast_peer {
        10.10.1.2
    }
    virtual_ipaddress {
        10.10.1.100/24 dev ens192
    }
    track_script {
        chk_http
    }
}
```

```bash
#!/bin/bash
# /usr/local/bin/check_gw.sh —— 任一失败即降级，让 VIP 漂走
curl -sk -o /dev/null https://127.0.0.1:8443/ || exit 1
systemctl is-active --quiet sshd || exit 1
```

### 落地前提（与防火墙申请同批找网管确认）

| # | 事项 | 卡点风险 |
| --- | --- | --- |
| 1 | VIP 由局内网管分配的独立 IP（不复用 GW-A 的 IP） | 网管配合第一件事 |
| 2 | 交换机允许 VIP 免费 ARP 迁移（有 ARP 静态绑定/防欺骗需放行） | 最常见隐形卡点，演练时才暴露 |
| 3 | 两台网关机同 VLAN（VRRP 同二层） | 影响双机摆放位置 |

### 平台侧改动

- `relay_gateways` 该局一行写 VIP：`http_base_url=http://VIP:8443`、`ssh_jump=tunnel@VIP:22`——平台不知道背后有两台
- 下发仅 fleet inventory 每局组放两台主机（双写）；渲染 / 校验逻辑不变
- 体检端点测 VIP；可选增强：分别探两台真实 IP 报告"哪台坏了"
- 唯一代码改动：`_run_ssh_with_fallback` 对连接类失败立即重试一次（覆盖漂移窗口）

### 已知边界

1. 漂移窗口（3~5s）内发起的操作失败 → 一次重试兜住大多数，剩余人工重试
2. 不迁移已建立连接：跑一半的长任务（大 playbook、批量分发）会断，走任务中心 retry
3. keepalived 配置错误会脑裂 → 模板渲染 + 上线演练（拔 GW-A 验证 403 → 恢复全链路）
4. 双机同 VLAN 前提；网管不放行 ARP 迁移时退回档 0

## 配置下发机制（平台为事实源）

节点表变更（新增节点 / 换 IP / 改 management_port）后，所在局的网关配置必须同步，否则出现"平台显示成功、网关 403"类故障。多局下渲染器输出 **N 份 conf**（每局 map / PermitOpen 只含本局节点，白名单按局天然隔离），经 ansible fleet 分组（`gateways_luju` / `gateways_tianjin` / …）推送各自网关机。

```text
节点表 ──→ 渲染器(平台) ──→ N 份 edge_targets.conf + relay-tunnel.conf（按局）
                              │ ansible fleet 推送到各自网关机
                              ↓
                       网关: nginx -t && nginx -s reload / sshd -t && reload sshd
                              │ 校验：抽样节点经两条腿探活
                              ↓
                          下发结果回报平台
```

- 下发动作复用现有 ansible 域能力——**网关本身就是路局第一台受管主机**（进 inventory，专用 group）
- **冷启动顺序**：首次装机时防火墙规则尚未批准，网关初始配置由路局侧运维手工放置（装机手册给出渲染脚本离线版）；规则生效后转为平台自动下发
- 下发失败必须显式告警并阻塞相关节点的发布操作（宁可失败，不可静默漂移）

## 多局扩展设计

多局（武清 + N 个路局）是本设计的一等公民而非事后补丁：单局只是"区域数为 1"的特例。

### 区域注册表（DB 表 + 设置页管理）

新增表 `relay_gateways`，由"系统设置"页管理（增删改、启用/禁用、连通性测试）：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| `code` | `luju` / `tianjin` | 区域码，集群表新增 `region_code` 挂接 |
| `name` | `路局A` | 展示名 |
| `http_base_url` | `http://10.10.1.1:8443` | 该局网关 HTTP 腿；**空 = 直连区域** |
| `ssh_jump` | `tunnel@10.10.1.1:22` | 该局跳板；空 = 不加 `-J` |
| `status` | `enabled` / `disabled` | 单局摘除排障，不动其他局 |

- **直连即特例**：任何 `http_base_url` / `ssh_jump` 均为空的区域（如武清本地）三条通道全部走原直连路径——多局设计是单局设计的严格超集，存量部署零迁移
- **全局总开关**：`features.yaml` 的 `features.relay_gateway`（显式 opt-in，默认 `false`，mtime 热加载免重启）作一键回退；区域级启停走设置页
- **新增路局的标准动作** = 设置页加一行 + 该局装同构网关（档 1 为一对）+ 提交一条防火墙申请，平台代码零改动

### 三通道按区域路由汇总

| 通道 | 解析链 | 载体 |
| --- | --- | --- |
| Edge Admin API | node → cluster.region_code → relay_gateways.http_base_url | `X-Edge-Target` 头机制不变 |
| 裸 SSH | `resolve_relay_jump(ip)` → relay_gateways.ssh_jump | `_build_ssh_cmd` 加 `-J` |
| Ansible | inventory 节点行 `ansible_ssh_common_args`（渲染器按区域写入） | ProxyJump，节点行级 |

### 跨局 IP 重叠（设计决策）

已核实硬约束：inventory 以 IP 为主键（`edge_cluster.hosts` 映射、`get_ssh_password(ip)`、`run_playbook(ip)` 均按 ip 寻址），两局网段重叠会在 inventory 层撞主机（同名主机视为同一台）。

**决策（2026-09-22）**：MVP 按**各局网段不重叠**设计（铁路专网按局规划网段，运维约定保证）。若未来实际出现重叠，再立项做 **IP 别名化**（inventory 主键改节点别名 + `ansible_host=真实IP`，`run_playbook` 传别名）。触发症状即立项信号：inventory 保存报主机重复、跨局任务串节点——不预留半成品。

### 按区域的下发与体检

- 渲染 / 推送 / 校验以**区域为事务单元**：一局失败只告警该局，不阻塞其他局发布
- 体检支持 `?region=<code>` 单局体检与全量巡检（见"链路体检"）

## 平台改动点清单

| # | 位置 | 改动 | 量级 |
| --- | --- | --- | --- |
| 1 | `edge_client.py` | `edge_url` 构造加网关模式分支（按区域注册表解析）+ 请求注入 `X-Edge-Target` | 小 |
| 2 | `ansible_service._build_ssh_cmd` | 加 `-J` 选项（`resolve_relay_jump(ip)` 按区域解析；覆盖 edge_autostart + node_task 全部裸 SSH） | 极小 |
| 3 | inventory 渲染（`inventory_service.py`） | 节点行追加 `ansible_ssh_common_args`（渲染器按区域写入）；不动 `ansible_ssh_pass` | 小 |
| 4 | 区域注册表 | 新增 `relay_gateways` 表 + 设置页管理端点/页面；集群表加 `region_code` | 中 |
| 5 | 网关配置下发 | 新增 service + 端点（按区域渲染 conf + fleet 推送 reload + 校验） | 中 |
| 6 | SSE 日志流 | ProxyJump 后 ansible stdout 仍在武清聚合，零改动；HTTP 侧 `proxy_buffering off` 已在网关解决 | 零 |
| 7 | 前端 | 业务页面零改动（寻址变化全在后端）；仅设置页新增区域管理块 | 小 |
| 8 | `_run_ssh_with_fallback`（仅档 1） | 连接类失败立即重试一次，覆盖 VIP 漂移窗口 | 极小 |

**开关设计**（全局总开关 + 区域注册表，缺省关闭 = 现状直连）：

| 层级 | 载体 | 作用 |
| --- | --- | --- |
| 全局总开关 | `features.yaml` 的 `relay_gateway`（显式 opt-in，默认 `false`） | 一键回退直连，改文件热生效免重启 |
| 区域级启停 | `relay_gateways.status`（设置页） | 单局摘除排障，不影响其他局 |
| 区域级路由 | `relay_gateways.http_base_url` / `ssh_jump` | 空 = 该区域直连（武清本地即此形态） |

灰度支持按腿 / 按局进行：新区域先只配 `ssh_jump` 验证 SSH 腿，再配 `http_base_url` 切 HTTP 腿；测试局先行、生产局后切。

**测试计划（TDD，AGENTS 约定 #16）**：

- `_build_ssh_cmd` 带 `EDGE_RELAY_JUMP` 时命令含 `-J` 段、裸跑时不含（单测，monkeypatch env）
- `EdgeClient` 网关模式：`edge_url` 指向网关、请求头含 `X-Edge-Target: {ip}:{management_port}`；直连模式回归不变
- inventory 渲染：设 `EDGE_RELAY_SSH_ARGS` 时组变量出现且 `ansible_ssh_pass` 原样保留
- 区域路由：`resolve_relay_jump(ip)` 按集群区域返回正确跳板；直连区域返回 None；区域 `disabled` 时回退直连
- （档 1）`_run_ssh_with_fallback`：连接类失败自动重试一次，重试后成功按成功处理
- 网关下发渲染器：按区域输出 N 份 conf，map 行 / PermitOpen 行与该局节点一致，白名单外目标拒绝分支存在
- 现有 `test_publish_response.py` 等源码守卫若触及 `_build_ssh_cmd` 函数体需同步更新

## 安全设计

1. **SSRF 是本方案第一风险**。HTTP 反代按 header 选 upstream 等于"武清可指定任意路局内网地址"。网关必须按平台下发的白名单拒绝清单外目标（nginx 的 403 分支），否则一个泄露的 `EDGE_ADMIN_KEY` 就能横扫路局内网。多局下白名单按局隔离（每台网关只认本局节点），单局失守不波及他局。
2. **跳板账号最小化（建议，非强制）**：`tunnel` 仅密钥认证、无有效 shell、`PermitOpen` 逐节点放行、禁 agent/X11/tunnel 转发。**当前部署实况**为普通账号（如 `jboss`）+ 平台默认 SSH 身份，平台已支持该形态。
3. **传输加密**：HTTP 腿走 TLS（内部 CA 证书，跨广域网段必须）；SSH 腿天然加密；SM4 载荷照旧端到端。
4. **密钥管理（建议）**：跳板私钥（`relay_ed25519`）仅存在于武清后端主机；网关侧只放公钥。密钥文件缺失时平台**省略 `-i`** 并回退默认 SSH 身份/config/agent（不报错）。
5. **审计**：网关 access log 记录源 IP / 目标 / 耗时；平台侧沿用 `sys_audit_log`；可选 tlog 录制跳板会话。
6. **网关主机加固**：最小安装、fail2ban、进 ansible 受管域，纳入与节点一致的安全基线。
7. **已知局限声明**：白名单是目标级而非操作级，网关无法区分"发布路由"与"删除路由"（方案一/二的集中审计可覆盖，方案三接受该残余）。

## 运维与可观测

### 链路体检

诊断链路变长（武清→网关 / 网关→节点 / 节点服务本身），配套一个全局"链路体检"动作（新端点，设计为只读）：

```text
POST /api/v1/relay/health-check[?region=luju]   # 不带 region = 全量巡检
  → 段 1：网关 8443 可达 + TLS 有效
  → 段 2：跳板 22 可达（ssh -W 空转一圈）
  → 段 3：抽样节点（每集群取 1 台）经两条腿探活：SSH:ansible_port + mgmt_port
  → 返回分段结果与耗时
```

前端在"节点管理"侧边提供入口；段级失败直接指明该修哪里（防火墙 / 网关配置下发 / 节点本身）。

### 已知故障模式

| 现象 | 根因定位 | 处置 |
| --- | --- | --- |
| HTTP 腿全部 403 | 节点不在 map 白名单（换 IP 后忘下发） | 触发配置下发 |
| SSH 腿 `Connection refused`（经跳板） | PermitOpen 未含该节点:22 | 触发配置下发 |
| HTTP 腿 502/504 | 网关→节点不通（节点宕/端口变更） | 查节点 |
| HTTP 腿 413 | 请求体超网关 `client_max_body_size`（当前部署 32m），典型场景是**静态资源 zip 发布**（zip 整体作为 PUT body 经网关转发） | 缩小 zip / 改直连发布 / 调大网关该值 |
| 全部超时 | 防火墙规则失效或网关宕机 | 段 1 体检 + 网关主机 |
| 某局全挂、他局正常 | 该局网关宕机 / 区域被禁用 / 该局规则失效 | 带 region 体检 + 设置页查区域状态 |
| 发布成功但配置未生效 | （同现有排障，与网关无关） | 按 AGENTS #35 文件探针法排查 |

## 已知代价与边界

选方案三即接受以下代价：

1. **无排队吸收**：防火墙规则未批准期间整条链路不可用，发布失败只能等。方案三解决的是"以后不再为节点增减申请"，不是"审批期间继续干活"。
2. **映射投影税**：节点清单变化必须下发所在局网关，漏发即故障。自动化下发后仅剩"忘触发下发"一种人祸，靠下发结果校验 + 告警兜底。多局下按局隔离，一局漏发不影响他局。
3. **诊断链路变长**：三段式排障，靠链路体检动作缓解。
4. **带宽汇聚点**：所有 SSH（含脚本 base64 分发）与 HTTP 过一个网关。节点多 + 大文件分发场景需按规模给带宽（装机时评估，任务中心批量分发的瞬时峰值重点看）。**另：HTTP 腿的请求体受网关 nginx `client_max_body_size` 约束（当前部署 32m），静态资源 zip 发布超过即 413**；该值目前不在平台下发渲染范围内（位于网关机本地 `nginx.conf`），需随部署单独调整。
5. **单点**：网关宕机 = 该路局失管（缓解见"网关高可用"章；多局下故障域按局隔离，他局不受影响）。
6. **网关机群运维**：N 局 = N 台同构网关机（fleet 模板一次成型），装机与升级按局滚动。
7. **审计粒度**：目标级而非操作级（见安全设计第 7 条）。

## 实施计划与回退

### 分阶段计划

```text
D1  首局选定网关机（虚机即可；档 1 为一对），装 OpenResty + 配 sshd 跳板账号
    手工放置初始 map / PermitOpen（渲染脚本离线版）
    与防火墙同批找网管：VIP 分配 + 免费 ARP 放行（三项前提见"网关高可用"）
    提交该局唯一防火墙申请：武清后端网段 → 网关 VIP TCP 22, 8443
    （首局即模板局：后续每新增一局 = 复用模板装机 + 一条规则 + 设置页加一行）
D2  平台三处寻址改写 + 开关（默认 direct，可回退）+ 单测（TDD）
D3  规则生效后灰度一个测试集群，按腿验证：
    ① 发布路由（HTTP 腿：map 白名单 + SSE 透传）
    ② 自启动开关（裸 SSH 腿：-J）
    ③ 脚本任务 + 文件分发 + SSE 日志（ansible 腿：ProxyJump）
D4  全量切换 + 配置下发功能上线 + 链路体检端点 + 网关监控告警
    档 1：HA 演练（拔 GW-A → 秒级漂移 → 全链路恢复 → 回切）
```

### 回退预案

关闭三个环境变量 → 重启后端 → inventory 重渲染（无 ProxyJump）→ 回直连。存量防火墙规则在观察期（建议 2 周）满、体检连续绿后再申请撤销。

## 与方案一/二的演进衔接

- `EdgeClient` 的 URL 构造与 `_build_ssh_cmd` 就是 transport 边界：切方案一（执行网关）时把"转发"换成"执行"，调用方不动；inventory 删 ProxyJump 行即回
- 网关机、防火墙规则、TLS 证书、内部 CA 全部复用
- 若后续需要"审批期排队"，按方案二在每局网关机上加 Agent（拉模式），执行面与本方案的转发面可并存过渡；区域注册表（`relay_gateways`）天然复用为 Agent 注册中心，多局无需重构
- 若网络组批准站点隧道，可切方案四（终局形态）：区域注册表清空该局路由即回直连（此时直连即经隧道），详见"方案四详析（备选）"

## 方案四详析（备选）：VPN 站点组网

### 定位：网络层打通 vs 应用层借道

方案三是**应用层借道**——每条通道（HTTP、SSH、Ansible）单独设计穿法；方案四是**网络层打通**——两中心之间建加密隧道，内网在 IP 层互联，所有流量天然可达：平台零改动，未来新增任何协议也零成本。代价不在技术，在网络治理审批（见"审批风险"）。

### 架构（点对点形态）

```text
武清中心                                          路局中心
┌────────────────┐    WireGuard 加密隧道(UDP)  ┌────────────────┐
│ 武清 VPN 网关    │ ◄═══════════════════════► │ 路局 VPN 网关    │
│ wg0: 10.99.0.1 │    唯一防火墙规则:           │ wg0: 10.99.0.2 │
│ (可复用现有网关机)│    → 路局网关 UDP 51820     │ (虚拟机即可)     │
└──────┬─────────┘                            └──────┬─────────┘
       │                                             │
   管理端(FastAPI)          静态路由: 路局网段 → wg0      局内节点
       └───── 用节点真实 IP 直接访问 ──── 经隧道 ──────────┘
```

两种寻址形态：

- **形态 A：点对点路由（推荐）**——不改节点 IP，武清侧加静态路由"路局网段 → wg0"，inventory / EdgeClient / playbook 全部原样，平台零改动
- **形态 B：overlay 编址**——节点另有隧道网身份 IP，仅 NAT 后组网或需隐藏真实拓扑时用，引入映射复杂度，不建议

### 技术选型

| 候选 | 评价 |
| --- | --- |
| **WireGuard（首选）** | 内核态（Linux 5.6+ 内置），约 4k 行代码，ChaCha20-Poly1305 + Noise_IK，性能近线速，配置一张表读完；静默协议（无效包不响应，端口扫描不可探测） |
| IPSec (strongSwan) | 网络组更熟，但配置重、调试痛苦 |
| OpenVPN | 用户态、性能差，仅对方强制 TLS 类隧道时用 |
| Tailscale/NetBird | 依赖外部协调服务器，专网环境不受控，不适用 |

### 配置样例

```ini
# 武清 /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <武清私钥>
Address = 10.99.0.1/30

[Peer]                                  # 路局A
PublicKey = <路局A公钥>
AllowedIPs = 192.168.0.0/24             # 该局节点网段（= 加密过滤器+路由）
Endpoint = <路局A专线/可达IP>:51820
PersistentKeepalive = 25
```

```ini
# 路局A /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <路局A私钥>
Address = 10.99.0.2/30
ListenPort = 51820

[Peer]
PublicKey = <武清公钥>
AllowedIPs = <武清后端网段>              # 只放行管理端网段，反向收紧
```

配套：`ip_forward=1` + 转发放行（网关做路由器**不做 NAT**，保持节点真实 IP 可见）；`wg0 MTU=1420`（封装开销 60~80 字节，漏配出"小包通大包断"经典故障）。

### 多局扩展（hub + spoke）

```text
                 武清 wg hub (10.99.0.1)
                /        |         \
          局A spoke    局B spoke   ... 局N spoke
          192.168.0/24 192.168.1/24    各局网段
```

- 武清网关每局一个 Peer，`AllowedIPs` 对应各局网段；每局一条 UDP 规则
- 局间天然隔离：WireGuard 默认不做 spoke 间转发，一局被攻破不横向到他局
- 各局网段不重叠仍是硬前提（与方案三的 IP 决策一致）；重叠需 NAT，复杂度陡增
- 新增一局 = 网关加一个 Peer + 一条规则 + 一条路由，局数级成本

### 平台侧改动 = 严格零

| | 方案三 | 方案四 |
| --- | --- | --- |
| `edge_client.py` | 区域路由 + `X-Edge-Target` | 不动 |
| `_build_ssh_cmd` | 加 `-J` | 不动 |
| inventory | 节点行写 ProxyJump | 不动 |
| 区域注册表 / 设置页 | 需要 | 不需要 |
| 配置下发机制 | 需要（白名单投影） | 不需要 |
| 体检 | 三段式端点 | `ping` / `traceroute` 即体检 |

### 安全评估

优势：现代加密全套（前向保密、防重放、3 分钟重协商）；密钥只在两侧网关；`AllowedIPs` 白名单语义内建于协议（路由即授权，比 nginx map 白名单更底层）。

风险与管理面：

1. **L3 打通 = 两网在 IP 层"合并"**，"防火墙隔离"这一安全属性被改变——安全部门大概率会挑战
2. **网关成为跨域边界设备**：按等保/行业规范，跨安全域边界通常要求串联防火墙/IDS 做流域控，裸隧道可能被认定为"绕过边界审计"
3. **密钥管理**：武清私钥泄露 = 隧道被整体接管，需轮换与保管流程

### 审批风险（此前"不推进"的原因）

1. **传输形态敏感**：UDP + 封装隧道，企业边界防火墙普遍默认禁，且常明文规定"禁止私搭隧道/VPN"（防绕过审计）
2. **审批级别不同**：逐节点开 TCP 端口是运维申请；建站点隧道是**网络架构变更申请**，第三方网络部门审批难度与周期远超初衷
3. **反向成立**：若网络是自管的，此条不存在——方案四直接升级为最优解（一条 UDP 规则永久解决，前述全部复杂度不需要存在）

### 与方案三的关系：路径与终局

两者不互斥、共享基础设施：

- **网关机同台**：路局侧方案三网关机将来加装 WireGuard 即 VPN 网关
- **防火墙规则共存**：TCP 规则（方案三）与 UDP 规则（方案四）互不干扰
- **切换路径现成**：VPN 批准后，区域注册表清空该局 `http_base_url` / `ssh_jump` → 三条通道自动回直连（此时直连即经隧道），方案三转发层闲置待命

结论：**方案三是不依赖网络组审批的落地路径；方案四是审批能过时更彻底的终局形态**。按方案三先干起来（业务等不起），VPN 审批并行试探，批下来随时切换，批不下来方案三自洽终局。

## 设计决策记录

| 日期 | 决策 | 理由 |
| --- | --- | --- |
| 2026-09-22 | 多局按区域路由设计；跨局 IP 按不重叠假设，重叠实际发生时再立项 IP 别名化 | inventory 以 IP 为主键是硬约束；专网按局规划网段使重叠概率低，别名化复杂度不值得提前支付 |
| 2026-09-22 | 区域注册表用 DB 表 + 设置页管理（否决 env JSON 种子） | 符合平台"设置页管理"风格；支持运行时单局启停与连通性测试，多局下 env 无法承载 |
| 2026-09-22 | 网关 HA 推荐档 1（keepalived VIP 双机，秒级漂移）；档 2（平台感知切换）否决 | 平台零改动、防火墙零增量；多局下每局复制模板 |
| 2026-09-22 | 方案四（VPN）定位为备选终局：暂不落地但保留详析与切换路径 | 审批风险高（UDP/封装隧道常被禁）；网络自有则一条 UDP 规则 + 平台零改动即最优，与方案三共享网关机、规则共存 |

## 待决事项

| # | 事项 | 影响 |
| --- | --- | --- |
| 1 | 网关机由谁提供与运维（路局侧虚机规格、带宽） | D1 计划 |
| 2 | 内部 CA / TLS 证书签发流程 | 通道 A 落地 |
| 3 | 一期 HA 档位：档 0（基线）还是档 1（VIP 双机，推荐）；档 1 需网管确认三项前提（见"网关高可用"） | 每局成本 +1 台虚机 |
| 4 | `ssh -W` 在 nologin shell + PermitOpen 配置下的实测 | 跳板账号最终形态 |
| 5 | 武清 → 路局是否已有可复用的出向通道（影响方案二零规则可行性，仅记录） | 演进路线 |

## 实现补充（2026-09-22）

以下为实现期相对本文初稿的收敛（**以代码为准**）：

- **执行过程可视化**：`init`/`push` 由同步请求改为 **SSE 流式**（与节点安装同模型）；前端复用 `NodeExecutionResultDrawer` 实时显示 ansible 逐行输出、进度与用时；**不再使用任务注册表/轮询**。
- **总开关**：由 `EDGE_RELAY_ENABLED` 环境变量迁至 `features.yaml` 的 `features.relay_gateway`（显式 opt-in、默认关；mtime 热加载，改完即时生效免重启）。
- **注册表变更生效**：CRUD 后必须 `await ensure_fresh(force=True)`；仅 `invalidate()` 不足（同步读取方不判 TTL，会等到重启才生效）。
- **跳板自环防护**：跳板主机 == 目标 ip 时视为直连，避免 ssh `jumphost loop`（实测 rc=4）。
- **跳板专用密钥为建议**：`relay_ed25519`/`EDGE_RELAY_SSH_KEY` 缺失时省略 `-i`，回退平台默认身份（当前实况即此）。
- **sshd 跳板配置**：新增独立 root 通道（界面「配置跳板转发」/ `POST /relay/gateways/{id}/sshd-setup`）；含备份、`sshd -t`、`sshd -T` 生效性验证、失败自动回滚、仅 reload；root 凭据仅本次注入清单并还原。
- **PermitOpen 厂商差异**：重复指令仅首个生效；LinxOS 不支持逗号 → 首选单条逗号，`sshd -t` 失败自动回退为仅 `AllowTcpForwarding yes`。
- **节点范围**：nginx 流量 map 仅含启用节点；sshd SSH **管理**白名单含全部节点（含禁用）。
- **待写入配置预览**：只读 `GET /relay/gateways/{id}/config-preview`（界面「查看配置」），ansible 不可用时手工配置兜底。
- **中继可见性**：跳板运行期注入清单、不在命令行，故展示用 command 追加 `# [中继] 经跳板 …`。
