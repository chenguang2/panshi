## 1. 前端模板：拆总开关为 7 个独立 section

- [ ] 1.1 移除基础配置底部的"开启高级配置"checkbox（当前 L107-112）
- [ ] 1.2 高级配置 Tab 移除 `v-if="form.advancedEnabled"` 外层包裹，改为每个 section 独立控制
- [ ] 1.3 健康检查 section：checkbox toggle + 受控 textarea（默认 JSON 内容），toggle OFF 时 textarea 置灰
- [ ] 1.4 超时配置 section：checkbox toggle + 3 个受控输入框（connect/send/read），toggle OFF 时全部置灰
- [ ] 1.5 连接池 section：checkbox toggle + 3 个受控输入框（size/idle_timeout/requests），toggle OFF 时全部置灰
- [ ] 1.6 重试次数 section：checkbox toggle + radio 三态（自动/指定/禁用）+ 受控输入框（指定时显示），toggle OFF 时全部置灰
- [ ] 1.7 重试超时 section：checkbox toggle + 受控输入框，toggle OFF 时置灰
- [ ] 1.8 Host 策略 section：checkbox toggle + pass_host select + upstream_host input（conditional），toggle OFF 时全部置灰
- [ ] 1.9 通信协议 section：checkbox toggle + scheme select，toggle OFF 时置灰
- [ ] 1.10 移除"高级配置未启用"占位提示（当前 L197-200）

## 2. 前端响应式数据：新增独立 toggle 和 radio 状态

- [ ] 2.1 新增 `ref<boolean>`：`toggleChecks`, `toggleTimeout`, `togglePool`, `toggleRetries`, `toggleRetryTimeout`, `toggleHost`, `toggleScheme`
- [ ] 2.2 新增 `ref<string>`：`retriesRadio` 取值 `"auto"` / `"custom"` / `"disabled"`
- [ ] 2.3 新增 `computed<number | null>`：`retriesValue` 根据 radio 状态返回 null/0/N
- [ ] 2.4 表单初始化时所有 toggle 默认 OFF，retriesRadio 默认 `"auto"`

## 3. 前端编辑回填逻辑：根据 DB 值推断 toggle 和 radio 状态

- [ ] 3.1 编写 `populateTogglesFromUpstream(u)` 函数，每个 toggle 根据 `u.field !== null` 设置
- [ ] 3.2 retries 特殊处理：`u.retries === null → toggle OFF`；`u.retries === 0 → toggle ON + radio="disabled"`；`u.retries > 0 → toggle ON + radio="custom" + 回填值`
- [ ] 3.3 retry_timeout 特殊处理：`u.retry_timeout === null → toggle OFF`；否则 toggle ON + 回填值
- [ ] 3.4 移除旧的 `advancedEnabled` 推断逻辑（当前 L316-330）
- [ ] 3.5 保留 `checksJson` 的 watch 同步到 `form.checks`（当前 L270-272），但仅 health check 启用时生效

## 4. 前端提交逻辑：每项独立发送 value 或 null

- [ ] 4.1 重写 `handleSubmit()`：移除 `advancedEnabled` 块，改为 7 段独立判断
- [ ] 4.2 健康检查：`submitData.checks = toggleChecks.value ? parsedChecksJson : null`
- [ ] 4.3 超时配置：`submitData.timeout = toggleTimeout.value ? form.timeout : null`
- [ ] 4.4 连接池：`submitData.keepalive_pool = togglePool.value ? form.keepalive_pool : null`
- [ ] 4.5 重试次数：`submitData.retries = toggleRetries.value ? retriesComputedValue : null`
- [ ] 4.6 重试超时：`submitData.retry_timeout = toggleRetryTimeout.value ? form.retry_timeout : null`
- [ ] 4.7 Host 策略：`submitData.pass_host = toggleHost.value ? form.pass_host : null`；`submitData.upstream_host = toggleHost.value ? form.upstream_host : null`
- [ ] 4.8 通信协议：`submitData.scheme = toggleScheme.value ? form.scheme : null`
- [ ] 4.9 移除 `submitData` 中始终包含 `checks` 和 `timeout` 的旧代码（当前 L422-423）
- [ ] 4.10 验证：提交时不发送任何未 toggle ON 的字段对应的 null 值——确保 `model_dump(exclude_unset=True)` 正确排除 null

## 5. 后端验证

- [ ] 5.1 确认 `cluster_upstreams.py` 更新函数中 `and value:` 守卫不阻断 null 写入：`key in ("checks","timeout","keepalive_pool") and value` → value 为 None 时条件为假，跳过 json.dumps，执行 `setattr(None)` → DB NULL
- [ ] 5.2 确认 publish 函数中 `json.loads(upstream.checks) if upstream.checks else None` 正确处理 NULL → None → publish omit
- [ ] 5.3 确认 `convert_upstream_to_edge_format` 各字段守卫：None → omit → PUT 体不含该字段 → APISIX 默认值

## 6. 测试

- [ ] 6.1 更新前端单元测试：创建上游时 toggle 全部 OFF → 提交数据不含 checks/timeout 等
- [ ] 6.2 更新前端单元测试：toggle health check ON + 填写 → 提交含 checks
- [ ] 6.3 更新前端单元测试：retries radio 三态切换 → 提交数据正确（auto→null，指定→N，禁用→0）
- [ ] 6.4 更新前端单元测试：编辑回填时 toggle 状态推断正确
- [ ] 6.5 手动 E2E 验证：创建上游（全部 toggle OFF）→ 发布到 Edge → 验证 Edge 端无 health check / timeout 配置
- [ ] 6.6 手动 E2E 验证：编辑已有上游，toggle ON 某项 → 保存 → 发布 → Edge 端该配置出现
- [ ] 6.7 手动 E2E 验证：已配置的上游，toggle OFF 某项 → 保存 → 发布 → Edge 端该配置消失

## 7. 规格同步

- [ ] 7.1 运行 `openspec sync-specs` 将 delta spec 同步到主 specs/upstream-advanced-config/spec.md
