## Context

内外网分离网络：同一服务器同时拥有内网（`192.192.9.2`）与外网（`10.158.40.51`）地址。DNS 查询需按来源返回对应地址。Edge 新插件 `dns_upstream-ww` 通过 `export_nodes`（内网→外网映射）+ `_meta.filter`（来源 IP 过滤）实现，priority 固定 2110。

磐石当前 DNS 代理（StreamProxy UDP，`proxy_type=dns`）只配置单一 `dns_upstream` 插件。需在配置界面、发布、导入三处扩展。

## Goals / Non-Goals

**Goals:**
- StreamProxy DNS 模式支持开关式内外网分离配置
- 发布生成 `dns_upstream-ww` 插件（export_nodes + _meta.filter）
- 导入还原内外网分离配置
- 未启用时行为与现状完全一致（向后兼容）
- 配置完整性校验：映射 key 必须与 nodes 一致、启用时每个域名必须有 export_nodes

**Non-Goals:**
- 不改动 edge 端插件实现（已由 edge 新版本支持）
- 不做 HTTP 路由 DNS（DnsQueryFormModal）的内外网分离（本次仅 StreamProxy UDP）
- 不引入 DB 表结构变更（`dns_config` JSON 扩展即可）
- 不为 export_nodes 增加权重/健康检查（样例中为纯字符串映射）
- **不处理客户端 CIDR**：DNS 域名目标的「客户端 CIDR」输入框在界面中默认隐藏，`cidr` 始终为空，不参与内外网分离逻辑（讨论确认 2026-08-05）

## Decisions

### Decision 1: dns_config 持久化格式（export_nodes 内联于域名）

```json
{
  "hosts": {
    "qcg.com": {
      "nodes": { "192.192.9.2:16610": [], "192.192.9.3:16610": [] },
      "export_nodes": {
        "192.192.9.2:16610": "10.158.40.51",
        "192.192.9.3:16610": "10.158.40.52"
      },
      "type": "chash", "ttl_valid": 10, "checks": {...}
    }
  },
  "log_process": { "logs": ["logs/process.stream.log"] },
  "wan_enabled": true,
  "wan_filter": { "include": ["10.158.40.51", "10.0.0.0/8"], "exclude": ["192.168.0.3"] }
}
```

**设计要点（讨论确认 2026-08-05，页面重构）**：
- `export_nodes` **内联在每个域名下**（key = 内网 `ip:port`，value = 外网**纯 IP**），与 edge 插件字段同名，零概念转换
- **外网地址只填 IP，端口复用内网节点端口**——发布组装时从 key 提取端口拼到 value
- **外网地址仅支持 IPv4**（讨论确认 2026-08-05）：当前场景均为 IPv4，明确不支持 IPv6（避免 `2001:db8::1:16610` 拼接歧义）
- 域名/健康检查/TTL 只输入一次，不复制；`export_nodes` 是纯增量可选字段
- `wan_*` 是磐石内部友好格式（前端直接编辑），发布时才转换为 edge 插件结构；旧配置无 `wan_*`/`export_nodes` → 兼容

### Decision 2: 发布转换（publish_dns_proxy）

```python
def _export_nodes_with_port(export_nodes: dict) -> dict:
    """Port is shared with the LAN node: take it from the key, append to the value."""
    result = {}
    for lan, wan_ip in (export_nodes or {}).items():
        port = lan.rsplit(":", 1)[1] if ":" in lan else ""
        result[lan] = f"{wan_ip}:{port}" if port else wan_ip
    return result

lan_hosts = {}
for domain, cfg in hosts.items():
    entry = dict(cfg)
    entry.pop("export_nodes", None)  # 内网插件不携带 export_nodes
    lan_hosts[domain] = entry
plugins = {"dns_upstream": {"disable": False, "hosts": lan_hosts}}
if dns_cfg.get("wan_enabled"):
    ww_hosts = {}
    for domain, cfg in hosts.items():
        entry = dict(cfg)
        entry.pop("export_nodes", None)
        mapping = _export_nodes_with_port(cfg.get("export_nodes"))
        if mapping:
            entry["export_nodes"] = mapping
        ww_hosts[domain] = entry
    ww_filter = []
    include = dns_cfg.get("wan_filter", {}).get("include", [])
    if include:
        ww_filter.append(["remote_addr", "ip~", list(include)])
    exclude = dns_cfg.get("wan_filter", {}).get("exclude", [])
    if exclude:
        ww_filter.append(["remote_addr", "!", "ip~", list(exclude)])
    plugins["dns_upstream-ww"] = {"hosts": ww_hosts, "_meta": {"priority": 2110, "filter": ww_filter}}
```

**关键点（讨论确认 2026-08-05）**：
- **内网 `dns_upstream` 与 ww 插件的 entry 都清除 `export_nodes`**（讨论确认：内网插件不携带 export_nodes，职责清晰）；ww 插件重建带端口映射
- 外网 value 只填 IP，端口从 key 提取拼接（`10.158.40.51` + `:16610`）；外网地址仅支持 IPv4
- `_meta.filter` 是最外层数组（各条件 AND），include/exclude 各自合并为一个条件（内部 IP OR），priority 固定 2110

### Decision 3: 前端 UI（页面重构，讨论确认 2026-08-05）

**Step 1（端口选择页）**：新增「内外网分离」开关——DNS 代理时在端口网格下方独立一行显示：
```
[内外网分离] [x] 启用内外网分离（按来源 IP 返回内/外网地址）
```

**Step 2（配置详情页）**：
- **不隔离时**：与现状完全一致（域名/节点/TTL/健康检查表单，无任何新增字段）
- **隔离时**：域名配置**只输入一次**，节点行内联「外网地址」列：
```
域名映射（内外网分离已启用）
├── qcg.com   负载均衡[chash]  TTL[10]  健康检查[✓]
│   内网IP        端口      外网地址            操作
│   192.192.9.2   16610    10.158.40.51       [删除]
│   192.192.9.3   16610    10.158.40.52       [删除]
│   [+ 添加目标节点]
```
- 外网地址列仅在开关开启时显示；只填 IPv4（不支持 IPv6/CIDR），端口复用内网端口；启用时所有节点必须填写（校验强化）
- 过滤区：包含/排除两个可编辑 tag 列表（IPv4/CIDR 校验），紧凑展示

**CIDR 隐藏（讨论确认 2026-08-05）**：DNS 域名目标的「客户端 CIDR（可选）」输入框默认隐藏，`cidr` 始终为空，不参与内外网分离逻辑。

**开关切换保留数据（讨论确认 2026-08-05）**：用户在 Step 1 关闭内外网开关再打开时，Step 2 已填的外网地址数据**保留**（切换只影响 UI 显隐与最终组装，不清空已填值）；关闭状态下保存则不组装 export_nodes。

**前端校验（讨论确认 2026-08-05）**：
- **校验强化**：启用时每个域名的**所有节点**都必须填写外网地址（不留空）——杜绝部分节点未映射导致外网查询返回内网地址（泄露拓扑）
- 外网地址 IP 格式校验（**仅 IPv4**，不支持 CIDR 段，不支持 IPv6）
- 未启用时无任何校验新增

**详情展示（讨论确认 2026-08-05）**：`StreamProxyViewDrawer` 增加「内外网分离」状态徽标——`dns_config.wan_enabled` 为 true 时显示"已启用"。

**备选方案**：独立映射表（方案 2/3）——被否，重复输入问题未解决或页面仍长。

### Decision 4: 导入还原（edge_import_service.convert_stream_proxy）

```python
def _strip_port(export_nodes: dict) -> dict:
    """Edge format value is ip:port; internal format keeps only the IP."""
    result = {}
    for lan, wan in (export_nodes or {}).items():
        wan_ip = wan.rsplit(":", 1)[0] if ":" in wan else wan
        result[lan] = wan_ip
    return result

wan = edge_plugins.get("dns_upstream-ww") or {}
if wan:
    dns_cfg["wan_enabled"] = True
    for domain, wcfg in (wan.get("hosts") or {}).items():
        if domain not in dns_cfg.get("hosts", {}):
            continue  # ww 域名在内网 hosts 中不存在 → 丢弃映射并告警
        mapping = _strip_port(wcfg.get("export_nodes"))
        if mapping:
            dns_cfg["hosts"][domain]["export_nodes"] = mapping
    include, exclude = [], []
    for cond in (wan.get("_meta") or {}).get("filter", []):
        if len(cond) >= 3 and cond[0] == "remote_addr" and cond[1] == "ip~":
            include.extend(cond[2] if isinstance(cond[2], list) else [cond[2]])
        elif len(cond) >= 4 and cond[0] == "remote_addr" and cond[1] == "!" and cond[2] == "ip~":
            exclude.extend(cond[3] if isinstance(cond[3], list) else [cond[3]])
    if include or exclude:
        dns_cfg["wan_filter"] = {"include": include, "exclude": exclude}
```

**理由（讨论确认 2026-08-05）**：`export_nodes` 内联写回对应域名（与内网 hosts 同结构）；edge 的 `ip:port` 值拆分出纯 IP 存入内部格式（端口从 key 隐含复用）。`dns_upstream-ww` 插件的 hosts 本身不进 `dns_config.hosts` 的 nodes（避免与内网 nodes 重复），仅取 export_nodes 合并。

**导入校验（讨论确认 2026-08-05）**：
- **ww 域名必须存在于内网 hosts**：若 ww 插件含某域名而内网 `dns_upstream` 无该域名 → 丢弃该域名映射并告警（避免创建只有 export_nodes 的空域名）
- 若某域名 export_nodes 的 key 不在该域名 nodes 中（edge 侧数据异常），标记该条映射为无效并在导入预览中提示，不静默写入

## Risks / Trade-offs

- [编辑回读与导入的 filter 还原可能有条件顺序差异] → include/exclude 分别收集，顺序不影响语义；多次导入幂等
- [用户在外网地址填了与内网相同的 IP] → 允许（语义上内外网相同），发布原样透传
- [旧配置在开启开关前已发布过] → 未开启时发布逻辑不触碰，完全兼容
- [dns_upstream-ww 在 edge 旧版本不存在] → 开关默认关闭，不启用则不会发布该插件，无兼容风险
- [版本回滚到旧配置（无 wan_*）] → **讨论确认 2026-08-05**：功能未上线，不存在含 wan_* 的历史版本；回滚到无 wan_* 的旧版本即回到无内外网状态，属预期行为，不保留 wan_* 配置
- [无 export_nodes 映射的域名出现在 ww 插件 hosts] → **讨论确认 2026-08-05**：启用时每个域名**所有节点**必须填写外网地址（校验强化），杜绝部分节点未映射导致外网查询泄露内网拓扑
- [ww 域名在内网 hosts 中不存在（导入场景）] → **讨论确认 2026-08-05**：丢弃该域名 export_nodes 并告警，不创建空域名
- [内网 dns_upstream 携带 export_nodes] → **讨论确认 2026-08-05**：发布时内网与 ww 插件 entry 均清除 export_nodes，内网插件职责纯净

## Migration Plan

无 DB 迁移。`dns_config` JSON 结构向后兼容；存量记录读取时 `wan_*`/`export_nodes` 缺失即视为关闭。

## Open Questions

无（2026-08-05 已确认全部 7 个设计问题）。
