## 1. 前端 — DnsTarget 字段拆分

- [x] 1.1 DnsTarget 接口 `ip_port: string` → `ip: string; port: number`
- [x] 1.2 模板改为独立 IP/端口输入框
- [x] 1.3 `addDnsTarget()` 默认值更新

## 2. 前端 — 校验

- [x] 2.1 DNS 目标节点增加 IP 格式校验（复用 IP_PATTERN）
- [x] 2.2 增加端口范围校验（1-65535）

## 3. 前端 — 提交 & 回填

- [x] 3.1 提交时 `nodes[${dt.ip}:${dt.port}]` 拼接
- [x] 3.2 编辑回填从 `ip:port` 拆分为 `{ip, port}`

## 4. 前端 — 上游占位符

- [x] 4.1 DNS 模式增加只读上游配置展示

## 5. 验证

- [x] 5.1 TypeScript 编译通过
