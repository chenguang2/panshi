# 磐石 Admin 操作手册（数据接入层·从零搭建）

> 本文为磐石 Admin 后台系统的设置及使用介绍，供后台管理人员快速入手使用。
> 手册从一个**全新的空系统**开始，每一步均配有操作路径、界面截图和验证方法。

## 统一接入平台简介

  磐石 Admin 是统一接入平台的管理端，提供对 Edge 网关节点的统一配置管理：动态路由、负载均衡、插件扩展（日志/限流/链路追踪等）、HTTPS 证书、四层代理、DNS 代理，以及配置发布与版本回滚。

主要解决了以下问题：

- 网关配置集中管理，一处修改、批量发布到多台节点。
- 发布带版本记录，出问题可一键回退。
- 无需登录每台机器改配置，降低人为失误。

## 演示环境约定

> 全文使用同一套演示环境，前后章节的数据互相衔接。

| 项目 | 值 |
| --- | --- |
| 管理平台地址 | <http://localhost:12345/> |
| 管理员账号 | admin / panshi123 |
| 数据库 | 本地 SQLite 空库（第 1 章准备） |
| 网关节点 ×3 | 192.168.0.13 / 14 / 15（机器上已预装 OpenResty 与 Edge 软件；空库中平台无记录，需按第 5 章重新录入） |
| OpenResty 路径 | /work/jboss/uapm/openresty |
| Edge 路径 | /work/jboss/uapm/uap-edge |

## 目录（与左侧菜单一一对应）

> 篇 = 侧边栏分组，章序 = 菜单项顺序；🔒 = 受功能开关控制（见第 1 章 1.3）。  
> 第一次从零搭建请先看第 1 章末尾的「快速上手路线图」（主线顺序 ≠ 目录顺序）。

### 开始之前

| 章 | 标题 | 文件 |
| --- | --- | --- |
| 1 | 登录与初始准备 | [01-login.md](01-login.md) |

### 第一篇 · 核心功能

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 2 | 概览 | [02-overview.md](02-overview.md) |
| 3 | 统一管理 | [03-central-management.md](03-central-management.md) |
| 4 | 集群管理 | [04-cluster.md](04-cluster.md) |
| 5 | 节点管理 | [05-nodes.md](05-nodes.md) |
| 6 | 上游管理 | [06-upstreams.md](06-upstreams.md) |
| 7 | 路由管理 | [07-routes.md](07-routes.md) |
| 8 | 插件组 | [08-plugin-configs.md](08-plugin-configs.md) |
| 9 | 插件元数据 | [09-plugin-metadata.md](09-plugin-metadata.md) |
| 10 | 全局规则 | [10-global-rules.md](10-global-rules.md) |
| 11 | 静态资源 | [11-static-resources.md](11-static-resources.md) |
| 12 | 插件开关 🔒 | [12-plugin-switches.md](12-plugin-switches.md) |

### 第二篇 · 证书管理

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 13 | CA 根证书 🔒 | [13-ssl-ca.md](13-ssl-ca.md) |
| 14 | 服务器证书与发布 🔒 | [14-ssl-server.md](14-ssl-server.md) |

### 第三篇 · 边缘网络

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 15 | edge.env 配置 🔒 | [15-edge-env.md](15-edge-env.md) |
| 16 | 四层代理 🔒 | [16-stream-proxy.md](16-stream-proxy.md) |
| 17 | DNS代理[UDP] 🔒 | [17-dns-proxy.md](17-dns-proxy.md) |
| 18 | DNS代理[HTTP] 🔒 | [18-dns-http.md](18-dns-http.md) |

### 第四篇 · 监控

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 19 | 指标总览 🔒 | [19-metrics-dashboard.md](19-metrics-dashboard.md) |
| 20 | 指标查询 🔒 | [20-metrics-query.md](20-metrics-query.md) |
| 21 | ClickHouse 配置 🔒 | [21-clickhouse-config.md](21-clickhouse-config.md) |

### 第五篇 · 运维管理

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 22 | Edge直连 🔒 | [22-edge-client.md](22-edge-client.md) |
| 23 | 数据导入 🔒 | [23-data-import.md](23-data-import.md) |
| 24 | 工具箱 🔒 | [24-tools.md](24-tools.md) |
| 25 | 自启动管理 🔒 | [25-autostart.md](25-autostart.md) |
| 26 | Ansible 主机清单 🔒 | [26-ansible-inventory.md](26-ansible-inventory.md) |
| 27 | 节点任务 🔒 | [27-node-tasks.md](27-node-tasks.md) |
| 28 | 中继区域管理 🔒 | [28-relay-gateways.md](28-relay-gateways.md) |

### 第六篇 · 系统管理

| 章 | 标题（菜单项） | 文件 |
| --- | --- | --- |
| 29 | 数据库管理 🔒 | [29-database-management.md](29-database-management.md) |
| 30 | 数据迁移 🔒 | [30-db-migration.md](30-db-migration.md) |
| 31 | 备份与容灾 🔒 | [31-backup-management.md](31-backup-management.md) |
| 32 | 审计日志 🔒 | [32-audit-log.md](32-audit-log.md) |
| 33 | 用户管理 | [33-users.md](33-users.md) |

### 附录（客户端环境配置与专题）

| 附录 | 内容 | 文件 |
| --- | --- | --- |
| 附录 A | 修改 hosts 文件（域名指向网关） | [附录A-修改hosts.md](附录A-修改hosts.md) |
| 附录 B | 修改 DNS（内网 DNS 解析） | [附录B-修改DNS.md](附录B-修改DNS.md) |
| 附录 C | 下载根证书并安装到 Chrome | [附录C-安装根证书到Chrome.md](附录C-安装根证书到Chrome.md) |
| 附录 D | 绑定域名与全链路验证（主线收官教程） | [D-domain-verify.md](D-domain-verify.md) |
| 附录 E | 集群配置漂移检测 | [E-drift-detection.md](E-drift-detection.md) |
