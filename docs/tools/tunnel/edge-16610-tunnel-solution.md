# 多集群网关管理平台访问隧道方案（13 → 15 经 14:16610 中继）

> 环境模拟：三台服务器 `192.168.0.13 / .14 / .15`，模拟"内外网隔离 + 单向可达"的生产网络。
> 目标：`192.168.0.13` 通过本地 `9999` 端口，**只经过 `192.168.0.14:16610`**，访问到 `192.168.0.15:12345` 的磐石 Admin 管理后端；**13 与 15 之间不允许任何直连**。
> 方案：gost v3.2.6 `tunnel` 协议（中继反向隧道）+ firewalld 防火墙（含出站隔离 direct 规则）。
> 状态：✅ 已跑通并验证（2026-08-15）。

---

## 1. 网络拓扑与约束

```
    ┌────────────────────────────────────────────────────────┐
    │                    模拟网络 192.168.0.0/22              │
    │                                                        │
    │   13 (server1)                14 (server2)             │
    │   内网节点                    中继节点（硬件设备）        │
    │   gost visitor:9999          gost tunnel server:16610  │
    │   openresty:16610/16620      （原 openresty 网关已停）  │
    │        │                          │                   │
    │        │ ① 可访问 14 任意端口       │                   │
    │        └──────────────────────────▶│                   │
    │                                    │  ② 15 只能访问     │
    │        │                           │     14:16610      │
    │        │                           │◀──────────────────│
    │        │                           │                   │  15 (server3)
    │        │                           │                   │  服务端
    │        │                           │                   │  gost client (rtcp)
    │        │                           │                   │  磐石 Admin:12345
    │        │                           │                   │  openresty:16610/16620
    │        │   ③ 13→15 直连：禁止       │                   │
    │        └──────────────────────────────────✗──────────▶│
    │        │   ④ 15→13 直连：禁止（网络层阻断）              │
    │        │◀──────────────────────────────────✗──────────│
    └────────────────────────────────────────────────────────┘
```

**连通性约束（必须严格遵守）**：

| 方向 | 可达性 | 实现方式 |
|---|---|---|
| 13 → 14 | ✅ 任意端口 | firewalld 放行（trusted 区） |
| 13 → 15 | ❌ 全部禁止 | **firewalld direct 规则**（13 出站 DROP→15） |
| 15 → 14 | ⚠️ 仅 `16610` | **firewalld direct 规则**（15 出站只放 14:16610，其余 DROP） |
| 15 → 13 | ❌ 全部禁止 | 网络层 ACL 阻断（非本机防火墙） |
| 14 → 15 | ❌ 全部禁止 | 网络层 ACL 阻断（非本机防火墙） |

> 说明：14↔15 及 15→13 的阻断发生在网络层（ACL/交换机），三台本机防火墙只负责本机策略。

---

## 2. 架构原理

利用 gost v3 的 **tunnel 协议**（relay 反向隧道，Cloudflare-Tunnel 模式），并采用 **WebSocket 承载**（`tunnel+ws`）：16610 端口对外是一个标准 HTTP/WebSocket 端点（HTTP Upgrade 握手 → 101 Switching Protocols → WebSocket 帧内跑隧道协议），可穿越 HTTP 代理 / 负载均衡 / WAF 等仅放行 HTTP(S) 的中间设备。

1. **15（服务端）主动拨出**到 `14:16610`，先做 HTTP Upgrade 到 WebSocket，再注册隧道（`tunnel.id` 相同），并声明本地目标 `127.0.0.1:12345`（磐石 Admin）。
   —— 这是 15 唯一的外出通道，完全符合"15 只能访问 14:16610"。
2. **13（访问端）**的 visitor 监听 `9999`，收到连接后经 `14:16610`（同样 WebSocket）进入隧道。
3. **14（中继）**的 tunnel server 将 13 的 WebSocket 访问连接桥接到 15 注册的 WebSocket 隧道连接上，数据在两端之间转发。
4. 15 侧收到数据后，由 rtcp handler 交付给本地 `127.0.0.1:12345`，响应原路返回。

全程 **13 与 15 零直连**；14 也**不需要反向拨号 15**（绕开了 14→15 网络层阻断）。

> 协议特征（实测）：`GET /ws` + `Upgrade: websocket` → 返回 `HTTP/1.1 101 Switching Protocols`；普通 `GET /` → `404`（标准 HTTP 响应）。WebSocket 默认路径 `/ws`。

---

## 3. 三台机器当前运行状态（快照）

| 主机 | 角色 | gost 进程 | 进程 PID | 关键监听端口 |
|---|---|---|---|---|
| 192.168.0.13 (server1) | 访问端 | `gost -L tcp://:9999 -F tunnel://192.168.0.14:16610?tunnel.id=<ID>` | 1907894 | 9999 (gost)、16610/16620 (openresty 网关) |
| 192.168.0.14 (server2) | 中继 | `gost -L "tunnel://:16610?tunnel.direct=true"` | 893154 | 16610 (gost)；**原 openresty 网关已停止** |
| 192.168.0.15 (server3) | 服务端 | `gost -L rtcp://:0/127.0.0.1:12345 -F tunnel://192.168.0.14:16610?tunnel.id=<ID>` | 1033545 | 12345 (磐石 Admin, uvicorn)、16610/16620 (openresty) |

- `tunnel.id = 5a1d5536-362d-4551-bbc9-27d7a76e1e6c`（13 与 15 必须一致）
- gost 版本：v3.2.6 (go1.25.4 linux/arm64)，二进制位于 `/root/gost`
- 日志：`/root/gost-13-tunnel.log`、`/root/gost-14-tunnel.log`、`/root/gost-15-tunnel.log`
- 15 的磐石 Admin：`/work/jboss/panshi/backend/.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 12345`

---

## 4. 防火墙配置（firewalld）

> 三台均使用 firewalld 0.6.6（iptables 后端），`systemctl enable --now firewalld`。
> **策略设计**：
> - 入站：`trusted` 区绑定 `enp1s0`（入站全放行）——与原 iptables "INPUT ACCEPT" 一致，不破坏 16610/16620/9999/12345 等既有服务；
> - 出站隔离（firewalld 原生不擅长出站策略）：用 **direct 规则**（`--direct --add-rule ipv4 filter OUTPUT ...`）实现，规则带优先级（0 优先匹配）。

### 4.1 通用步骤（三台相同）

```bash
systemctl start firewalld
systemctl enable firewalld
# 入站：把业务网卡放入 trusted 区（全放行）
firewall-cmd --permanent --zone=trusted --change-interface=enp1s0
firewall-cmd --reload
```

### 4.2 13（访问端）—— 封禁所有到 15 的出站

```bash
# 13→15 全部丢弃（模拟"13 无法访问 15 任何端口"）
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 0 -d 192.168.0.15 -j DROP
firewall-cmd --reload
```

验证：
```bash
firewall-cmd --direct --get-all-rules
# 输出: ipv4 filter OUTPUT 0 -d 192.168.0.15 -j DROP
```

### 4.3 14（中继）—— 无出站限制

```bash
# 仅需要 trusted 区；无 direct 规则（保持全放行，供 13/15 双向接入 16610）
firewall-cmd --direct --get-all-rules   # 应为空
```

### 4.4 15（服务端）—— 出站只允许新发起 14:16610，放行回包

```bash
# 优先级 0：放行回包（关键！否则 14→15 入站连接的回包被丢，表现为"14 到不了 15"）
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# 优先级 1：15 新发起的连接仅放行到 14:16610（隧道连接唯一通道）
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT
# 优先级 2：其余新连接到 14 一律丢弃
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 2 -d 192.168.0.14 -j DROP
firewall-cmd --reload
```

验证：
```bash
firewall-cmd --direct --get-all-rules
# 输出:
# ipv4 filter OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# ipv4 filter OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT
# ipv4 filter OUTPUT 2 -d 192.168.0.14 -j DROP
```

### 4.5 防火墙状态汇总

| 主机 | firewalld | 网卡 zone | direct 规则 |
|---|---|---|---|
| 13 | active/enabled | enp1s0 → trusted | `OUTPUT 0 -d 192.168.0.15 -j DROP` |
| 14 | active/enabled | enp1s0 → trusted | （无） |
| 15 | active/enabled | enp1s0 → trusted | `OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`（回包）、`OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT`、`OUTPUT 2 -d 192.168.0.14 -j DROP` |

> ⚠️ 14 的 trusted 区全放行也适用于 docker 相关链（docker0 无活动容器，无影响）；若后续在 14 使用 docker 需复核。

---

## 5. gost 隧道配置（WebSocket 承载）

> **两种承载模式**（`start-tunnel.sh` 第一个参数切换，默认 `ws`）：
> - `ws`（默认）— WebSocket 承载：`tunnel+ws://`，16610 为 HTTP/WebSocket 端点（可穿越 HTTP 代理/WAF），本方案当前采用。
> - `tcp`（备选保留）— 裸 TCP 承载：`tunnel://`，即最初跑通的版本，见 §5.6。

### 5.1 14 —— 隧道服务器（中继，WebSocket 端点）

```bash
cd /root && setsid nohup ./gost -L "tunnel+ws://:16610?tunnel.direct=true" > /root/gost-14-tunnel.log 2>&1 </dev/null &
```

- `tunnel+ws` = tunnel handler + **WebSocket listener**：16610 端口做 HTTP Upgrade 握手（默认路径 `/ws`）。
- `tunnel.direct=true`：直连路由模式，无需 ingress 主机名表，client 的 forwarder 决定最终目标。
- 监听 `0.0.0.0:16610`，同时接受 15（client 注册）与 13（visitor 访问）的 WebSocket 连接。

### 5.2 15 —— 隧道客户端（服务端，WebSocket 拨出）

```bash
cd /root && setsid nohup ./gost -L "rtcp://:0/127.0.0.1:12345" -F "tunnel+ws://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true" > /root/gost-15-tunnel.log 2>&1 </dev/null &
```

- `tunnel+ws` = tunnel connector + **WebSocket dialer**：主动拨出到 `192.168.0.14:16610`（15 唯一外出通道，符合拓扑）。
- `rtcp://:0/127.0.0.1:12345`：隧道连接的最终交付目标 = 本机 `127.0.0.1:12345`（磐石 Admin）。
- `tunnel.id` 与 13 保持一致；`ws.keepalive=true` 发送 WS Ping 帧（防空闲超时）。

### 5.3 13 —— 隧道访问端（visitor，WebSocket 拨出）

```bash
cd /root && setsid nohup ./gost -L "tcp://:9999" -F "tunnel+ws://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true" > /root/gost-13-tunnel.log 2>&1 </dev/null &
```

- 监听本地 `9999`，每个连接经 `14:16610`（WebSocket）进隧道，最终由 15 的 rtcp 交付到 12345。
- visitor 无需指定目标（direct 模式下由 client 端决定）。

### 5.4 WebSocket 参数（ws listener / ws dialer）

| 参数 | 位置 | CLI key | 默认 | 说明 |
|---|---|---|---|---|
| `path` | 两端 | `ws.path` / `path` | `/ws` | 握手 URI；**三端必须一致**（默认即可） |
| `host` | dialer | `ws.host` / `host` | 目标地址 | 握手 Host 头 |
| `keepalive` | dialer | `ws.keepalive` / `keepalive` | `false` | 发送 WS Ping 帧（推荐 `true`） |
| `ttl` | dialer | `ttl` / `keepalive.interval` | `15s` | Ping 间隔 |
| `enableCompression` | 两端 | `ws.enableCompression` | `false` | permessage-deflate |
| `header` | 两端 | `ws.header` | — | 自定义握手头 |

> 注意：keepalive 仅在 dialer 端（`-F` 的 13/15）；元数据 key 大小写不敏感（`keepAlive`/`keepalive` 均可）。经 HTTP 中间设备（代理/负载均衡，有连接空闲超时）时务必开启 keepalive。

### 5.5 WebSocket 端点自检（可选）

```bash
# 验证 14:16610 是标准 HTTP/WebSocket 端点
curl -si -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     http://192.168.0.14:16610/ws
# 期望: HTTP/1.1 101 Switching Protocols + Sec-WebSocket-Accept
# 其他行为: GET / → 404; GET /ws 无 Upgrade → 400; POST /ws → 405
```

### 5.6 备选方案：裸 TCP 承载（`tunnel://`，保留版本）

最初跑通的版本，16610 为 gost 私有隧道协议（裸 TCP，无 HTTP 语义）。**拓扑与 WebSocket 版完全一致**（13↔15 仍零直连，仅 14:16610 中转），仅协议不同。无 HTTP 中间设备时可选用。

```bash
# 14 —— 中继（裸 TCP）
cd /root && setsid nohup ./gost -L "tunnel://:16610?tunnel.direct=true" > /root/gost-14-tunnel.log 2>&1 </dev/null &

# 15 —— 服务端（裸 TCP）
cd /root && setsid nohup ./gost -L "rtcp://:0/127.0.0.1:12345" -F "tunnel://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c" > /root/gost-15-tunnel.log 2>&1 </dev/null &

# 13 —— 访问端（裸 TCP）
cd /root && setsid nohup ./gost -L "tcp://:9999" -F "tunnel://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c" > /root/gost-13-tunnel.log 2>&1 </dev/null &
```

两种模式的差异：

| | `ws`（默认） | `tcp`（备选） |
|---|---|---|
| URL scheme | `tunnel+ws://` | `tunnel://` |
| 16610 协议 | HTTP Upgrade + WebSocket | gost 私有协议（裸 TCP） |
| 普通 HTTP GET | 404/400（标准 HTTP 响应） | 无 HTTP 语义 |
| 穿越 HTTP 代理/WAF | ✅ | ❌ |
| ws.keepalive | 可配（推荐） | 不适用 |

用脚本切换：`./start-tunnel.sh ws` 或 `./start-tunnel.sh tcp`（三台都要用同一模式）。

---

## 6. 验证方法

### 6.1 端到端访问（核心验证）

```bash
curl http://192.168.0.13:9999/
# 期望：HTTP 200，返回磐石 Admin 前端 HTML（<title>磐石</title>）
```

### 6.2 隔离性验证

```bash
# 13 → 15 必须全部失败
sshpass ssh root@192.168.0.13 \
  'curl -m 3 http://192.168.0.15:12345/ ; curl -m 3 http://192.168.0.15:12346/ ; timeout 3 bash -c "echo > /dev/tcp/192.168.0.15/22"'
# 期望：全部 connect 失败/超时

# 15 → 14 仅 16610（隧道连接必须保持）
# 14 上查看：
ss -tn state established | grep 16610
# 期望：有 [::ffff:192.168.0.14]:16610 ↔ [::ffff:192.168.0.15]:<port> 的 established 连接
```

### 6.3 中继证据（14 的 gost 日志）

```bash
grep -E "192.168.0.1[35]" /root/gost-14-tunnel.log | tail
# 期望：同时出现 192.168.0.15（隧道注册）与 192.168.0.13（访问连接）两条记录
```

### 6.4 15 端交付证据

```bash
tail -5 /root/gost-15-tunnel.log
# 期望：日志出现 "<-> 127.0.0.1:12345"，且 inputBytes/outputBytes 有数据（如 81/692）
```

---

## 7. 数据流（一次完整请求）

```
浏览器/curl ──▶ 192.168.0.13:9999 (gost visitor)
      │  TCP 连接
      ▼
192.168.0.14:16610 (gost tunnel server, 中继桥接)
      │  经 15 预先注册的隧道连接转发
      ▼
192.168.0.15 (gost rtcp handler)
      │  交付本地
      ▼
127.0.0.1:12345 (磐石 Admin, uvicorn app.main:app)
      │  响应原路返回
      ▼
curl 收到 HTTP 200 + 磐石前端 HTML
```

---

## 8. 重启 / 恢复指南

### 8.1 重启隧道（按顺序）

> 三台服务器均执行 `./start-tunnel.sh [ws|tcp]`（模式必须一致，默认 ws）。手动命令如下（以 ws 为例；tcp 版见 §5.6）：

```bash
# 14（中继，最先）
cd /root && setsid nohup ./gost -L "tunnel+ws://:16610?tunnel.direct=true" > /root/gost-14-tunnel.log 2>&1 </dev/null &
# 15（client，自动重连 14）
cd /root && setsid nohup ./gost -L "rtcp://:0/127.0.0.1:12345" -F "tunnel+ws://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true" > /root/gost-15-tunnel.log 2>&1 </dev/null &
# 13（visitor）
cd /root && setsid nohup ./gost -L "tcp://:9999" -F "tunnel+ws://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true" > /root/gost-13-tunnel.log 2>&1 </dev/null &
```

### 8.2 回滚防火墙到 iptables 方案

```bash
# 每台机器：
systemctl stop firewalld && systemctl disable firewalld
iptables-restore < /root/iptables-backup-before-firewalld.rules
# 注意：备份文件在转换前已保存于各机 /root/iptables-backup-before-firewalld.rules
```

### 8.3 恢复 14 的原 openresty 网关（若需还原"查询服务"）

```bash
# 先停掉 14 上的 gost tunnel server（PID 893154）
kill 893154
# 以 jboss 用户重启原网关（进程原本以 -p /work/jboss/uapm/uap-edge 启动）
su - jboss -c 'cd /work/jboss/uapm/openresty && ./bin/openresty -p /work/jboss/uapm/uap-edge'
# 说明：14 的 gost 二进制 /root/gost 是实验期间从 13 拷贝的，恢复后可选删除
```

---

## 9. 排障记录（此前方案的失败原因，避免重蹈）

| 尝试 | 结果 | 原因 |
|---|---|---|
| 原配置 `gost -L tcp://:12346 -F tcp://127.0.0.1:12345 -F forward+tcp://192.168.0.14:16610` | ❌ 数据链路断 | ① v2→v3 破坏性变更：`-F tcp://` 在 v3 是裸 TCP 直通而非 HTTP 代理；② `-L tcp://:12346` 无目标地址时 dial 空地址 `:0`；③ 多跳链中直通 connector 无法中继到下一跳（16610 地址永远不会被拨号） |
| 原配置 `gost -L rtcp://:25000/192.168.0.15:12346` | ❌ 语义不符 | rtcp 的"远程监听"需要链路末端支持 Bind（仅 tunnel/relay/socks5/sshd）；无 `-F` 链时退化为本地监听+直连 15，绕不开 13→15 阻断 |
| 用 14 原 openresty 网关(16610)做 HTTP 反代转发到 15 | ❌ 404 / 超时 | ① 14 网关 HTTP 路由表为空（fdict 仅含 DNS stream 路由）；② **14→15 网络层阻断**，网关无法反向拨号 15（健康检查日志：`192.168.0.15:16610 unhealthy TIMEOUT`）；③ 网关无"双入连接桥接"能力 |
| 用 admin API(16620)给 14 配上游指向 15 | ❌ 请求挂起超时 | 上游节点 `192.168.0.15:16610` 从 14 不可达（物理阻断），转发在 TCP connect 处挂死 |
| **当前方案：gost tunnel 协议** | ✅ | 15 主动拨出注册 + 14 桥接，无需 14→15 拨号，天然满足拓扑 |

---

## 10. 限制与注意事项

1. **14:16610 协议为 HTTP/WebSocket**：原为 openresty HTTP 网关（HTTP 服务），现为 gost WebSocket 隧道端点——标准 HTTP Upgrade 握手（`101 Switching Protocols`），可穿越 HTTP 代理/WAF；普通 HTTP GET 返回 404。若还需要 16610 直接承载普通 HTTP 请求，需额外方案。
2. **14↔15、15→13 的阻断在网络层**（ACL），本机防火墙管不到；改动网络 ACL 会影响本方案（如放开 14→15 则原网关反代方案也可行）。
3. gost 进程当前为 `setsid nohup` 手动启动，**未配置 systemd 自启**；服务器重启后需按 §8.1 重新拉起（或补 systemd unit）。
4. 15 的磐石 Admin（uvicorn:12345）与 13/15 的 openresty 网关（16610/16620）不受本方案影响，保持原状。
5. 防火墙 direct 规则随 firewalld 持久化（`--permanent`），`firewall-cmd --reload` 后依然生效。

---

## 11. F5 负载均衡场景（14 = F5 VIP，Design A）

> 生产约束：**14 是 F5 虚拟服务器（VIP），不能运行任何程序**。gost 全部移到真实后端（15），F5 只做负载转发。
> 状态：✅ **已验证（2026-08-15）**——14 用 gost 纯 TCP 转发模拟 F5 行为，全链路 200。

### 11.1 架构

```
13 ──tunnel+ws──▶ 14:16610 (F5 VIP, 虚) ──F5 转发──▶ 池成员 15:16611 (gost tunnel server)
                                                        └─▶ rtcp(本地) ─▶ 15:12345 (磐石平台)
15 的注册: rtcp client ──▶ 127.0.0.1:16611 (本地回环，不依赖出站)
```

- **Design A 特性**：每台平台节点"自含"（tunnel server + rtcp 本地注册），13 的访问连接落到**任意**成员都能交付到该成员本地平台 → **F5 轮询即可，无需持久化**，天然水平扩展。
- **F5 配置要点**：
  - Virtual Server: `192.168.0.14:16610`，Profile: `tcp`（L4 字节透传，最简单；或 `http` 亦原生透传 WS Upgrade）
  - Pool: `{192.168.0.15:16611}`（VIP 端口 16610 ≠ 成员端口 16611，端口翻译是 F5 标准能力）
  - 多平台节点时 Pool 加成员即可，无需持久化

### 11.2 配置（三台）

```bash
# 14 = F5 模拟：纯 TCP 转发（不是 gost 隧道，仅模拟 F5 的 VIP→池转发）
gost -L "tcp://:16610/192.168.0.15:16611"

# 15 = 平台节点（自含，两个 gost 进程）
gost -L "tunnel+ws://:16611?tunnel.direct=true"                                            # tunnel server
gost -L "rtcp://:0/127.0.0.1:12345" -F "tunnel+ws://127.0.0.1:16611?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true"  # 本地注册→12345

# 13 = 访问端（指向 F5 VIP）
gost -L "tcp://:9999" -F "tunnel+ws://192.168.0.14:16610?tunnel.id=5a1d5536-362d-4551-bbc9-27d7a76e1e6c&ws.keepalive=true"
```

一键脚本：三台分别执行 `./start-tunnel-f5.sh`（按 IP 识别角色）。

### 11.3 关键前提与坑：15 的出站规则会误伤回包（已修复）

> ⚠️ **重要教训**：最初以为"14→15 被外部 ACL 阻断"，实际是 **15 自身出站规则误伤回包**：
> `15 OUTPUT DROP all → 14`（只放 16610）会把 **14→15 入站连接的回包**（SYN-ACK、数据包）也一起丢弃——SYN 到达 15 网卡（tcpdump 证实），但 15 的回包出不去，表现为"14 到不了 15"。
> 修复：15 的 OUTPUT 增加 **`ctstate ESTABLISHED,RELATED` 放行**（回包放行），新发起连接仍只允许 14:16610，拓扑语义不变。

修复后的 15 OUTPUT direct 规则（`setup-firewalld.sh` 已内置）：

```bash
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT   # 回包放行（关键）
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT        # 新发起仅 16610
firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 2 -d 192.168.0.14 -j DROP                               # 其余新发起丢弃
```

F5 模拟所需路径：

| 方向 | 端口 | 状态 |
|---|---|---|
| 14 → 15:16611 | TCP 16611 | ✅ 已通（回包放行后，无外部 ACL 需要放） |
| 13 → 14:16610 | TCP 16610 | ✅ 已满足（13→14 无限制） |
| 15 → 127.0.0.1 | 回环 | ✅ rtcp 本地注册 |

> 结论：真实 F5 场景下，"F5→池成员"路径通常天然存在于 F5 内网；本模拟环境因 15 的单向出站规则产生假性阻断，用 ESTABLISHED 回包放行修复即可，**无需改任何外部网络配置**。

### 11.4 验证结果（实测）

| 检查项 | 结果 |
|---|---|
| `curl http://192.168.0.13:9999/` | **HTTP 200**（磐石平台，0.14s）✅ |
| 14 F5 转发日志 | `13:40052 <-> 15:16611`，双向数据（328/835 字节）✅ |
| 15 tunnel server | `listener: ws` on :16611 ✅ |
| 15 rtcp 交付 | `dst:127.0.0.1:12345`，81/692 字节 ✅ |
| 13→15 直连 | 12345/22 全阻断 ✅ |
| 15 新发起→14 | 非 16610 阻断、16610 放行 ✅ |
