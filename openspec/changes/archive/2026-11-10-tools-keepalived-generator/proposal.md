# Proposal: tools-keepalived-generator

## Why

运维在部署 Edge DNS 高可用（VRRP + VIP）时需要手工编辑多份 keepalived 配置：N 节点每台一份 `keepalived.conf`（router_id / priority / unicast_src_ip / unicast_peer 四处差异）+ 4 个共用脚本 + 逐节点防火墙命令 + 部署验证命令。手工编辑易漏改（典型事故：router_id 重复 / priority 撞号 / unicast_peer 漏删本机 IP），且流程文档散落在个人笔记中。工具页已有 13 个纯前端生成/转换工具，配置生成类能力与页面定位一致。

## What Changes

工具页（`/tools`）新增第 14 个工具「Keepalived 配置生成」（`?tool=keepalived` 深链）：

- **纯前端生成**：`frontend/src/utils/tools/keepalived.ts` 单点模板渲染，零后端、零安全面
- **输入**（最小 3 必填 + 高级折叠全预填样例默认值）：
  - 必填：VIP 地址、节点 IP 列表（每行一个，2–8 个）、网卡名（如 `ens7`）
  - 高级（默认收起，默认值=用户样例值，保证逐字复现）：VIP 掩码位 24 · VRRP 组 ID 51 · 认证密码 `12345678` · 优先级起始 150 / 步长 10 · router_id 前缀 `EDGE_DNS_` · 健康检查端口 53
  - 固定沿用样例不参数化：实例名 `VI_DNS`、脚本名 `chk_dns`、`state BACKUP`、单播模式、`advert_int 1`、rise 2 / fall 3、weight -30、interval 2 / timeout 1
- **输出**（按节点分组 + 共用文件节 + 部署手册节，样例同构）：
  - 共用文件：`check_dns.sh`、`notify_master.sh`、`notify_backup.sh`、`notify_fault.sh`（全节点相同，只列一份）
  - 每节点一组：`keepalived.conf`（4 处节点差异）+ 该节点防火墙放行命令（放行其余 N−1 对端）
  - 部署手册：chmod / systemctl / `keepalived -t` / VIP 归属验证 / journalctl（按实际网卡与 VIP 参数化）
  - 每块复制按钮 + 单文件下载（Blob，零新依赖）
- **校验（不阻断）**：IPv4 格式、节点数 ≥2、VIP ≠ 节点 IP、VIP 与节点不同网段黄字提醒、auth_pass 超 8 字符黄字提醒
- **验收基线**：样例输入（VIP 10.128.216.154、节点 .160/.161/.162、ens7、默认高级值）→ 输出与用户样例**逐字一致**（回归单测钉死）

## Impact

- 受影响代码：`frontend/src/views/Tools.vue`（导航项 + 工具区块）、`frontend/src/utils/tools/keepalived.ts`（新增，模板渲染单点）、`frontend/src/utils/tools/ip.ts`（复用 parseCidr，不改动）、`frontend/src/views/__tests__/Tools.test.ts` 与/或 `frontend/src/utils/tools/__tests__/`（新增回归用例）
- 不涉及：后端、路由权限（/tools 已有页面）、依赖清单（零新增 npm 包）
- 风险：低——纯增量工具页区块；既有 13 工具行为不动（#217：Tools.vue 结构性改动需跑该页全量测试）
