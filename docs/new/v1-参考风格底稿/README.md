# 磐石 Admin 操作手册（从零搭建版）

> 版本：1.0（编写中） | 适用系统版本：磐石 Admin
> 访问地址：`http://localhost:12345/`　|　默认账号：`admin` / `panshi123`

---

## 手册定位

本手册与旧版《磐石 Admin 使用手册》（`docs/user-manual.md`）的区别：

| | 旧手册 | 本手册 |
|---|---|---|
| 组织方式 | 按功能模块罗列 | 按"从零搭建一套可用网关"的实战主线 |
| 适合读者 | 查阅某个功能的用法 | 第一次上手、从空系统完整搭建 |
| 示例数据 | 通用示例 | 全程使用同一套演示环境，前后章节互相衔接 |

## 演示环境

| 项目 | 值 |
|---|---|
| 管理平台地址 | `http://localhost:12345/` |
| 登录账号 | `admin` / `panshi123`（管理员） |
| 数据库 | 本地 SQLite 空库 `data/manual-demo.db`（干净起点） |
| 集群 | 名称 `demo-cluster` / 显示名称 `演示集群` |
| 节点 ×3 | `192.168.0.13`、`192.168.0.14`、`192.168.0.15`（已预装 OpenResty + Edge） |
| OpenResty 路径 | `/work/jboss/uapm/openresty` |
| Edge 路径 | `/work/jboss/uapm/uap-edge` |
| HTTP 服务端口 | `16610`（原有）+ `5000`（新增，启用 HTTPS） |
| TCP 四层代理端口 | `8880`（stream 模块） |
| DNS 代理端口 | `53/UDP`（stream 模块） |

## 目录

| 章 | 文件 | 内容 |
|---|---|---|
| 0 | [00-login.md](00-login.md) | 登录、界面导览、准备干净的演示数据库 |
| 1 | [01-cluster.md](01-cluster.md) | 建立集群：集群是什么、各字段含义、创建步骤 |
| 2 | [02-nodes.md](02-nodes.md) | 建立节点 ×3：节点字段逐项解释、状态检测 |
| 3 | [03-edge-env.md](03-edge-env.md) | 修改 edge.env：新增 HTTPS 5000、TCP 8880、UDP 53 并发布 |
| 4 | [04-global-rules.md](04-global-rules.md) | 建立全局规则并发布 |
| 5 | [05-plugin-metadata.md](05-plugin-metadata.md) | 设置插件元数据 |
| 6 | [06-plugin-configs.md](06-plugin-configs.md) | 建立插件组（内置日志插件） |
| 7 | [07-upstreams.md](07-upstreams.md) | 建立上游 |
| 8 | [08-routes.md](08-routes.md) | 建立路由：高级匹配绑定端口 5000 |
| 9 | [09-certificates.md](09-certificates.md) | 根证书 → 生成证书 → 发布 |
| 10 | [10-stream-proxy.md](10-stream-proxy.md) | TCP 四层代理 8880 |
| 11 | [11-dns-proxy.md](11-dns-proxy.md) | DNS 代理 UDP 53 |
| 12 | [12-domain-verify.md](12-domain-verify.md) | 绑定域名并验证 HTTPS/TCP/UDP/DNS 全链路 |

## 阅读约定

- **📷 截图待补充**：该处画面暂缺截图，括号内为画面内容描述，可按描述补图。
- **⚠️ 注意**：容易出错或不可逆的操作提示。
- **✅ 验证**：确认本步操作生效的方法。

## 为什么是这个顺序？

```
集群(管理单元) → 节点(承载网关的机器) → edge.env(网关监听端口)
→ 全局规则(全站策略) → 插件元数据(插件静态属性) → 插件组(可复用插件集合)
→ 上游(真实业务后端) → 路由(流量入口规则) → 证书(HTTPS 加密)
→ 四层代理(TCP) → DNS 代理(UDP) → 域名验证(对外服务闭环)
```

先有"集群"才能挂"节点"；节点上的网关要监听哪些端口由 edge.env 决定；路由把流量转给上游；证书让 HTTPS 可用；四层代理和 DNS 代理是独立于 HTTP 的增值能力。每一步都是下一步的地基——跳步会导致后续页面无数据可选或发布失败。
