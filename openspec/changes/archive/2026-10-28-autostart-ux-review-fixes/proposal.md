# proposal: autostart-ux-review-fixes

## Why

用户以标准评审简报要求对自启动管理模块做体验评审（易用性 / 易于理解 / 界面美观与信息层级 / 安全与风险感知四维），输出 openspec 需求文档，批准前不动代码（#240）。

证据链：`EdgeAutostart.vue`（503 行）与 `edge_autostart.py`（233 行）/ `ansible_service.edge_autostart` / `NodeAutostart` 模型 / 主规格 `edge-node-autostart` + `autostart-status-record` 全文走读；真实页面 Playwright 走查 4 张截图（列表全景 / 启用抽屉 / 查询抽屉 / 直连查询结果抽屉，test 集群 192.168.0.13 实查，全部只读操作）；API 探针 3 组（集群/节点清单、`/nodes/autostart/records` 现存 5 条记录、审计 ROUTE_MAP 覆盖确认）。

**模块本质**：对集群下 Edge 节点批量视角的单节点 systemd 自启管理页（启用 / 禁用 / 查询三操作，SSE 流式反馈）。功能主干完备（状态持久化、假成功守卫、凭据不落库、审计留痕），问题集中在**批量视角缺失、状态新鲜度不可见、危险操作无风险说明、结果反馈毛糙**。

### 主要问题清单（按严重度排序）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| P1-1 | 易用性 | 无批量操作：40+ 节点逐台点击、逐台输 root 密码；无多选、无批量启用/禁用/批量查询 | 01 全景截图；`loadNodes` pageSize=500 全量 |
| P1-2 | 易用性 | 状态新鲜度不可见：表格只显示状态 tag，不显示 `updated_at` / 最后操作（DB 全有）；用户无法判断「已启用」是 10 分钟前还是 3 周前查的 | `autostart_records` 返回 action/rc/updated_at，前端 `loadAutostartRecords` 只取 status |
| P1-3 | 规格漂移 | 主规格场景「刷新同步真实状态：点击刷新 SHALL 重新查询各节点真实自启动状态」与实现不符——刷新只重新读库，从不触达节点 | `loadNodes` → `loadAutostartRecords`（纯读库）；后端无批量查询端点 |
| P2-4 | 易于理解 | 「未知」默认态语义混淆：从未查询与查询失败同显灰色「未知」，且无引导；「无权限」用红色 tag 但它是查询失败不是节点状态 | 01 截图 30+ 行「未知」；`loadAutostartRecords` status=null 不区分「从未查询」 |
| P2-5 | 安全感知 | 禁用无风险说明：禁用 = 节点重启后 Edge 不自动拉起，抽屉与确认无任何后果提示；启用会覆盖 `/etc/systemd/system/edge.service`，无「将覆盖现有服务文件」提示 | 抽屉文案（EdgeAutostart.vue L58-112）；规格「保留 service 文件（仅取消自启）」语义页面不可见 |
| P2-6 | 易用性 | 无预检：节点不在 inventory / Edge 目录为空，在填完 root 密码提交后才 400；表格不标记不可操作节点 | `node_autostart` L129-138 的 400 分支；表格无对应标识 |
| P2-7 | 易用性 | 查询抽屉展示无关字段：查询状态抽屉也显示「Edge 目录」「运行用户」（status 路径不使用） | 03 截图；后端 L140-145 仅 enable 用 run_user/edge_path |
| P3-8 | 反馈毛糙 | 结果抽屉完成态仍显示「等待中...」（本页从不设置 elapsed/streamStatus 完成态）；「返回码 (rc):」空值裸露；关键信息高亮与统计卡重复展示同一状态 | 04 截图；`NodeExecutionResultDrawer.vue` L38 `elapsed===null && streamStatus!=='connecting'` → 等待中 |
| P3-9 | 美观/标准 | 表格无分页（40+ 行全量渲染）、无 `#` 序号列、无状态筛选、无 IP 搜索；集群筛选为原生 select 与全站 a-select 风格不一 | 01 截图；违反 #54 / #59 全站表格标准 |
| P3-10 | 美观 | 启用按钮 type=primary 全表强调（40 个主色按钮）；Edge 目录列宽占比大、低频 | 01 截图 |
| P3-11 | 安全感知 | 操作历史无入口：DB 审计字段（action/rc/脱敏 command/updated_at）全套持久化但页面零透出；审计资源键 `autostart` 已入 ROUTE_MAP，但页面无「操作日志」链接 | `autostart_records` 响应 vs 前端仅取 status |
| P3-12 | 文案 | 错误提示直接透出流错误原文（如英文 SSH 报错）或「操作失败: failed」，无原因归类与解决指引 | `confirmAction` onError / onComplete 分支 |

### Non-goals

- 不改后端执行链路（SSH/ansible 执行、假成功守卫、凭据不落库、状态持久化规则均已收敛且有守卫测试）。
- 不做 root 凭据的任何形式持久化或跨会话记忆（规格红线）；批量操作的密码复用限定**单次批量请求内**。
- 不新增实时状态轮询/定时刷新（避免对节点 SSH 风暴）；真实状态获取仍为显式用户动作。
- 不动 NodeExecutionResultDrawer 的其他消费方（节点安装/任务）——本页特有的收尾问题在本页传参侧解决。

## Goals

1. 批量视角：多选节点 + 批量启用/禁用/批量查询，root 密码单次批量输入（不落库不变）。
2. 状态可信：展示最后查询时间与最后操作，区分「从未查询 / 查询失败 / 真实态」；刷新语义对齐规格（读库重载 + 显式批量查询两个动作）。
3. 危险操作有感知：禁用/启用抽屉明示后果与覆盖行为；禁用加确认步。
4. 反馈收口：结果抽屉完成态、rc 空值、重复信息、错误文案归类。
5. 表格对齐全站标准：分页 + `#` 序号列 + 状态筛选 + IP 搜索 + a-select。

## 交付物

见 design.md 决策点 D1–D8 与 specs delta、tasks.md 分批任务。
