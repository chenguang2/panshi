# 磐石 Admin 操作手册（数据接入层·从零搭建）

> 本文为磐石 Admin 后台系统的设置及使用介绍，供后台管理人员快速入手使用。
> 手册从一个**全新的空系统**开始，按实际工作顺序完整搭建一套可用的网关接入环境，每一步均配有操作路径、界面截图和验证方法。

## 统一接入平台简介

  磐石 Admin 是统一接入平台的管理端，提供对 Edge 网关节点的统一配置管理：动态路由、负载均衡、插件扩展（日志/限流/链路追踪等）、HTTPS 证书、四层代理、DNS 代理，以及配置发布与版本回滚。

主要解决了以下问题：

- 网关配置集中管理，一处修改、批量发布到多台节点。
- 发布带版本记录，出问题可一键回退。
- 无需登录每台机器改配置，降低人为失误。

## 演示环境约定

> 全文使用同一套演示环境，前后章节的数据互相衔接，请按章节顺序操作。

| 项目 | 值 |
| --- | --- |
| 管理平台地址 | <http://localhost:12345/> |
| 管理员账号 | admin / panshi123 |
| 数据库 | 本地 SQLite 空库（第 1 章准备） |
| 网关节点 ×3 | 192.168.0.13 / 14 / 15（机器上已预装 OpenResty 与 Edge 软件；空库中平台无记录，需按第 3 章重新录入） |
| OpenResty 路径 | /work/jboss/uapm/openresty |
| Edge 路径 | /work/jboss/uapm/uap-edge |

## 目录

手册分两篇：**从零搭建篇**按依赖顺序从空系统到全链路可用；**进阶与运维篇**覆盖左侧菜单其余功能，可按需查阅。

## 第一篇 · 从零搭建（第 1-13 章）

| 章 | 内容 | 文件 |
| --- | --- | --- |
| 1 | 登录与初始准备 | [01-login.md](01-login.md) |
| 2 | 添加集群 | [02-cluster.md](02-cluster.md) |
| 3 | 添加节点 | [03-nodes.md](03-nodes.md) |
| 4 | 修改 edge.env（新增端口） | [04-edge-env.md](04-edge-env.md) |
| 5 | 使用全局规则 | [05-global-rules.md](05-global-rules.md) |
| 6 | 配置插件元数据 | [06-plugin-metadata.md](06-plugin-metadata.md) |
| 7 | 使用插件组 | [07-plugin-configs.md](07-plugin-configs.md) |
| 8 | 添加上游 | [08-upstreams.md](08-upstreams.md) |
| 9 | 添加路由（高级匹配绑定端口） | [09-routes.md](09-routes.md) |
| 10 | 证书管理 | [10-certificates.md](10-certificates.md) |
| 11 | 四层代理 | [11-stream-proxy.md](11-stream-proxy.md) |
| 12 | DNS 代理 | [12-dns-proxy.md](12-dns-proxy.md) |
| 13 | 绑定域名并验证 | [13-domain-verify.md](13-domain-verify.md) |

## 第二篇 · 进阶与运维（第 14-28 章，覆盖左侧菜单剩余项）

| 章 | 内容（菜单项） | 文件 |
| --- | --- | --- |
| 14 | 概览 | [14-overview.md](14-overview.md) |
| 15 | 静态资源 | [15-static-resources.md](15-static-resources.md) |
| 16 | DNS代理[HTTP] | [16-dns-http.md](16-dns-http.md) |
| 17 | 插件开关 | [17-plugin-switches.md](17-plugin-switches.md) |
| 18 | 数据库管理 | [18-database-management.md](18-database-management.md) |
| 19 | ClickHouse 配置 | [19-clickhouse-config.md](19-clickhouse-config.md) |
| 20 | 用户管理 | [20-users.md](20-users.md) |
| 21 | 统一管理 | [21-central-management.md](21-central-management.md) |
| 22 | 指标总览与指标查询 | [22-metrics.md](22-metrics.md) |
| 23 | Edge 直连 | [23-edge-client.md](23-edge-client.md) |
| 24 | 数据导入 | [24-data-import.md](24-data-import.md) |
| 25 | 工具箱 | [25-tools.md](25-tools.md) |
| 26 | 自启动管理 | [26-autostart.md](26-autostart.md) |
| 27 | Ansible 主机清单 | [27-ansible-inventory.md](27-ansible-inventory.md) |
| 28 | 节点任务 | [28-node-tasks.md](28-node-tasks.md) |

## 附录（客户端环境配置）

| 附录 | 内容 | 文件 |
| --- | --- | --- |
| A | 修改 hosts 文件（域名指向网关） | [附录A-修改hosts.md](附录A-修改hosts.md) |
| B | 修改 DNS（内网 DNS 解析） | [附录B-修改DNS.md](附录B-修改DNS.md) |
| C | 下载根证书并安装到 Chrome | [附录C-安装根证书到Chrome.md](附录C-安装根证书到Chrome.md) |

## 阅读约定

- 【】内为界面上可见的按钮/菜单/字段名称。
- 验证小节中的 curl 命令可直接复制执行。
