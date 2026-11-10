# Proposal: tools-keepalived-per-node-nic

## Why

工具现行模型是「单网卡名全局共享」：所有节点 conf 的 `interface` 与 VIP `dev/label`、防火墙 `tcpdump -i`、手册验证命令都用同一个网卡名。实测环境里各节点网卡名经常不同（如 `ens7`/`eth1`/`bond0`），用户生成后必须逐台手改，漏改一台 VRRP 就起不来。用户确认（2026-11-10）：网卡是每台节点自己的属性，应随节点逐行输入；独立「网卡名」字段应去掉。VIP 保持单个。

## What Changes

- **表单**：节点 IP 列表每行改为 `节点IP 网卡名`（空格分隔，2–8 行，各节点网卡可不同）；删除独立「网卡名」输入框；VIP 地址保持单个输入框；高级参数 7 项全部不变
- **解析**：新增 `parseKeepalivedNodesText` 逐行解析，行级红字带行号（缺网卡名 / 多余列 / 网卡名含非法字符）
- **生成**：每节点 `keepalived.conf` 的 `interface`、`virtual_ipaddress` 的 `dev/label`、该节点防火墙卡片的 `tcpdump -i` 均用本机网卡；部署手册按唯一网卡集合逐一列出验证命令（单网卡时与现行输出逐字一致）
- **语义修正**：节点间 conf 差异由「仅四处」扩为「五处」（+`interface`），页面文案与主 spec 同步
- **回归基线**：所有节点同网卡时输出与现行版本**逐字一致**；既有夹具仅改输入行格式、输出断言不动；新增「各节点不同网卡」「行解析错误」用例

## Capabilities

### Modified Capabilities

- `dev-tools`：「Keepalived 配置生成工具」（输入格式、逐节点网卡、差异五处、手册按网卡列举）与「生成参数与校验」（必填项定义、行级校验）两个需求块更新。

## Impact

- 受影响代码：`frontend/src/utils/tools/keepalived.ts`（模型/解析/模板/手册）、`frontend/src/views/Tools.vue`（表单/文案/clearTool）、`frontend/src/utils/tools/__tests__/keepalived.test.ts` 与 `frontend/src/views/__tests__/Tools.test.ts`
- 不涉及：后端、路由权限、依赖清单（零新增 npm 包）
- 风险：低——纯工具页；Tools.vue 结构性改动需跑该页全量测试（#217）；样例逐字回归夹具钉死兼容性
