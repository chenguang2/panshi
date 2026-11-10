# Design: tools-keepalived-per-node-nic

## Context

现行 `KeepalivedGenInput` 为 `{ vip, nodes: string[], iface, ... }`——网卡是全局单值。用户场景：节点各自网卡不同，逐台手改易漏。用户确认交互：节点列表每行 `节点IP 网卡名`，去独立网卡字段，VIP 保持单个（评审原型 `/tmp/opencode/keepalived-vip-nic-mockup.html`，2026-11-10 确认）。

## Decisions

- **D1 行格式**：`节点IP 网卡名` 空格分隔，每行一条；与「每行一个」的既有节点列表心智一致，支持整列粘贴。缺网卡名/多余列/网卡名非法字符均红字并带行号。
- **D2 解析与语义校验分离**：`parseKeepalivedNodesText(text)` 只管行结构（产出结构化节点 + 行级错误）；`validateKeepalivedInput` 只管语义（IPv4/数量/重复/VIP≠节点/同网段/密码），两者错误合并展示。网卡名字符集 `^[A-Za-z0-9._-]+$`（覆盖 ens7/eth0/bond0.100/vlan-tag 形态）。
- **D3 输入模型**：`nodes: Array<{ ip; iface }>`，删除全局 `iface` 字段；模板字符串**逐字不动**，仅 `iface` 取值来源从全局改为 `nodes[index].iface`——保证同网卡输入输出与现行版本逐字节一致。
- **D4 手册按唯一网卡集合**：唯一网卡数 =1 时输出与现行手册逐字一致；>1 时 `ip addr show`/`tcpdump` 按唯一网卡逐一列出，注释注明使用该网卡的节点（Edge-N）。手册标题网卡段 `@ ens7/eth1/bond0`。
- **D5 差异五处**：`interface` 进入逐节点差异集，页面分组标题与主 spec 由「四处」改「五处」；spec 场景标题为稳定标识符保留原名（#53），正文改写加 HTML 注释。

## Risks / Trade-offs

- 行格式靠空格分隔，用户可能粘入多余列 → 解析红字兜底（不静默截断）。
- `:vip` label 在多网卡下各节点不同（`eth1:vip` 等），仅影响本机别名，无跨机语义。
- 手册多网卡输出的注释对齐列不与样例逐字对齐（样例仅钉单网卡场景）。
