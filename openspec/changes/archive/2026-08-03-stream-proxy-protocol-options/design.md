## Context

四层代理（Stream Proxy）当前界面将协议固定为 TCP：侧边栏菜单"TCP代理"、列表页标题"TCP 代理"、创建向导 Step2 协议为只读徽标（normal 类型固定显示 TCP）。系统实际已支持 UDP（DNS 代理走 `scheme='udp'`），且 `scheme` 字段在发布时通过 `scheme.upper()` 转成 Edge 的顶层 `protocol` 字段（`"TCP"`/`"UDP"`），底层机制已天然支持新增协议值。

用户需求：
1. 菜单名改为"四层代理"（不再叫"TCP代理"，因其覆盖 TCP/UDP/TLS）
2. 协议选择改为 Radio 三选一（TCP 默认 / UDP / TLS），每个选项带协议区别说明，选中后显示动态提示
3. TLS 仅将 `scheme` 设为 `'tls'`，不选证书、不加额外字段
4. UDP 仅 `scheme` 设为 `'udp'`，其余与 TCP 完全一致
5. 列表卡片保留协议徽标（`schemeLabel` 补 `tls → TLS`）

## Goals / Non-Goals

**Goals:**
- 界面命名从"TCP 代理"全面改为"四层代理"，消除名不副实
- 协议选择从只读徽标改为可见的 Radio 三选一，附带协议区别说明
- 后端 `scheme` 增加取值校验（`tcp`/`udp`/`tls`）
- 保持发布链路不变（`scheme.upper()` 天然产出 `TCP`/`UDP`/`TLS`）

**Non-Goals:**
- TLS 不涉及证书选择、证书绑定或 SNI 配置（用户明确排除）
- 不改变数据库结构（`ps_stream_proxy.scheme` 列已存在）
- 不改变 DNS 代理（`proxy_type='dns'`）的页面与行为
- 不拆分为多个菜单（UDP/TLS 与 TCP 共用 normal 类型与列表页）

## Decisions

### 决策 1：协议交互用 Radio 按钮组，不用下拉框
用户明确要求"让用户知道这 3 个协议的区别"，下拉框默认收起、选项不可见，与目标相反。三个选项正好是 Radio 的理想数量（Material 规范：≤4 个选项用 radio）。每个 Radio 选项为卡片式，含两行：协议名 + 一句话说明。

**备选方案**：
- 下拉框（select）：选项被折叠，无法承载说明文字 → 拒绝
- 分段选择器（segmented control）：与代理类型切换的 `spwf-toggle-btn` 风格一致，但单行空间放不下两行说明 → 不采用

### 决策 2：协议说明采用"卡片静态说明 + 选中后动态提示"双层结构
- 卡片上的说明（"面向连接的流式传输，可靠有序"等）回答"三个协议有何不同"，供对比时查看
- 选中后字段下方的动态提示（"按 TCP 协议转发到上游节点"等）回答"选了这个会怎样"，供确认时查看
- 两层信息互补，不重复

### 决策 3：TLS/UDP 仅改 scheme 值，不引入新字段
TLS 不需要证书字段（用户明确"不选择证书，只是协议名称变为 tls"）；UDP 与 TCP 共用 `proxy_type='normal'`，仅 `scheme` 不同。后端发布逻辑 `_protocol = proxy.scheme.upper()` 与 `upstream_data["scheme"] = proxy.scheme or "tcp"` 无需改动即可支持 `"TLS"`。

### 决策 4：后端 `scheme` 校验只加在写入 schema，不放 Base
`StreamProxyBase.scheme: str = Field(default="tcp")` **保持不变**；`Literal["tcp", "udp", "tls"] = "tcp"` 只加在 `StreamProxyCreate` 与 `StreamProxyUpdate`。

**关键原因**：`StreamProxyResponse` 继承 `StreamProxyBase`（schemas/stream_proxy.py:62）。若 Literal 加在 base，则所有读取路径（list/get/publish 的 `StreamProxyResponse.model_validate(proxy)` 及 `response_model` 二次校验）都会对 scheme ∉ {tcp,udp,tls} 的存量/导入数据抛 ValidationError → **整接口 500**。这会使"Literal 只约束写入、读取不受影响"的断言落空。只加在写入 schema 则：API 写入被 422 拦截，读取路径永不崩。

**备选方案**：Response 加 `field_validator(mode="before")` 归一化非三值 → `'tcp'`——能兜底导入路径，但代码更复杂且与决策 5 的导入归一化重复。不采用。

### 决策 5：导入 scheme 归一化
`edge_import_service.convert_stream_proxy`（L451）对 `upstream.get("scheme", "tcp")` 的结果归一化：`v if v in ("tcp","udp","tls") else "tcp"`（含 `tcp_udp`→`tcp`）。原因：导入用 `session.add(StreamProxy(**sp_data))` 直插 ORM（L1185），完全绕过 Pydantic 校验，Edge 上游 scheme 不受控（可能是 `http`/`grpc`/遗留 `tcp_udp`）。归一化保证导入产物永远合法。回滚路径（`rollback_stream_proxy` setattr）写入的值来自 config_version，经导入归一化后也只会是合法值。

### 决策 6：命名变更只改前端文案，不改路由/API
路由 `/stream-proxies`、后端接口路径、`proxy_type` 取值（`normal`/`dns`）、模型字段均不变。仅更新：侧边栏菜单标签、列表页标题/描述/按钮、composable 的 `pageTitle`/`itemLabel`、`DefaultLayout.vue`、`VersionManagementModal.vue`、`StreamProxyFormWizard.vue` 代理类型切换按钮（"TCP代理"→"四层代理"）中的文案。

## Risks / Trade-offs

- [旧数据 `scheme` 可能是 `tcp_udp`（git 3836f54/b94cb64 证明曾是正式选项）] → 通过数据迁移一次性归一化（见 Migration Plan）；Literal 只在 Create/Update，读取路径不受影响
- [导入/回滚路径绕过 Pydantic 校验] → 导入时归一化（决策 5），保证写入值永远合法
- [菜单改名影响测试] → 前端仅 `useStreamProxyList.test.ts:23` 断言 "TCP 代理" 需同步；E2E 无文本选择器引用，无需改动
- [`tcp-proxy-list` spec 已归档过的历史语义] → 该 spec 内容将随本次变更同步更新为"四层代理"语义
- [发布 `protocol=TLS` 与 Edge 兼容性] → 用户确认 Edge 现已支持 TLS（`upstream.scheme` 接受 `tls`）；同步更新使用手册枚举（`protocol` 加 `"TLS"`、`scheme` 加 `tls`）。上线后实测验证发布成功

## Migration Plan

1. **数据迁移**（唯一数据变更）：`UPDATE ps_stream_proxy SET scheme='tcp' WHERE scheme NOT IN ('tcp','udp','tls')`——清理历史 `tcp_udp` 残留（当前 dev DB 无此数据，生产库可能有）
2. 前端文案 + Radio 交互改造（无数据迁移）
3. 后端 schema Literal（Create/Update）+ 导入归一化
4. 运行 `npm run build`（vue-tsc）、`npx vitest run`、`npx playwright test`、`uv run pytest` 验证
5. 若 Edge 发布 TLS 实测失败，仅回退 scheme 校验与文案即可，Radio 交互保留

## Open Questions

- 无（Edge 对 `protocol: "TLS"` 的支持已由用户确认，并纳入文档同步与上线实测）
