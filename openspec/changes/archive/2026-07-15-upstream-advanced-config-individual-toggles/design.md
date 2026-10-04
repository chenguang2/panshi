## Context

上游创建/编辑弹窗（`UpstreamFormModal.vue`）当前使用一个布尔值 `advancedEnabled` 控制所有高级配置字段的显隐和提交。提交时 `checks` 和 `timeout` 永远在 `submitData` 中（不论开关状态），其余字段仅在 `advancedEnabled=true` 时加入。

后端 API（`cluster_upstreams.py`）使用 `UpstreamUpdate.model_dump(exclude_unset=True)` 处理更新请求。`convert_upstream_to_edge_format()` 对可选字段使用 `if field:` 或 `if field is not None:` 守卫，未提供的字段不加入 PUT body，APISIX 收到 PUT 后缺失字段使用默认值。

### 约束

- 后端 `model_dump(exclude_unset=True)` 保留"未发送=不修改"语义
- 后端 JSON 字段序列化：`if key in ("checks","timeout","keepalive_pool") and value:` → 值为 `None` 时不序列化，`setattr(None)` 写入 DB NULL
- PUT publish 全量替换：不存在的字段 → APISIX 默认值
- `retries` 三态：null=自动（节点数）、0=禁用、N=重试N次

## Goals / Non-Goals

**Goals:**
- 每个高级配置项拥有独立 toggle/radio 控制
- Toggle OFF → 前端发 `null` → DB NULL → PUT omit → Edge 默认值
- 重试次数用 radio 三态（自动/指定/禁用），不与重试超时捆绑
- Host 策略和通信协议拆为独立 toggle
- 后端零改动（当前已天然支持）
- 编辑回填时 toggle 状态由 DB 值是否为 NULL 确定

**Non-Goals:**
- 不涉及后端数据模型变更（不改表结构）
- 不涉及发布流程变更（仍用 PUT）
- 不涉及其他资源类型（路由、插件组等）的高级配置

## Decisions

### D1: 每项独立 toggle 设计

每个高级配置 section 使用一个 `ref<boolean>` toggle，决定该 section 是否启用。

| Section | ID | 控件 | Toggle OFF 提交值 | Toggle ON 逻辑 |
|---------|-----|------|-------------------|---------------|
| 健康检查 | `toggleChecks` | checkbox + textarea | `checks: null` | `checks: JSON.parse(textarea)` |
| 超时配置 | `toggleTimeout` | checkbox + 3 inputs | `timeout: null` | `timeout: {connect, send, read}` |
| 连接池 | `togglePool` | checkbox + 3 inputs | `keepalive_pool: null` | `keepalive_pool: {...}` |
| 重试次数 | `toggleRetries` | checkbox + radio + input | `retries: null` | radio→auto:null / N:N / 0:0 |
| 重试超时 | `toggleRetryTimeout` | checkbox + input | `retry_timeout: null` | `retry_timeout: N` |
| Host 策略 | `toggleHost` | checkbox + select + input | `pass_host: null, upstream_host: null` | `pass_host: v, upstream_host: v` |
| 通信协议 | `toggleScheme` | checkbox + select | `scheme: null` | `scheme: v` |

### D2: retries 用 radio 三态而非 toggle

**理由**：retries 的 null/0/N 都是有效语义值，单纯 toggle ON/OFF 无法表达"显式选 auto"。

- `radioRef` 与 `toggleRetries` 独立：toggle 控制"是否启用"，radio 控制启用后的三态选择
- 三个 radio 选项：自动（auto）、指定次数（N）、禁用（0）
- 编辑回填：DB=NULL → toggle OFF；DB=0/N → toggle ON + radio 对应选项

### D3: 编辑回填使用 DB NULL 推断 toggle 状态

回填逻辑从当前复杂的"推断所有字段是否默认值"改为直接检查 DB 值：

```typescript
toggleChecks.value       = u.checks !== null
toggleTimeout.value      = u.timeout !== null
togglePool.value         = u.keepalive_pool !== null
toggleRetries.value      = u.retries !== null
toggleRetryTimeout.value = u.retry_timeout !== null
toggleHost.value         = u.pass_host !== null
toggleScheme.value       = u.scheme !== null
```

retries radio 回填：`u.retries === null → 不处理(因 toggle OFF)`；`u.retries === 0 → 禁用`；`u.retries > 0 → 指定 + 回填值`。

### D4: 移除默认 checks 和 timeout 的旧行为

当前 Requirement 要求"无论高级配置是否开启，始终包含默认 checks 和 timeout"。这导致 DB 永不 NULL。

**新行为**：
- 创建上游时不再默认发送 checks 和 timeout
- 只有用户显式 toggle ON 对应 section 时，才发送该字段的值
- toggle OFF 时发送 null → DB NULL → PUT omit → Edge 默认

### D5: 重试超时提取为独立 toggle

与重试次数解耦，因为重试超时是一个独立的配置维度：
- 用户可以启用重试次数但保持重试超时默认（OFF）
- 用户可以只配重试超时而不改重试次数
- 编辑回填时两个 toggle 状态独立判断

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 升级后已有数据（DB 有值）的用户打开编辑，toggle 会自动 ON。如果用户不修改直接保存，没问题。如果用户 toggle OFF 再保存，该字段会变 NULL。 | 这是期望行为——toggle OFF 表示"不启用"。用户切换前应有意识地确认。 |
| `retries=null` 同时表示"未配置"和"自动（节点数）"，编辑回填时 toggle 会显示 OFF，无法区分。 | 接受此 trade-off。用户 toggle ON 后 radio 默认选中"自动"，视觉上等价。如果一定要区分，需引入 sentinel 值，但得不偿失。 |
| 节点列表中的 `target` 格式（当前用 `ip:port`）未纳入讨论。 | 节点列表属于基础配置，不在本次变更范围内。 |
