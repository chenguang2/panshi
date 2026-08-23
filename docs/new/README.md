# 磐石 Admin 操作手册（数据接入层·从零搭建）

> 本文为磐石 Admin 后台系统的设置及使用介绍，供后台管理人员快速入手使用。
> 手册从一个**全新的空系统**开始，按实际工作顺序完整搭建一套可用的网关接入环境，每一步均配有操作路径、界面截图和验证方法。

# 统一接入平台简介

	磐石 Admin 是统一接入平台的管理端，提供对 Edge 网关节点的统一配置管理：动态路由、负载均衡、插件扩展（日志/限流/链路追踪等）、HTTPS 证书、四层代理、DNS 代理，以及配置发布与版本回滚。

主要解决了以下问题：

- 网关配置集中管理，一处修改、批量发布到多台节点。
- 发布带版本记录，出问题可一键回退。
- 无需登录每台机器改配置，降低人为失误。

# 演示环境约定

> 全文使用同一套演示环境，前后章节的数据互相衔接，请按章节顺序操作。

| 项目 | 值 |
|---|---|
| 管理平台地址 | http://localhost:12345/ |
| 管理员账号 | admin / panshi123 |
| 数据库 | 本地 SQLite 空库（第 0 章准备） |
| 网关节点 ×3 | 192.168.0.13 / 14 / 15（机器上已预装 OpenResty 与 Edge 软件；空库中平台无记录，需按第 2 章重新录入） |
| OpenResty 路径 | /work/jboss/uapm/openresty |
| Edge 路径 | /work/jboss/uapm/uap-edge |

# 目录

手册分两篇：**从零搭建篇**按依赖顺序从空系统到全链路可用；**进阶与运维篇**覆盖左侧菜单其余功能，可按需查阅。

## 第一篇 · 从零搭建（第 0-12 章）

| 章 | 内容 | 文件 |
|---|---|---|
| 0 | 登录与初始准备 | [00-login.md](00-login.md) |
| 1 | 添加集群 | [01-cluster.md](01-cluster.md) |
| 2 | 添加节点 | [02-nodes.md](02-nodes.md) |
| 3 | 修改 edge.env（新增端口） | [03-edge-env.md](03-edge-env.md) |
| 4 | 使用全局规则 | [04-global-rules.md](04-global-rules.md) |
| 5 | 配置插件元数据 | [05-plugin-metadata.md](05-plugin-metadata.md) |
| 6 | 使用插件组 | [06-plugin-configs.md](06-plugin-configs.md) |
| 7 | 添加上游 | [07-upstreams.md](07-upstreams.md) |
| 8 | 添加路由（高级匹配绑定端口） | [08-routes.md](08-routes.md) |
| 9 | 证书管理 | [09-certificates.md](09-certificates.md) |
| 10 | 四层代理 | [10-stream-proxy.md](10-stream-proxy.md) |
| 11 | DNS 代理 | [11-dns-proxy.md](11-dns-proxy.md) |
| 12 | 绑定域名并验证 | [12-domain-verify.md](12-domain-verify.md) |

## 第二篇 · 进阶与运维（第 13-22 章，覆盖左侧菜单剩余项）

| 章 | 内容（菜单项） | 文件 |
|---|---|---|
| 13 | 概览 | [13-overview.md](13-overview.md) |
| 14 | 静态资源 | [14-static-resources.md](14-static-resources.md) |
| 15 | DNS代理[HTTP] | [15-dns-http.md](15-dns-http.md) |
| 16 | 指标总览与指标查询 | [16-metrics.md](16-metrics.md) |
| 17 | 统一管理 | [17-central-management.md](17-central-management.md) |
| 18 | 插件开关 | [18-plugin-switches.md](18-plugin-switches.md) |
| 19 | 用户管理 | [19-users.md](19-users.md) |
| 20 | 数据库管理 | [20-database-management.md](20-database-management.md) |
| 21 | Edge直连 / 数据导入 | [21-edge-client-import.md](21-edge-client-import.md) |
| 22 | 工具箱 / 自启动管理 / 节点任务 | [22-tools-autostart-tasks.md](22-tools-autostart-tasks.md) |

# 阅读约定

- 【】内为界面上可见的按钮/菜单/字段名称。
- 📷 截图待补充：该处画面暂缺截图，括号内为画面描述。
- 验证小节中的 curl 命令可直接复制执行。
