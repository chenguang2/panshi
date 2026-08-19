## Context

Edge 网关节点以 `edge.local` 作为内部管理/健康检查的默认访问域名。实际日志显示，客户端（`192.168.0.103`）以 `SNI=edge.local` 访问网关 `16610` 端口时，因生成的证书 SAN 未包含 `edge.local`，nginx 抛 `failed to match any SSL certificate by SNI: edge.local`，管理链路握手失败。

当前证书生成流程：
- 前端 `SslGenerateDialog.vue` 让用户输入 DNS/IP SAN，提交为 `dns_sans`/`ip_sans`
- 后端 `_generate_local`（`cluster_ssl.py:464`）接收后传给 `generate_dual_certificates`/`generate_certificate`（`cert_generator.py`），写入证书 subjectAltName
- `sni_str` 由 `req.dns_sans + req.ip_sans` 拼接后存入 DB 的 `sni` 字段

需要保证**所有**新生成的服务端证书（含 SM2 双证书、RSA/ECC、客户端证书）都包含 `edge.local` SAN。

## Goals / Non-Goals

**Goals:**
- 生成 SSL 证书时，`edge.local` 域名强制加入 DNS SAN
- `edge.local` 对用户**可见但不可删除**（系统保留域名）
- 后端兜底：即使绕过前端（直接调 API）也强制合并，杜绝遗漏

**Non-Goals:**
- 不回溯修改已生成的历史证书（仅影响新生成的证书）
- 不改变 `edge.local` 之外的其他 SAN 输入行为
- 不引入新的数据库字段（`edge.local` 仅作为生成时的强制 SAN，仍存储于现有 `cert`/`sni` 字段）

## Decisions

### 决策 1：兜底位置放在 `_generate_local` 统一合并

**选择**：在 `_generate_local`（`cluster_ssl.py:464`）函数开头，对 `req.dns_sans` 强制合并 `edge.local`，再传给生成函数和拼 `sni_str`。

**理由**：
- `_generate_local` 是服务端证书和客户端证书生成的唯一入口（`_generate_client_dual_certs` 也在其内被调用），合并一次即可覆盖所有路径
- 保证 `sni_str`（DB 字段）与证书 SAN 一致（都含 `edge.local`）
- 前端无论如何传参，后端都兜底

**替代方案（放弃）**：
- 在 `cert_generator.py` 的 `generate_dual_certificates`/`generate_standard_certificate` 内合并——会侵入底层工具函数，且无法同步更新 DB 的 `sni_str`，两处不一致
- 只在 `SslGenerateDialog.vue` 前端合并——可被绕过，不满足"后端兜底"

### 决策 2：合并逻辑使用常量 + 集合去重

**选择**：定义模块级常量 `RESERVED_SNIS = ("edge.local",)`，合并时用 `list(dict.fromkeys([RESERVED] + user_dns))` 保证 `edge.local` 在最前且去重。

**理由**：
- 常量集中管理系统保留域名，便于未来扩展
- 用 dict.fromkeys 去重（保序），避免用户手动输入 `edge.local` 导致重复
- `edge.local` 置前，SAN 展示时用户一眼可见系统保留项

**替代方案（放弃）**：
- 直接用 `list(set(...))`——无序，且与前端锁定 chip 展示顺序不一致

### 决策 3：前端锁定 chip 展示

**选择**：`SslGenerateDialog.vue` 的 DNS SAN 标签区预置一个 `edge.local` 锁定 chip（灰色、带锁图标、无删除按钮），提交时把 `edge.local` 并入 `dns_sans`。`SslFormDrawer.vue` 编辑查看时，若 SAN 含 `edge.local` 则标注"系统保留"。

**理由**：
- 让用户看到 `edge.local`（透明），但明确它是系统保留项（防误删）
- 与后端兜底形成双重保障

**替代方案（放弃）**：
- 完全隐藏 `edge.local`——用户对证书 SAN 内容不知情，日后排查困难
- 显示但可删除——用户会误删导致管理链路报警

## Risks / Trade-offs

- [用户手动输入了 `edge.local` 造成重复] → 合并逻辑用 `dict.fromkeys` 去重，无重复
- [历史证书不含 `edge.local`，管理链路仍报警] → 明确非目标，不回溯；用户如需可重新生成证书覆盖
- [`edge.local` 与用户真实域名冲突（用户恰好要用 `edge.local` 作为业务域名）] → 属极端场景，`edge.local` 是平台保留命名空间，冲突时以平台为准（SAN 始终含它）

## Migration Plan

1. 后端合并逻辑（常量 + `_generate_local` 合并）——独立提交
2. 前端锁定 chip（`SslGenerateDialog.vue`）——独立提交
3. 前端编辑标注（`SslFormDrawer.vue`）——独立提交
4. 无需数据迁移（不回溯历史证书）
5. 回滚：仅影响新生成证书的 SAN，回滚后新证书不含 `edge.local`，不影响已生成证书

## Open Questions

- 是否需要同时覆盖**导入**（upload）的证书？当前决策只针对**生成**路径。导入外部证书时 `edge.local` 由用户自担（本平台不强制注入）。是否需要对导入路径也做校验/提示，待确认。
