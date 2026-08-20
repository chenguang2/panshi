## Context

Edge 网关节点以 `edge.local` 作为内部管理/健康检查的默认访问域名。实际日志显示，客户端（`192.168.0.103`）以 `SNI=edge.local` 访问网关 `16610` 端口时，因生成的证书 SAN 未包含 `edge.local`，nginx 抛 `failed to match any SSL certificate by SNI: edge.local`，管理链路握手失败。

当前证书生成流程：
- 前端 `SslGenerateDialog.vue` 让用户输入 DNS/IP SAN，提交为 `dns_sans`/`ip_sans`
- 后端 `_generate_local`（`cluster_ssl.py:464`）接收后传给 `generate_dual_certificates`/`generate_certificate`（`cert_generator.py`），写入证书 subjectAltName
- `sni_str` 由 `req.dns_sans + req.ip_sans` 拼接后存入 DB 的 `sni` 字段
- 发布时（`publish_ssl_certificate`）将 `sni` 拆分为 `sni`/`snis` 推送到 Edge，nginx 依据该列表做 SNI 匹配（server_name）；证书 SAN 用于客户端侧对下发证书的校验

需要保证**所有**新生成/更新的服务端证书（含 SM2 双证书、RSA/ECC）都包含 `edge.local` SAN，且 DB `sni` 字段与之一致，确保管理链路在 Edge 侧有可匹配的证书。

## Goals / Non-Goals

**Goals:**
- 生成 SSL 证书时，`edge.local` 域名强制加入**服务端证书**的 DNS SAN
- `edge.local` 对用户**可见但不可删除**（系统保留域名）
- 后端兜底：即使绕过前端（直接调 API）也强制合并，杜绝遗漏
- **更新/回滚路径同样强制保留**，防止编辑或回滚后 `sni` 丢失 `edge.local`
- 域名比较大小写不敏感（`EDGE.LOCAL` 与 `edge.local` 视为同一项）

**Non-Goals:**
- 不回溯修改已生成的历史证书（仅影响新生成/更新的证书）
- 不改变 `edge.local` 之外的其他 SAN 输入行为
- 不引入新的数据库字段（`edge.local` 仅作为生成时的强制 SAN，仍存储于现有 `cert`/`sni` 字段）
- 不强制客户端证书注入 `edge.local`（客户端证书不参与 SNI 匹配，nginx mTLS 也不校验其 SAN）
- 不强制导入（添加已有证书）路径注入 `edge.local`（用户自担，仅前端提示）

## Decisions

### 决策 1：兜底位置放在 `_generate_local` 统一合并（仅服务端证书）

**选择**：在 `_generate_local`（`cluster_ssl.py:464`）函数开头，对 `req.dns_sans` 强制合并 `edge.local`（归一化后去重、`edge.local` 置前），得到统一的 `dns_sans` 列表，用于：服务端证书生成调用（`generate_dual_certificates`/`generate_certificate`）、`sni_str` 拼接、服务端记录入库。

**客户端证书不合并**：SM2 客户端双证书（`_generate_client_dual_certs`）与 `cert_type=client` 的请求**继续使用用户原始 `dns_sans`/`ip_sans`**，客户端证书记录的 `sni` 也使用用户原始 SAN（保持 `sni_str or cn_client` 的兜底）。理由：
- 客户端证书不发布到 Edge 的 SNI 匹配（发布接口拒绝 `cert_type=client`），nginx mTLS 校验不检查客户端证书 SAN，注入 `edge.local` 无功能收益；
- 避免固化"客户端证书记录 `sni` 存服务端域名"的语义错位；
- 若客户端证书未来用于"向上游发送"且上游严格校验 SAN，用户可自行决定其 SAN 内容，不受平台保留域名干扰。

**理由**：
- `_generate_local` 是服务端证书和客户端证书生成的唯一入口（`_generate_client_dual_certs` 也在其内被调用），合并一次即可覆盖服务端所有路径
- 保证服务端 `sni_str`（DB 字段）与证书 SAN 一致（都含 `edge.local`）
- 前端无论如何传参，后端都兜底

**替代方案（放弃）**：
- 在 `cert_generator.py` 的 `generate_dual_certificates`/`generate_standard_certificate` 内合并——会侵入底层工具函数，且无法同步更新 DB 的 `sni_str`，两处不一致
- 只在 `SslGenerateDialog.vue` 前端合并——可被绕过，不满足"后端兜底"

### 决策 2：合并逻辑使用常量 + 归一化 + 集合去重

**选择**：定义模块级常量 `RESERVED_SNIS = ("edge.local",)`，合并时先对用户输入的 DNS 做 `strip().lower()` 归一化（IP 仅 `strip()`），再用 `list(dict.fromkeys([*RESERVED_SNIS, *normalized_dns]))` 保证 `edge.local` 在最前且去重。

**注意**：不能用 `[RESERVED_SNIS] + dns_sans`——元组会被整体当作单个元素，生成非法 SAN `DNS:('edge.local',)`。必须使用 `[*RESERVED_SNIS, *dns_sans]` 展开。

**理由**：
- 常量集中管理系统保留域名，便于未来扩展
- 大小写归一化保证 `EDGE.LOCAL`/`Edge.Local` 与 `edge.local` 视为同一项（DNS 域名大小写不敏感），前后端判定一致
- 用 dict.fromkeys 去重（保序），避免用户手动输入 `edge.local` 导致重复
- `edge.local` 置前，SAN 展示时用户一眼可见系统保留项

**替代方案（放弃）**：
- 直接用 `list(set(...))`——无序，且与前端锁定 chip 展示顺序不一致
- 不归一化直接精确去重——`edge.local` 与 `EDGE.LOCAL` 会被视为两项，证书 SAN 与 `sni` 出现重复且语义混乱

### 决策 3：前端锁定 chip 展示与标注

**选择**：`SslGenerateDialog.vue` 的 DNS SAN 标签区预置一个 `edge.local` 锁定 chip（灰色、带锁图标、无删除按钮），提交时把 `edge.local` 并入 `dns_sans`（大小写不敏感去重后统一小写）。`SslFormDrawer.vue` 编辑查看时，若 SAN 含 `edge.local`（大小写不敏感）则标注"系统保留"；`SslList.vue` 列表卡片 SNI 展示同样标注。校验逻辑：`edge.local` 计入"至少一个 DNS/IP SAN"的有效性判断，允许"仅 `edge.local`"的证书。

**理由**：
- 让用户看到 `edge.local`（透明），但明确它是系统保留项（防误删）
- 与后端兜底形成双重保障
- 编辑/列表的标注与生成对话框一致，用户在任何界面都能识别系统保留域名

**替代方案（放弃）**：
- 完全隐藏 `edge.local`——用户对证书 SAN 内容不知情，日后排查困难
- 显示但可删除——用户会误删导致管理链路报警

### 决策 4：更新/回滚路径强制保留 `edge.local`

**选择**：`update_ssl_certificate`（`PUT /ssl/{id}`）更新 `sni` 字段时，若目标证书为 server 类型（`cert_type == "server"` 且非 CA），对新的 `sni` 值按决策 2 的规则强制合并 `edge.local` 后写回；`rollback_ssl_certificate` 回滚 `sni` 时同样处理（按回滚后的 `cert_type` 判断）。client 类型证书不合并。

**理由**：
- 编辑接口和回滚接口可直接改写 `sni` 字段，若不做处理，用户改掉/回滚掉 `edge.local` 后重新发布，管理链路再次无匹配，且 DB `sni` 与证书 SAN 不一致
- 生成路径的兜底无法覆盖这两个入口，需显式扩展
- 仅对 server 证书生效，与决策 1 的注入范围一致

**替代方案（放弃）**：
- 仅生成路径兜底——不变量可被编辑/回滚绕过，管理链路告警问题复发
- 拦截并拒绝移除 `edge.local` 的请求——实现更复杂且对合法操作（批量改写 sni）不友好，合并比拒绝更符合"强制保留"语义

### 决策 5：导入路径不强制，仅前端提示

**选择**：导入（添加已有证书，`SslFormDrawer.vue` 创建模式）不注入 `edge.local`，但对 `cert_type=server` 的导入表单显示提示文案："建议 SNI 包含系统保留域名 `edge.local`，否则管理链路/健康检查可能握手失败"。后端不做校验（导入的 PEM 是用户自备，强制合并 `sni` 会导致"nginx 匹配成功但证书 SAN 不含 `edge.local`"的校验失败假象）。

**理由**：
- 导入证书的 PEM 内容由用户控制，平台无法修改其 SAN，仅在 `sni` 字段强行合并会造成证书与匹配名单不一致
- 提示让用户知情，自行决定是否使用含 `edge.local` 的证书

### 决策 6：大小写归一化范围

**选择**：DNS 域名在前后端统一执行 `strip().lower()` 归一化后参与去重、比较、标注；IP 地址仅 `strip()`（不做大小写转换，IPv6 保持用户输入）。后端合并、前端 `addDnsTag` 去重、编辑/列表标注均按此规则。

**理由**：
- DNS 域名大小写不敏感，`EDGE.LOCAL` 与 `edge.local` 本质是同一域名
- 不归一化会导致：证书 SAN 出现两个重复项、锁定 chip 与用户手动输入并存、编辑标注不命中

## Risks / Trade-offs

- [用户手动输入了 `edge.local`（含大小写变体）造成重复] → 合并逻辑归一化 + `dict.fromkeys` 去重，无重复
- [历史证书不含 `edge.local`，管理链路仍报警] → 明确非目标，不回溯；用户如需可重新生成证书覆盖
- [`edge.local` 与用户真实域名冲突（用户恰好要用 `edge.local` 作为业务域名）] → 属极端场景，`edge.local` 是平台保留命名空间，冲突时以平台为准（SAN 始终含它）
- [多张 server 证书同含 `edge.local`，nginx 按配置顺序取第一张匹配] → 已知行为假设：全量注入方案下任意一张已发布证书都能兜底管理链路；若管理客户端会校验证书链（如浏览器），需保证承载 `edge.local` 的证书链被信任。属产品决策（已确认接受），文档注明
- [客户端证书注入 `edge.local` 无功能收益] → 已决策：客户端证书不注入，避免污染
- [编辑/回滚移除 `edge.local` 导致管理链路复发] → 已决策：更新/回滚路径强制合并，不变量覆盖所有写路径
- [导入证书不含 `edge.local` 导致管理链路无匹配] → 已决策：导入不强制，前端提示用户自担

## Migration Plan

1. 后端合并逻辑（常量 + `_generate_local` 服务端合并 + 更新/回滚合并）——独立提交
2. 前端锁定 chip（`SslGenerateDialog.vue`）——独立提交
3. 前端标注与提示（`SslFormDrawer.vue`、`SslList.vue`）——独立提交
4. 无需数据迁移（不回溯历史证书）
5. 回滚：仅影响新生成/更新的证书 SAN，回滚后新证书不含 `edge.local`，不影响已生成证书

## Open Questions

<!-- 已关闭：导入路径结论为"不强制 + 前端提示"，见决策 5。 -->
- ~~是否需要同时覆盖导入（upload）的证书？~~ → 已确认：不强制注入，前端对 server 证书提示建议包含 `edge.local`。