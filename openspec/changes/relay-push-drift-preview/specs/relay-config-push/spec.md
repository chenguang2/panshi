# relay-push-drift-preview Changes

## ADDED Requirements

### Requirement: 下发漂移预览
系统 SHALL 持久化每个区域最后一次成功写入网关机的白名单快照（`relay_gateways.last_pushed_nodes`，`ip:管理端口` 列表 + `last_pushed_at`）：`push-config` 与 `init` 终态成功时 SHALL 更新快照（`allow_empty=true` 的空名单下发成功后 SHALL 如实写空列表），终态失败或假成功 SHALL NOT 更新，sshd-setup SHALL NOT 触碰快照。快照写入 SHALL 经与 SSE 生命周期解耦的后台任务完成（生成器 `finally` 内不写库）。`GET /relay/gateways` SHALL 逐区域回填 `push_drift`（当前启用节点集合相对快照的 `{added, removed}` 差集；无快照为 null）与 `last_pushed_at`，纯平台侧计算。前端「下发配置」确认弹窗 SHALL 呈现漂移：将移除节点时 SHALL 琥珀警示并列出移除节点清单（≤10 全列，超出列前 10 并标注总数）且确认按钮文案 SHALL 标明移除数；仅新增 SHALL 以弱化文案提示；无快照 SHALL 提示首次写入；集合一致 SHALL 不加提示行。0 启用节点的危险确认路径不受本需求影响。漂移提示为 advisory 性质：快照不代表网关机实况（人工手改、SSE 断连窗口不覆盖）。

#### Scenario: 将移除节点时警示
- **WHEN** 上次成功下发含节点 A、B、C、D，当前启用节点为 A、B、C（D 被禁用），管理员点击「下发配置」
- **THEN** 确认弹窗出现琥珀警示行「与上次成功下发（{时间}）相比，本次将移除 1 个节点：D:端口」，确认按钮文案为「开始下发（将移除 1 个节点）」

#### Scenario: 仅新增节点时弱提示
- **WHEN** 上次成功下发含 A、B，当前启用节点为 A、B、C（新增 C），管理员点击「下发配置」
- **THEN** 确认弹窗以灰字提示将新增 C，确认按钮文案不变

#### Scenario: 首次下发无快照
- **WHEN** 区域从未成功下发（快照为空）且存在启用节点，管理员点击「下发配置」
- **THEN** 确认弹窗显示「该区域尚无成功下发记录，本次为首次写入白名单」，不显示漂移差集

#### Scenario: 集合一致不加行
- **WHEN** 当前启用节点集合与快照完全一致，管理员点击「下发配置」
- **THEN** 确认弹窗不出现任何漂移提示行

#### Scenario: 快照仅在成功时更新
- **WHEN** push-config 或 init 终态返回失败（含空匹配假成功改判）
- **THEN** 快照两列保持原值不变；终态成功（含 `allow_empty` 空名单成功下发写 `[]`）才更新为本次写入内容

#### Scenario: 断连窗口的 advisory 定位
- **WHEN** 客户端在下发流式过程中途断开，ansible 实际执行完成
- **THEN** 快照可能停留旧值，下一次弹窗显示的差集允许陈旧；系统不将其当错误处理，再次成功下发即自愈
