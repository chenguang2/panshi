## Context

上游节点地址目前只支持 IPv4。前端 `UpstreamFormModal.vue` 中使用 `IP_PATTERN` 正则校验，域名会被拦截。Edge API（`/edge/admin/upstreams`）原生支持 `host:port` 格式，host 可以是 IPv4、IPv6、域名。后端 `UpstreamTarget.target` 字段是 `String(255)`，不存在存储限制。

## Goals / Non-Goals

**Goals:**
- 前端节点地址输入支持 IPv4、IPv6（`[::1]` 格式）、域名
- 自动识别输入类型并匹配对应校验规则
- 错误提示具体到是什么问题（IPv4 段超范围/域名含非法字符等）

**Non-Goals:**
- 不改后端模型、API、数据库
- 不改 Edge 发布格式（`convert_upstream_to_edge_format` 本身就是用 `target` 字符串拼接）
- 不改 `DnsQueryFormModal`（其节点也是 IP，以后需要再统一）

## Decisions

**校验函数：`isValidIP` → `validateHost`**

自动判断流程：

```
输入 → 匹配 IPv4 正则？→ IPv4 校验
     → 以 [ 开头 → IPv6 简易校验（至少含两个冒号）
     → 含 . → 域名分段校验
     → 否则 → 不合法
```

具体规则在讨论中已得到用户确认。

**编辑回填函数：新增 `parseTarget` 智能解析**

编辑上游时将数据库 `target` 字符串（如 `192.168.1.1:80` / `[::1]:80` / `foo.com:80`）解析为 `{ host, port }`：

```
输入 → 以 [ 开头 → IPv6，取 [] 内为 host，末尾为 port
     → 从右向左找最后一个 : → 左侧为 host（可能是 IPv4 或域名），右侧为 port
```

**提交时 IPv6 自动加 `[]`**

用户输入 `::1`，提交时自动包装为 `[::1]:80`，满足 Edge API 要求。前端用 `t.host` 存原始输入，拼接 `target` 时判断：IPv6 且无 `[]` 则自动添加。

## Risks / Trade-offs

- [IPv6 未全覆盖] → 只做简易校验（检测 `[]` 包裹 + 冒号），不做完整 RFC，避免正则过于复杂
- [单 label 域名（如 `localhost`）被拒绝] → 域名要求至少含一个 `.`，避免将 `localhost` 当域名，用户需写 `localhost.localdomain` 或改成 IP
- [端口默认值] → 当前前端端口必填，Edge API 允许省略端口（`{"host": weight}`），但先保持现状不改
