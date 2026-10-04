## MODIFIED Requirements

### Requirement: 落位与激活
校验与确认通过后，系统 SHALL 按以下顺序落位：**先落 key 文件**（.jwt_secret、.env.*，权限 600），再落库文件与配置/清单文件；恢复的数据库 SHALL 落为 `<原名>.restored-<时间戳>`（按 meta.json 记录的各库原路径对应落位），随后改 db_config 的 active 指针指向恢复的活动库并经**现有活动库切换机制（引擎重载）激活**——MUST NOT 热替换正在使用的数据库文件；切换 MUST 继承 database-management 既有需求「存在运行中任务时禁止切换」的语义；被替换的旧库文件 MUST 保留为 `.pre-restore-<时间戳>` 供手工回退；每次恢复前 MUST 清理历史遗留的 `.restored-*` 残留；恢复完成后界面 MUST 提示成功并工作在恢复后的数据上；**恢复的备份配置含来源标识时，完成提示 MUST 附带来源标识检查提醒（显示继承的标识值；共享目录双跑场景需人工修改，避免两机同标识互删）**；**恢复的备份配置含备份位置时，完成提示 MUST 附带位置可达性核对提醒（位置随包落位，新机未必可达）**。**引擎重载后系统 SHALL 对恢复库执行与启动期相同的 schema 补齐（create_all + run_migrations）：跨版本恢复（旧 schema 库）即时补齐缺失表/列，不依赖用户重启；补齐 MUST NOT 因失败而使恢复失败（库已激活），失败时结果 SHALL 携带错误并强化重启建议（重启后 init_db 重试同一路径）；恢复结果 SHALL 报告补齐计数与密钥变更状态（包内 .jwt_secret/.env.* 与恢复前不一致即视为变更），密钥变更或补齐失败时 SHALL 给出重启建议。**

#### Scenario: 恢复激活
- **WHEN** 校验与确认通过的包执行恢复
- **THEN** 恢复的库以 .restored 后缀落盘、active 指向它并经引擎重载激活，后续查询工作在恢复后的数据上，全程不出现对活动数据库文件的热替换

#### Scenario: 运行中任务阻止恢复
- **WHEN** 存在运行中任务（迁移等）时执行恢复落位
- **THEN** 恢复被阻止并提示，与数据库切换语义一致

#### Scenario: 旧库可回退
- **WHEN** 恢复完成
- **THEN** 原活动库文件保留为 .pre-restore-<时间戳>，可按文档手工回退

#### Scenario: 密钥文件先落且权限收紧
- **WHEN** 落位 .jwt_secret 与 .env.* 文件
- **THEN** 它们先于库文件落位、权限为 600，引擎重载后解密与连接使用包内自洽状态

#### Scenario: 清理历史 restored 残留
- **WHEN** 第二次执行恢复
- **THEN** 上次恢复产生的 .restored-* 残留被先行清理，不累积

#### Scenario: 恢复完成提示来源标识
- **WHEN** 恢复的备份包配置含来源标识且恢复成功完成
- **THEN** 完成提示显示继承的来源标识值，并提醒共享目录双跑场景需检查修改

#### Scenario: 恢复完成提示位置核对
- **WHEN** 恢复的备份配置含备份位置且恢复成功完成
- **THEN** 完成提示提醒核对已落位备份位置的可达性

#### Scenario: 跨版本恢复自动补齐 schema
- **WHEN** 恢复包内 sqlite 库为旧 schema（缺新版本新增的表或列）且恢复激活成功
- **THEN** 引擎重载后系统自动执行 create_all + run_migrations 补齐缺失表/列，恢复结果报告 `schema_reconciled=true` 与补齐计数，无需用户重启即可正常查询新表/新列

#### Scenario: 补齐失败不阻断恢复
- **WHEN** schema 补齐执行抛错
- **THEN** 恢复仍报成功（库已激活），结果载荷携带 `schema_migration_error` 且 `restart_recommended=true`（重启后启动期迁移重试同一路径）

#### Scenario: 密钥变更检测与重启建议
- **WHEN** 包内 .jwt_secret 或 .env.* 与恢复前内容不一致
- **THEN** 恢复结果报告 `key_changed=true` 并给出 `restart_recommended=true`（重启后 JWT/Fernet 完全切换到包内自洽状态；重启前现有会话仍以旧钥有效）

### Requirement: 恢复完成指引闭环
恢复成功提示 SHALL 包含：可复制的后端重启命令（区分开发与生产环境命令）、「暂存有效期至」时间（按本地时区格式化）、唯一主按钮「已完成，刷新页面」；提示 MUST 保留既有的来源标识核对与位置可达性核对提醒；不再出现「建议重启后端服务」却仅提供页面刷新按钮的断裂指引。恢复结果报告 schema 补齐时，提示 SHALL 展示补齐计数信息行（「已自动补齐 N 张表 / M 列」）；结果建议重启时，提示 SHALL 高亮重启建议行。

#### Scenario: 完成框含重启命令与有效期
- **WHEN** 恢复成功完成
- **THEN** 完成提示展示可复制重启命令、暂存有效期时间与来源标识/位置核对提醒，主按钮为「已完成，刷新页面」

#### Scenario: 补齐计数与重启建议条件化展示
- **WHEN** 恢复结果含 `schema_reconciled=true` 且补齐计数大于 0，或 `restart_recommended=true`
- **THEN** 完成提示分别展示「已自动补齐 N 张表 / M 列」信息行、高亮重启建议行（说明密钥已随包更新，重启后完全生效）；两者均不满足时不显示额外行
