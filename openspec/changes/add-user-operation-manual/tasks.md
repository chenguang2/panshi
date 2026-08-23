# 任务：从零搭建用户操作手册

## 1. 准备干净演示环境

- [ ] 1.1 健康检查前后端（12344/12345）
- [ ] 1.2 数据库管理中新增/修改 SQLite 连接指向 `data/manual-demo.db` 并设为当前，重启后端
- [ ] 1.3 验证空库状态（仅 admin 账号、无集群）

## 2. 截图基建

- [ ] 2.1 建立 Playwright 截图脚本（登录态复用、统一视口、输出 docs/new/images/）
- [ ] 2.2 登录页与主界面导览截图（00-*）

## 3. 各章编写 + 配图（每章：作用→入口→字段解释→操作→发布→验证）

- [x] 3.0 更新第 0 章（00-login.md）：新增「功能开关前置检查」总表（受门控菜单项 ↔ features.yaml 开关名）
- [x] 3.1 第 1 章建立集群（01-cluster.md）
- [x] 3.2 第 2 章建立节点 ×3（02-nodes.md）
- [x] 3.3 第 3 章 edge.env 修改（03-edge-env.md）：HTTP 5000+HTTPS、TCP 8880、UDP 53；含「发布失败排查」小节（3.4，后续章节引用）
- [x] 3.4 第 4 章全局规则（04-global-rules.md）
- [x] 3.5 第 5 章插件元数据（05-plugin-metadata.md）
- [x] 3.6 第 6 章插件组含日志插件（06-plugin-configs.md）
- [x] 3.7 第 7 章上游（07-upstreams.md）
- [x] 3.8 第 8 章路由含高级匹配绑定端口（08-routes.md）
- [x] 3.9 第 9 章根证书/证书生成发布（09-certificates.md）
- [x] 3.10 第 10 章 TCP 四层代理 8880（10-stream-proxy.md）
- [x] 3.11 第 11 章 DNS 代理 UDP 53（11-dns-proxy.md）
- [x] 3.12 第 12 章域名绑定与全链路验证（12-domain-verify.md）：hosts 本机操作标注、路由匹配端口调整（16610→5000 重发布）、HTTPS/TCP/DNS 三链路验证

### 3A. 进阶与运维篇（第 13-22 章，覆盖左侧菜单剩余项）

- [x] 3.13 第 13 章概览（13-overview.md）：首页仪表盘状态速览与快捷入口
- [x] 3.14 第 14 章静态资源（14-static-resources.md）：ZIP 上传/发布/经路由分发验证
- [x] 3.15 第 15 章 DNS 代理[HTTP]（15-dns-http.md）：dns_upstream 查询规则、与 UDP 版差异
- [x] 3.16 第 16 章指标总览与指标查询（16-metrics.md）：业务图表、汇总卡片（含连接状态细分）、单指标查询
- [x] 3.17 第 17 章统一管理（17-central-management.md）：以集群为单位的统一管理与监控
- [x] 3.18 第 18 章插件开关（18-plugin-switches.md）：内置插件启停、schema 查看
- [x] 3.19 第 19 章用户管理（19-users.md）：账号、角色分配、资源权限
- [x] 3.20 第 20 章数据库管理完整功能（20-database-management.md）：连接列表、新增/编辑、迁移清空警告、设为当前
- [x] 3.21 第 21 章 Edge 直连与数据导入（21-edge-client-import.md）：直连调试查询、批量导入配置
- [x] 3.22 第 22 章工具箱/自启动管理/节点任务（22-tools-autostart-tasks.md）：辅助工具、systemd 自启（root 凭据警告）、任务中心取消/重试

## 4. 收尾

- [x] 4.1 README.md 总目录（含两篇导航：从零搭建篇 0-12 / 进阶与运维篇 13-22）+ 快速开始索引
- [ ] 4.2 全部截图占位清单核对（images/ 引用有效性）
- [ ] 4.3 恢复原数据库配置并重启，确认开发数据完好
- [ ] 4.4 openspec 工件勾选完成、变更可归档
