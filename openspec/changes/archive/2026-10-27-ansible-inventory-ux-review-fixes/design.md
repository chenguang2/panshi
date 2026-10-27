# design: ansible-inventory-ux-review-fixes

## Context

见 proposal.md · Why。补充设计所需现状约束：

- 保存写盘单点 `inventory_service.save_inventory`（持 `_inventory_lock`、备份当前文件到 `backups/` 保留 10 份、tmp + `os.replace` 原子写回）；`_assert_no_running_tasks`（409）在端点层先于写盘执行。
- `validate_structure(doc, platform_node_ips)` 已实现删除保护与主机键合法性，仅 hosts 路径调用；raw_text 路径已解析出 `doc`（`parse_inventory` 内部 `yaml.safe_load`），补调用零新解析成本。
- 备份文件名 `host.bak.<YYYYMMDDHHmmss>`，位于 `inventory/backups/`（同目录遗留自愈迁入）；恢复时间戳可从文件名解析。
- 前端行键 = WeakMap 身份键（`rowKeyOf`），`load()` 重建 rows 后键失效 → 展开态丢失（P3-9 根因）。
- `ansible_inventory` 为 admin-only；审计 ROUTE_MAP 已覆盖 PUT/parse/render。

## Goals / Non-Goals

**Goals：** 护栏一致、恢复闭环、反馈完整、导入预览诚实；见 proposal · Goals。

**Non-Goals：** proposal · Non-goals 全项。设计层另加：不做备份下载到本地（预览 + 恢复已闭环，避免凭据文件多副本扩散）；不做备份保留策略可配置（固定 10 份）。

## Decisions

> 决策点 1–3 待裁决；下文按推荐（1A/2A/3B）展开，B 落差随文标注。

### D0 角色口吻

`ansible_inventory` admin-only，全部文案按「管理员」口吻，无角色分支。

### D1 raw_text 护栏补齐（决策点 1A，P1-1）

`put_inventory` raw_text 分支在 `parse_inventory` 无错误后，追加：

```python
doc = yaml.safe_load(new_text) or {}
platform_ips = await _platform_node_ips(db)
errors = inventory_service.validate_structure(doc, platform_node_ips=platform_ips)
```

- 与 hosts 路径完全同源（同一函数、同一文案格式），400 detail 取首个错误（与现有口径一致，多错误合并 `\n` 连接——hosts 路径现状是 join 全量，raw 路径对齐 join 全量更诚实，两端统一为 join）。
- `parse_inventory` 对 raw 已经做过行尾制表符剥离与行号定位（主规格既有需求），无回归面。
- 规格「删除平台已录入的主机被阻止」场景由此对任意视图成立；无需 MODIFIED 旧块（表格场景本就成立，ADDED 新 requirement 覆盖全形态）。
- B 分支（维持豁免）：不加校验，主规格场景文字改为「表格视图保存被拒绝」——不推荐：源码视图与表格视图同页切换，后门等于没有门。

### D2 备份列表与一键恢复（决策点 2A，P1-2）

新端点（挂在既有 `/ansible` router，权限同源 `require_permission('ansible_inventory')`）：

- `GET /ansible/inventory/backups` → `[{name: "host.bak.20261027093000", saved_at: isoformat, size_bytes}]` 倒序；解析文件名时间戳，读目录零成本。
- `GET /ansible/inventory/backups/{name}/content` → `{raw_text}`（只读预览；name 校验 `host.bak.*` 形态防路径穿越）。
- `POST /ansible/inventory/backups/{name}/restore` → 以备份内容为 `new_text` 走与 PUT 完全相同的护栏序列（409 互斥 → parse → validate_structure(platform_ips) → `save_inventory`——`save_inventory` 内部会先把**当前文件**备份一份，恢复动作本身可再逆）；审计 `enrich_audit(detail="恢复 Ansible 主机清单备份 {name}")` + commit。
- 前端：页头「恢复记录」按钮 → 抽屉（AppModal 三层制：普通信息层用 overlay modal 或抽屉？——列表+预览+恢复是复合流程，用页内抽屉（a-drawer）承载列表与预览；恢复确认用 `showOverlayModal` 危险确认。对齐弹窗三层制：普通确认走 overlay modal ✓。
- 恢复确认弹窗文案：「将把 {备份时间} 的备份恢复为当前清单，当前清单将先被自动备份（可再次恢复回来）。确定恢复？」——「恢复可逆」是诚实描述（恢复前自动备份使其可逆）。
- B 分支（仅列表只读）：砍掉 restore 端点与确认流，恢复指引文案指向源码视图手工粘贴。

### D3 保存反馈与元数据（P2-3）

- `GET /ansible/inventory` 响应加 `last_modified`（文件 mtime 的 naive UTC isoformat，文件不存在为 null；#26 时间口径，前端走 `utils/format.ts`）。
- 保存成功 toast：`已保存并生效：{N} 台主机`（N = 组装后 hosts 数；源码模式 = parse 后 hosts 数）。
- 页头 actions 追加「操作日志」链接 → `/audit-log`（审计资源键 `ansible_inventory`，与 ClickHouse/plugin-switches 先例同款）。
- 元数据行：页头 description 下方弱色一行「清单最后修改：{formatDateTime(last_modified)} · N 台主机」。

### D4 批量导入预览（P2-4）

- `parseBulkHosts` 增加每条 `isHostnameKey`（`!IPv4_RE.test(ip)` 且过 HOST_KEY_RE）；错误行逻辑不变。
- 弹窗预览重构为两段摘要 + 警示行列表：
  - 「将新增 N 台主机 · 将覆盖 M 条现有主机凭据」（N/M 为 0 时该项不显示）
  - 非 IP 主机键行：黄色警示「第 K 行：主机键 `bad` 不是 IP，将按主机名原样保存」
  - placeholder 改为「每行一条：主机键 [SSH用户] [SSH密码]（主机键为 IP 或主机名；# 注释）」
- 确认按钮禁用条件不变（errors 非空）。

### D5 高级校验错误定位（P2-5）

- `validateRowsAdvanced` 返回结构化结果 `[{rowKey, key, message}]`（替代纯字符串数组）。
- 校验失败：`expandedKeys` 并入首个出错行行键 + `highlightKeys` 高亮 + 滚动定位（复用 `appendAndLocate` 的滚动模式）；行内标红：把错误按 rowKey+key 记入 `advancedErrors` reactive map，`AnsibleAdvancedFields` 支持 `errors` prop（字段下红字）；toast 保留汇总（不再是唯一形态）。
- 组级错误（`validateGroupAdvanced`）同理展开组级行。

### D6 文案与状态收尾（P2-6 / P3）

| 现状 | 改为 | 位置 |
|---|---|---|
| `已生效` | `已保存并生效：N 台主机` | 保存成功 toast |
| 页头 description 三句长文 | 「维护 Edge 集群的 Ansible inventory（all.children.edge_cluster），保存后立即对节点任务生效。SSH 密码按平台约定明文存储与展示，不做掩码。」 | PageHeader |
| 空源码 parse 报「结构错误…」 | parse 服务端不动（保真）；**前端**切换到表格时若 hosts/vars 全空且 errors 为该结构错误 → 文案转译「清单为空：确认要保存空清单，还是补全主机？」（仅源码→表格切换路径；直接保存空清单仍按既有 400——决策：空清单保存语义维持现状，超出本变更） | switchTo |
| 「SSH 密码（明文）」×2 | 组级卡副标题统一说明「密码按平台约定明文存储」，列头改「SSH 密码」 | 表头 |
| 保存后展开态丢失 | 行键改为稳定键（加载时按 index+ip 生成 `stableKey`，WeakMap 仅兜新增行） | load/applyServerStructure |

- 空源码转译的实现位置：`switchTo('table')` 中 `res.data.errors` 命中「必须是映射」且 parse 结果 hosts/vars 全空 → 用引导文案替换并阻止切换（不写盘路径，纯前端文案）。

### D7 守卫与既有断言

- 既有测试：`test_put_raw_text_saves_and_backs_up`（VALID_INVENTORY 含全部平台 IP → 补护栏后仍 200 ✓）；`test_put_invalid_yaml_returns_400_with_line_and_no_write` 不受影响。新增护栏用例：raw 删除受管 IP → 400 + 无写盘；raw 主机键非法 → 400。
- 源码守卫：本页无既有源码级守卫；「DNS 查询」式术语守卫不适用。新组件测试：备份抽屉、导入预览、校验定位（AnsibleAdvancedFields errors prop）。

### D8 删除保护收窄为基线口径（2026-10-27 用户裁决 A，真实环境实测驱动）
- **发现**：真实环境实测（节点表 40+ 多集群节点）暴露既有 hosts 路径删除保护语义过宽——要求「清单收录全部平台节点 IP」，而清单是 edge_cluster 单组文件；test 集群（10.255.255.x）等 12 个 IP 永不入选 → **任何保存/恢复都被 400**（此前开发库节点少未暴露；raw 补齐护栏后两路同等暴露）。
- **裁决**：A——`removed = (保存前清单IPs ∩ 平台节点IPs) − 提交IPs` 才拦。平台有但清单从来没有的 IP 不拦（与己无关的节点不是「删除」）；主规格场景「删除平台已录入的主机被阻止」字面保持成立（场景隐含该 IP 在清单中）。
- **实现**：`validate_structure(doc, platform_node_ips, previous_host_ips)`；三处调用点（PUT hosts / PUT raw / restore）以 `_current_host_ips()`（保存前文件解析）为基线。恢复链路自动修复（旧备份不含无关节点不再被拒）。
- **既有断言反转**：`test_put_deletion_protection_returns_400` 补写基线文件；服务级两用例补 `previous_host_ips` 并改判 1.7 不拦；新增 A 口径差异用例 ×3（hosts/raw API + 服务级三态）。
- **附带修复**：删除保护文案 IP 去重（同 IP 属多集群在 Node 表重复出现，实测 ×13）。
- **审计**：restore 显式 ROUTE_MAP 映射 `ansible_inventory.restore`（词汇推断误报 create）。

### D9 删除保护彻底移除（2026-10-27 用户二次裁决，批 4）

- **发现**：D8 基线口径落地后，用户在真实环境保存时仍被拦（4 个平台节点 IP 从清单移除 → 400）。实测后用户再次裁决：**不再关注节点 IP，保存/恢复直接放行**——清单与节点管理彻底解耦，不做任何删除保护。
- **裁决影响**：D1/D8 的删除保护部分随之作废；`validate_structure` 收窄为纯结构校验（主机键 + 主机值合法性），`platform_node_ips`/`previous_host_ips` 参数与 `_current_host_ips()` 基线全部移除；三调用点（PUT hosts / PUT raw / restore）只传 `doc`。`_platform_node_ips` 保留（GET `unmanaged_ips` 未纳管提醒仍需要）。
- **保留的护栏**：运行中任务 409 互斥、YAML 解析 400、主机键/主机值结构校验 400、主机键口径（IPv4 或主机名）——全部不变。
- **主规格场景反转**：「删除平台已录入的主机被阻止」标题保留作稳定标识符（openspec MODIFIED 块场景名集合必须覆盖现文，重命名不受支持），正文按裁决反转为「保存成功、直接移除」并注明裁决来源；批 1「源码模式绕过删除保护」的问题陈述随之失效（已无保护可绕过），raw 与 hosts 两路仍保持**结构校验同源**。
- **断言反转清单（#217）**：API 层三用例反转（hosts 删除受管 IP → 200 写盘、raw 删除受管 IP → 200 写盘、恢复缺受管 IP 备份 → 200 写盘）；服务级三用例删除（保护不复存在，端到端行为由 API 层钉死）；`test_put_platform_ip_never_in_inventory_saves` 等口径用例保留为回归。

## Risks / Trade-offs

- [raw 路径补护栏改变源码模式行为（此前可绕过）] → 这正是修复目标；对真依赖后门的场景（临时移除节点）走节点管理删除流程（规格既有指引）；变更说明在 tasks 收口时提示用户。
- [恢复把旧凭据写回清单] → 恢复走全护栏 + 恢复前自动备份当前文件（`save_inventory` 原生行为）→ 恢复可逆；确认弹窗明示。
- [备份内容预览暴露凭据] → 本页本就是明文凭据管理页（#10 口径），权限同源 admin-only，无新增暴露面。
- [mtime 精度/时钟] → 服务器单源，仅展示用途。
- [保存后保持展开态] → 稳定行键冲突场景（同名 ip）由 assembleHosts 既有重复校验兜底。

## Migration Plan

- 无 DB schema 变更；新端点纯读 + 复用既有写路径 → PG 方言冒烟按 #103 评估：不触发（无模型/SQL/序列化变更；恢复端点写路径 = 既有 save_inventory 文件操作）。
- 回滚 = revert 提交；备份目录结构不变。

## Open Questions

- 无——决策点 1–3 已前置 proposal，推荐分支已展开，B 分支落差随文标注。
