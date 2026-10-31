# db-backup-dr-ux-optimization — sqlite-backup-restore Delta

## ADDED Requirements

### Requirement: 恢复执行响应契约
恢复执行端点 SHALL 将恢复服务层返回的完成态字段**原样透传**给前端，至少包括：`activated`、`active_connection_id`、`restored_databases`、`pre_restore_file`、`schema_reconciled`、`tables_added`、`columns_added`、`key_changed`、`restart_recommended`、`schema_migration_error`、`message`；MUST NOT 静默丢弃其中任何字段。前端恢复完成页据此渲染「恢复完成指引闭环」已要求的补齐计数信息行与重启建议行——契约字段缺失时这些安全提示不可达，视为违反本需求。端点响应结构变更 MUST 同步维护前端类型定义（`types/dbBackup.ts` 恢复结果类型）。

#### Scenario: 完成响应携带全部契约字段
- **WHEN** 恢复执行成功，服务层返回含 `schema_reconciled=true`、`key_changed=true` 等字段的完成态载荷
- **THEN** HTTP 响应体逐字段包含上述全部键值，前端完成页显示「已自动补齐 N 张表 / M 列」与高亮重启建议行

#### Scenario: 无补齐无密钥变更时不显示额外行
- **WHEN** 恢复执行成功且 `schema_reconciled=false`、`key_changed=false`、`restart_recommended=false`
- **THEN** 完成页不显示补齐与重启建议行（既有「恢复完成指引闭环」行为保持）

## MODIFIED Requirements

### Requirement: 向导流程体验与状态呈现
恢复向导 SHALL：步骤 1 标签为「选择备份来源」；关闭确认文案准确描述「校验结果与已列出备份包将丢弃、连接信息保留」；校验明细各项 MUST 按实际校验值渲染通过与失败图标（失败不得显示通过样式）且文案为中文、配色使用主题令牌兼容暗色模式；包列表 SHALL 提供「仅最新」过滤与「最新」标记（列表按时间戳倒序）；校验暂存有效期（expires_at）MUST 在校验完成后展示，剩余时间临近过期时给出警示；历史「恢复此包」预选命中时，包列表 SHALL 在容器挂载后自动滚动到选中行并居中展示；**历史直达路径（预选包名与来源位置已明确）列包成功且预选命中后，SHALL 自动发起该校验（沿用「本次校验自〈位置名〉」来源标注与既有校验流程），人工点击仅保留在执行步——减摩擦不减安全闸**。

#### Scenario: 步骤 1 标签与关闭确认
- **WHEN** 用户打开向导查看步骤条或在已填写状态点击关闭
- **THEN** 步骤 1 显示「选择备份来源」；关闭确认说明校验结果与包列表将丢弃、连接信息保留

#### Scenario: 校验明细按值渲染
- **WHEN** 某校验项失败
- **THEN** 该项显示失败图标与失败样式（非绿色通过态），各项文案为中文

#### Scenario: 包列表最新标记与过滤
- **WHEN** 用户查看包列表或开启「仅最新」过滤
- **THEN** 列表按时间戳倒序、每个来源的最新包有「最新」标记，过滤后每来源仅保留最新一条

#### Scenario: 暂存有效期展示与预警
- **WHEN** 校验完成进入确认步骤且暂存剩余时间不足 2 分钟
- **THEN** 界面显示「暂存有效期至〈时间〉」并出现临近过期警示，过期后执行被拒时引导重新校验

#### Scenario: 预选命中后自动滚动到选中行
- **WHEN** 列包成功且「恢复此包」预选包名命中列表
- **THEN** 待列表容器挂载（列包 loading 结束）后的下一拍，向导 SHALL 在列表容器内定位选中行并以平滑滚动将其滚至视口居中
- **AND** 长列表中选中行在视口外时 SHALL NOT 呈现「没有任何行被选中」的假象
- **AND** 预选包名未命中或未传入时 SHALL NOT 触发滚动

#### Scenario: 历史直达预选命中后自动发起校验
- **WHEN** 用户从备份历史点击「恢复此包」直达向导，列包成功且预选包名命中
- **THEN** 向导 SHALL 自动发起该包校验（校验中态、来源标注与手动发起完全一致），校验完成后停在步骤 2 等待用户确认进入执行；自动校验失败时按既有校验失败路径呈现，不静默
- **AND** 手动进入向导（非历史直达）SHALL NOT 自动发起校验，流程保持现状
