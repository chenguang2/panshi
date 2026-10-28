# design: autostart-ux-review-fixes

## Context

见 proposal · Why 证据链。补充设计所需现状约束：

- 执行链路：前端 `useInstallStream` 消费 SSE（`POST /nodes/{id}/autostart`），后端 `ansible_service.edge_autostart` SSH 执行；enable/disable 以 root（sshpass -p），status 默认 inventory 用户直查、可选 root。
- 持久化：`ps_node_autostart` 每节点一行（status/action/command 脱敏/rc/updated_at），「真实态才覆盖」守卫已有（fix-autostart-perm-status）；records 端点返回全字段，前端只用 status。
- 状态五态：enabled/disabled/not_configured（真实态）+ permission_denied/unknown（失败推导，不覆盖真实态）。
- 前端既有共享设施：`usePagination.paginationProps`（#54）、表格 `#` 序号列标准（#59）、`NodeExecutionResultDrawer` + `useInstallStream`（SSE 消费）、`showOverlayModal`（弹窗三层制 #25）、审计资源键 `autostart`（ROUTE_MAP 已覆盖 POST）。
- test 集群 4 节点（192.168.0.13/14/15/24）可用于真页验收；启用/禁用需真实 root 凭据（验收时由用户提供或走查询类只读验收）。

## Goals / Non-Goals

见 proposal · Goals / Non-goals。

## Decisions

> 决策点 1–4 待用户裁决；下文按推荐分支展开，落差随文标注。D0 角色口吻：`edge_autostart` 权限键独立（运维管理员），文案按「运维人员」口吻，无角色分支。

### D1 批量操作（决策点 1，推荐 A，P1-1）

- **A（推荐）**：表格加选择列（a-table row-selection，默认不分页限制内全选/反选）+ 工具栏批量按钮「批量启用」「批量禁用」「批量查询状态」。批量启用/禁用弹**一个**共享 root 凭据抽屉（密码输入一次，仅本次批量请求内逐节点复用，不落库不变）；批量查询默认直连模式（无需密码），可选 root。逐节点流式执行（复用现有单节点 SSE 端点串行/小并发），结果汇总面板（每节点 rc/状态/耗时，失败的列出原因）。
  - 执行策略：**串行**逐节点（节点 SSH 与 systemctl 操作轻量，串行可控可读；并发会放大 SSH 连接风暴与日志交错）。N 节点预计 N×2~4s，40 节点 ≈ 2 分钟内，进度条 + 已完成/总数即可。
  - 后端不加新端点：批量 = 前端循环调既有单节点 SSE（每节点独立流，错误隔离天然成立）。
- **B（保守）**：只做批量查询（只读、无凭据问题），启用/禁用保持单节点。落差：高频痛点（批量启停）不解决。
- 裁决点：批量启用/禁用一次输入密码应用于多节点，是否可接受（凭据仍不落库、不跨请求，仅在同一批量会话内复用）。

### D2 刷新语义与状态新鲜度（决策点 2，推荐 A，P1-2 / P1-3 / P2-4）

- **A（推荐）**：拆成两个动作——
  - 「刷新」改名「重载」：读库重载（现实现），tooltip 说明「重新读取已记录的状态」；
  - 新增「批量查询状态」按钮（D1 的一部分）：对（筛选后的）全部节点或选中节点显式发起真实查询，完成后更新表格与库。
  - 主规格场景「刷新同步真实状态」按 A 口径改写：重载 = 读库；真实状态同步 = 批量查询动作（delta MODIFIED）。
- 状态列扩展：tag 下方弱色小字「{最后查询时间} · {最后操作}」（`formatDateTime` + 启用/禁用/查询，走 `utils/format.ts`）；超过 7 天未查询的真实态加「状态可能过期」提示（tooltip，不加警示色避免焦虑）。
- 五态展示修正：
  - 「未知」拆两态：**从未查询**（灰 outline tag「未查询」，非失败）与 **unknown**（「查询失败」红 outline，附原因 tooltip）；records 无记录 = 未查询。
  - 「无权限」（permission_denied）从红色降为橙 outline，语义改「查询受限」（它是查询失败不是节点异常），tooltip 说明「当前账号无 systemctl 读取权限，可用 root 查询或检查节点 sudo 配置」。
  - 「未配置」（not_configured）从中性事实角度保持灰/默认色（非错误），tooltip「节点上没有 edge.service，需先在节点安装或执行启用」。
- **B**：不加批量查询，只把「刷新」文案改为「重载（读库）」并修订主规格场景字面。落差：P1-3 只改文档不解决能力缺口。

### D3 危险操作风险感知（P2-5）

- 禁用抽屉顶部内嵌风险说明块（非弹窗，参考危险确认先例）：「禁用后，该节点重启时 Edge 将**不会自动启动**，需人工登录节点处理。服务文件保留，可随时重新启用。」确认按钮改「确认禁用」红色（danger）。
- 启用抽屉顶部说明块：「将在节点写入 /etc/systemd/system/edge.service（**覆盖同名文件**）并执行 daemon-reload + enable。」
- 批量禁用（D1）在凭据抽屉内二次强化同一风险说明 + 显示影响节点数：「将对 N 台节点禁用自启动」。
- 不加独立确认弹窗（抽屉 + 密码门槛已是双重门槛，再加弹窗过载；弹窗三层制 #25：密码抽屉本身即是确认层）。

### D4 预检与不可操作节点（P2-6）

- 前端加载时对每节点本地预检（零成本）：Edge 目录为空 → 操作按钮禁用 + tooltip「节点未配置 Edge 目录」。
- inventory 成员预检：后端 `GET /nodes/{id}/autostart/defaults` 已返回 inventory 用户；扩展思路——defaults 端点已按节点调用，但逐节点 40 次请求不可取。改为**records 端点扩展**：`GET /nodes/autostart/records` 增加 `in_inventory: bool` 字段（后端循环 `is_node_in_inventory`，纯内存文件检查，零外部 IO）→ 表格对不在 inventory 的节点禁用启用/禁用按钮 + tooltip「节点不在 ansible 主机清单，无法下发（先在清单中收录该节点）」。查询状态仍可用（status 直查不要求 inventory 成员？——核对：后端 inventory 校验对三种 action 一体拦截 L129；保持一致：三操作都禁用，tooltip 同文案）。
- run_user 兜底警示：defaults 拿不到 inventory 用户回退后端进程用户时（现状 qcg），抽屉内该字段下加橙字提示「未能从主机清单取得该节点的 SSH 用户，当前为平台进程用户（qcg）——若与 Edge 实际运行用户不符，服务将无法正常启动」。

### D5 查询抽屉瘦身（P2-7）

- 查询状态抽屉移除「Edge 目录」「运行用户」两字段（status 不用）；仅保留节点信息 + 查询方式（direct/root）+ root 凭据（root 模式时）。
- 启用/禁用抽屉保留全部字段（均使用）。

### D6 结果抽屉收尾（P3-8）

- `execElapsed` 接线：`useInstallStream` 完成时计时秒数已有设施（install 流同款），完成态进度条提示改为「已完成，用时 N 秒」（不再出现「等待中...」）。
- 「返回码 (rc):」空值不渲染（result 为 null 或 rc=null 时隐藏该行）。
- 「节点统计信息」与关键信息高亮重复：查询场景统计卡保留（字段化展示状态），高亮行简化为结果一句话；enable/disable 场景统计卡显示「自启动状态：已启用/已禁用」+ 节点 IP。
- 错误文案归类（P3-12）：按 rc/输出归类三类——认证失败（密码错误）→「root 认证失败：请核对 root 账号密码」；连接失败（超时/拒绝）→「无法连接节点 {ip}：{原因}，请确认网络与节点 SSH 服务」；其余 → 透出后端 detail + 指引「可查看执行日志定位」。

### D7 表格对齐全站标准（P3-9 / P3-10）

- `usePagination.paginationProps` 分页（默认 20/页，选项 10/20/50/100）；`#` 序号列（跨页公式 (page-1)*pageSize+index+1，#59）；新增状态筛选（a-select：全部/已启用/已禁用/未配置/查询受限/查询失败/未查询）与 IP 搜索框（前端内存过滤，数据量 ≤500）；集群筛选换 a-select（带清除）。
- 操作按钮：启用改默认按钮（danger 语义留给禁用），禁用用 danger 次要按钮；按钮统一 size=small；Edge 目录列收窄 + 省略 + tooltip。
- 页头 description 更新：说明启用/禁用的实际动作与禁用后果（与 D3 文案一致）；追加「操作日志」链接（审计页 `autostart` 资源，与 Ansible 清单页同款）。

### D8 操作历史可见（P3-11）

- 状态列小字（D2）已带「最后操作」；再加每行「最近操作」tooltip：hover 状态 tag 显示 action/rc/时间/脱敏命令（数据全在 records 响应，零后端改动）。
- 页头「操作日志」链接（D7）覆盖完整审计（audit_hook 已映射 POST autostart）。

## Risks / Trade-offs

- [批量启用的密码一次输入多节点复用] → 凭据仅存活于单次批量请求的内存中（与单节点现状同级），不落库不写日志（sanitize 守卫不变）；确认弹窗文案明示「密码将仅用于本次批量操作」。若用户裁决不可接受 → D1 B 分支。
- [批量串行 40 节点耗时 ~2 分钟] → 进度面板（已完成 n/total）+ 可随时关闭（关闭仅停止显示，后端单节点流各自完成；前端断开后续节点不再发起——诚实语义：断开 = 取消剩余）。
- [in_inventory 批量预检加在 records 端点] → 40 次 `is_node_in_inventory` 为纯文件内存检查（清单文件解析有锁），开销可忽略；不改安全语义。
- [规格场景改写「刷新同步真实状态」] → 字面变更但能力不缩水（重载 + 批量查询两动作覆盖原意且更诚实）。

## Migration Plan

- 无 DB schema 变更；records 端点加 `in_inventory` 为纯读扩展。PG 方言冒烟按 #103 评估：不触发（无模型/SQL/序列化变更）。
- 回滚 = revert 提交。

## Open Questions

- 无——决策点 1–4 已于 2026-10-27 用户裁决，全部采纳推荐分支：
  - 决策点 1 = **A**：批量启用/禁用接受单次批量流程内 root 密码复用（不落库、不跨请求）。
  - 决策点 2 = **A**：「重载（读库）」+「批量查询（真实同步）」两动作，主规格场景同步改写（delta 已按此落地）。
  - 决策点 3 = **7 天**：超过 7 天未查询的真实态加「状态可能过期」tooltip（不作警示色）。
  - 决策点 4 = **选中优先，否则筛选全量**：有勾选仅对选中节点执行，无勾选对当前筛选结果全量，按钮文案动态显示 N 台。
