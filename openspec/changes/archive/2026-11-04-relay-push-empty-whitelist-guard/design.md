# Design

## Context

白名单渲染以区域为单元（`relay_push.render_nginx_map` → `_region_nodes(db, region, enabled_only=True)`），nginx 流量 map **只含启用节点**是既有设计语义（AGENTS #50：禁用节点不承载流量；SSH 管理白名单才用全量节点，勿合并）。本次事故不是渲染 bug，而是「0 启用节点」这一数据状态下下发动作仍然静默成功，把网关白名单整体覆盖为空。现状代码要点：

- `push-config`（`relay.py:187`）为 SSE 端点，已有「流前 HTTPException」前置校验路径（400 无 prefix / 503 清单缺失 / 409 同区域并发），前端 `useInstallStream` 对非 2xx 已有 onError 兜底。
- `list_gateways`（`relay.py:89`）已有逐行派生字段先例：`inventory_group_missing`。
- 前端 `RelayGateways.vue::handlePush` 确认弹窗为静态文案，`startExec(record, 'push')` 默认 body `{}`。
- 事故数据形态：区域绑定正确（cluster.region_code='bj'），4 节点全部 `status=0`（批量禁用后未察觉）。

## Goals / Non-Goals

**Goals:**

- 「0 启用节点 → 下发清空白名单」从静默成功变为显式决策：默认拒绝，明确确认后放行。
- 下发确认弹窗如实呈现本次将下发的白名单规模（启用节点数、全量替换语义）。
- API 直调方（脚本/E2E）与界面用户同等受保护。

**Non-Goals:**

- 不改白名单「全量替换」语义本身（节点禁用导致白名单缩水是设计行为，靠计数可见性解决）。
- 不给 init / config-preview 加空名单闸（见 D2）。
- 不做部分漂移防护（如「本次将移除 X 个节点」的逐节点 diff 提示，留待后续按需立项）。

## Decisions

**D1 — 后端硬闸 + 显式旁路（hybrid），而非仅前端确认或纯硬禁。**
仅前端确认拦不住 API 直调（本次排障链路里脚本/自动化同受影响）；纯硬禁又堵死「区域下线时清空白名单」的合法运维动作。折中：0 启用节点时后端返回 409，请求体 `allow_empty=true` 显式放行；前端在 N=0 时弹危险确认、用户点「仍要下发」才携带该标志。备选已否决：仅前端拦截（绕过界面即失效）、后端无条件拒绝（合法场景走不通）。

**D2 — 闸只加在 push-config；init 与预览不动。**
init 是装机引导路径（「绑定区域 → 装机 init → 后续再挂节点」的顺序下白名单为空是合法脚手架状态），且 init 主目的是写 8443 server 块；config-preview 只读、如实展示空 map 反而是诚实的。若 init 也加闸，会破坏首次装机的最小流程。风险：init 后若忘 push 仍可能白名单为空——由既有「链路体检 403 暴露」机制兜底（主规格既有 Scenario：漂移暴露）。

**D3 — 拒绝用 409，不是 422。**
语义是「当前区域状态不允许该操作」（状态冲突），与 `delete_gateway` 区域仍被挂接 → 409 同款。detail SHALL 明确给出修复动作「将节点状态改为启用」，并点名挂接集群与禁用节点数（守卫处一条 grouped 查询即可拿到，与 D5 同源），让提示可直接执行。格式：
- 有点名集群：`该区域当前没有启用节点（「test-2」的 4 个节点均为禁用状态），下发将清空该局网关白名单；请先将节点状态改为「启用」后重试，或确认空名单下发`（多集群以「、」连接逐集群段；集群内节点 0 个写 `「x」无节点`）
- 无挂接集群：`该区域当前没有挂接集群或启用节点，下发将清空该局网关白名单；请先挂接集群并启用节点，或确认空名单下发`

**D4 — 请求体向后兼容：`payload: RelayPushConfigRequest | None = None`。**
现端点无 body 参数；E2E/脚本既有直调可能不带 body（FastAPI 对声明了必填 body 的端点会 422）。用 `None` 默认 + `body or RelayPushConfigRequest()` 兜底，既有调用零破坏。前端 `useInstallStream` 对 push 默认发 `{}`，`allow_empty` 缺省 False，解析无虞。

**D5 — 计数回填放 `list_gateways`，模式照抄 `inventory_group_missing`。**
一条 grouped 聚合查询（`ps_cluster.region_code == gateway.code` join `ps_node`，分 enabled/total 两列）逐行回填 `enabled_node_count` / `total_node_count`。不放独立端点：确认弹窗打开前无需二次请求，列表页本就周期刷新；该页每次 load 一次聚合，量级（区域数 ≤ 个位数）无性能顾虑。

**D6 — 最终文案（精确值，实现照抄）。**
- 正常（N>0）确认弹窗：标题「下发网关配置」不变；正文第一行改为 `将「{name}」的节点白名单推送到该局全部网关机：本次将下发 {N} 个启用节点（共 {T} 个节点；全量替换，未启用的节点将从白名单移除）。`；第二行 muted 说明保留现文案（sshd PermitOpen 腿暂缓）；okText 保持「开始下发」。
- N=0 危险确认：标题不变；正文 `该区域当前没有启用节点，下发将把该局网关白名单清空，该局所有经网关的发布/节点任务将被 403 拒绝。`；muted 行 `若为误操作，请先到集群节点列表将节点状态改为「启用」，再重新下发；确要清空（如区域下线）再继续。`；`okText: '仍要下发（白名单为空）'`、`okDanger: true`（`showOverlayModal` 已支持，handleDelete 先例）；确认后 `startExec(record, 'push', { allow_empty: true })`。
- 后端 409 detail 前端直接透出（`getApiErrorMessage` 既有通道），与弹窗 muted 行构成两层「改为启用」提示。

## Risks / Trade-offs

- [计数与下发瞬间之间存在窗口：列表加载后节点状态再变，确认弹窗里的 N 已陈旧] → 后端闸以**下发时点**实况判定（渲染后统计），前端 N 仅用于提示；N 陈旧最多导致多一次 409 提示，不会误放行。
- [既有多台网关机时「部分局启用节点、部分局没有」感知混淆] → 闸按区域（gateway.code）判定，一区域一白名单，无跨区域混淆面。
- [加 body 参数后既有 push 测试断言漂移] → 实现前先 grep 既有用例（`push-config`、handlePush 弹窗断言）产出断言反转清单，按 #217 流程以全量相关域收口。

## Migration Plan

无数据迁移、无 schema 变更。部署即生效；回滚即还原代码。既有空名单下发脚本直调（如有）会开始收到 409，属预期行为变化，需显式带 `allow_empty=true`。

## Open Questions

（无——文案、状态码、旁路语义均已定；若评审要求调整文案措辞，仅影响 D6 常量与对应测试断言。）
