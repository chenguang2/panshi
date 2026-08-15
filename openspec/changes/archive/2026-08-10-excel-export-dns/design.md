# Design: Excel 导出增加 DNS 代理数据

## Context

集群导出 `cluster_export.py` 的「四层代理」sheet（line 312-324）遍历 `data["stream_proxies"]`（`StreamProxy` 模型，含 normal 与 dns 两类）。当前导出列：ID、名称、监听端口、协议、负载均衡、目标节点、代理类型、状态、描述、创建时间——**无 `dns_config`**。

DNS 代理的核心配置存储在 `StreamProxy.dns_config`（JSON：`{"hosts": {domain: {type, ttl_valid, nodes: {ip: [ports]}}}, "wan_enabled": bool}`），是 DNS 代理与普通四层代理的本质差异。`_fmt_json()` 已能将 JSON 字段 pretty-print（现有上游 checks/timeout 等复用），可直接用于 dns_config。

## Goals / Non-Goals

**Goals:**
- 「四层代理」sheet 增加 `DNS 配置` 列，DNS 行导出 `dns_config`（JSON pretty-printed）
- 普通四层代理行该列为空
- 保持现有导出行为向后兼容（新增列不破坏既有列与超链接）
- 测试覆盖 DNS 导出

**Non-Goals:**
- 不拆分独立 DNS sheet（DNS 与普通代理同表同 sheet，加列即可）
- 不改普通四层代理的其他字段导出（timeout/checks 等高级字段导出不在本次范围）
- 不改导出 API 路径/前端按钮/文件名
- 不做 DNS 配置的层级展开（域名/节点分列）——以 JSON 字符串呈现，与现有 JSON 字段处理一致

## Decisions

### D1: 「四层代理」sheet 增加 `DNS 配置` 列
在现有列尾追加一列（创建时间之后）：
```
headers += "DNS 配置"
row += [_fmt_json(s.dns_config) if s.proxy_type == "dns" else ""]
```
- DNS 行：`dns_config` JSON pretty-printed（复用 `_fmt_json`）
- 普通行：空字符串
- 位置：列尾追加，避免影响现有列索引（`link_cols` 用 0-based 索引，四层代理 sheet 无超链接，无影响）

### D2: 测试策略
- 在 `test_excel_export.py` 的 seed 中加一个 DNS 代理（`proxy_type='dns'` + `dns_config` JSON）
- 断言：「四层代理」sheet 头含 `DNS 配置` 列；DNS 行的该列含域名与节点信息；普通行该列为空
- 更新现有 sheet 列数量断言（如有基于列数的断言需同步）

### D3: 文档同步
`cluster-data-export` main spec 的「四层代理」sheet 描述追加 `DNS 配置`（dns_config），说明 DNS 行导出其域名/节点映射配置，普通行为空。

## Risks / Trade-offs

- **列宽**：dns_config 内容可能较长，`write_sheet` 的列宽自适应逻辑 `min(len(str(cv)), 60)` 已截断显示——可读性可接受（与现有 JSON 字段一致）
- **向后兼容**：追加列尾，不影响既有列与超链接索引；已有导出消费方按列名读取不受影响
- **DNS 配置层级**：以 JSON 字符串呈现而非展开为多列——与现有 JSON 字段（上游 timeout/checks）风格一致，避免 sheet 结构复杂化
