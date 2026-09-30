# sqlite-remote-backup — SQLite 定时快照打包与 SSH 异地推送

## ADDED Requirements

### Requirement: 备份调度触发
系统 SHALL 在备份配置启用时，以后台调度循环按配置间隔（分钟，默认 5，最小 1）自动触发备份；触发前 MUST 检查无进行中的备份或恢复任务（共用互斥，防重入）；数据库迁移运行中 MUST 跳过调度（避免快照迁移中间态）；db_config 注册表中不存在任何 SQLite 连接时 MUST 跳过调度并显示不适用；启用或保存配置后 MUST 在一个调度周期内（30 秒）触发首次备份。

#### Scenario: 到期自动触发
- **WHEN** 备份已启用且距上次成功备份达到配置间隔
- **THEN** 系统自动执行一次备份，历史记录触发来源为 scheduled

#### Scenario: 备份进行中防重入
- **WHEN** 上一次备份尚未完成且调度周期到期
- **THEN** 本次周期跳过，不产生并发备份

#### Scenario: 恢复进行中推迟备份
- **WHEN** 恢复向导流程进行中且调度周期到期
- **THEN** 本次周期跳过，恢复完成后下一周期恢复调度

#### Scenario: 迁移运行中跳过
- **WHEN** 数据库迁移任务运行中且调度周期到期
- **THEN** 本次周期跳过，不产生对迁移中间态库的快照

#### Scenario: 注册表中无 SQLite 连接
- **WHEN** db_config 注册的所有连接均为 PostgreSQL
- **THEN** 调度跳过备份，UI 显示「不适用（无已注册的 SQLite 数据库）」

#### Scenario: 启用后快速首备
- **WHEN** 用户保存并启用备份配置（此前从未成功备份）
- **THEN** 30 秒内触发首次备份

### Requirement: SQLite 库在线快照
系统 SHALL 对 db_config 注册的**每个 SQLite 连接库**执行 `VACUUM INTO` 生成一致快照，**与活动连接类型无关**（活动连接为 PostgreSQL 时注册的 SQLite 库照常备份）；快照 MUST 在运行中的 WAL 模式库上安全执行且不阻塞业务；**活动库文件缺失 MUST 使整次备份失败**；**非活动注册库文件缺失或不可读 MUST 跳过该库并在 meta.json 记入 skipped 清单**；未注册的库文件 MUST NOT 进入备份包。

#### Scenario: 多站点库全部快照
- **WHEN** db_config 注册了 panshi.db 与 nanchang/panshi.db 两个 SQLite 连接且备份触发
- **THEN** 两个库各自生成快照并进入包内 databases/ 段（按连接 id 命名）

#### Scenario: 活动库为 PostgreSQL 时站点库照常备份
- **WHEN** 活动连接为 PostgreSQL 且注册表中有 SQLite 站点库
- **THEN** 备份正常执行，覆盖全部注册的 SQLite 库

#### Scenario: 非活动库缺失跳过并记录
- **WHEN** 某非活动注册库的文件已被删除
- **THEN** 该库被跳过、meta.json 的 skipped 清单记录该连接，备份整体继续成功

#### Scenario: 活动库缺失整体失败
- **WHEN** 活动连接对应的库文件不存在
- **THEN** 本次备份终止并记录失败历史

#### Scenario: 未注册的垃圾库不打包
- **WHEN** data/ 目录存在 test.db、sample.db 等未在 db_config 注册的库文件
- **THEN** 这些文件不出现在备份包中

### Requirement: 备份包内容与环境一致性
备份包 SHALL 为 tar.gz，包含：meta.json、databases/（注册库快照，**按连接 id 平铺命名，meta 记录每个库的原路径**）、config/（db_config.json、features.yaml、clickhouse.yaml、.jwt_secret、**全部存在的 .env.\***）、ansible/（inventory/host、inventory/backups/、group_vars/）、data/（仅勾选开关项）；data/ 下 static/、task-scripts/、task-logs/ 三项 MUST 为配置开关且默认全部不勾选。meta.json SHALL 记录 app 版本标识（pyproject version，部署目录存在 .git 时附 commit hash，皆不可得记 unknown）、备份时间（UTC）、active 连接 id、每个文件的字节大小与 SHA256、各库原路径与 skipped 清单。

#### Scenario: A 类配置文件必含
- **WHEN** 备份执行
- **THEN** 包内包含 db_config.json、features.yaml、clickhouse.yaml，且 .jwt_secret 与全部已存在的 .env.* 一并打包

#### Scenario: 库原路径记录
- **WHEN** 某注册库位于 data/ 相对路径、另一注册库位于绝对路径
- **THEN** 两者均以连接 id 平铺进入 databases/，meta.json 分别记录其原路径供恢复落位

#### Scenario: B 类开关默认关闭
- **WHEN** 用户未修改打包开关配置即触发备份
- **THEN** 包内 data/ 段不含 static/、task-scripts/、task-logs/

#### Scenario: 勾选后随包
- **WHEN** 用户勾选 static 与 task-scripts 后触发备份
- **THEN** 包内 data/ 段包含 static/ 与 task-scripts/，不含 task-logs/

#### Scenario: 元数据记录版本与校验和
- **WHEN** 备份包生成
- **THEN** meta.json 记录 app 版本标识（尽力而为，不可得记 unknown）、active 连接 id、每个文件的字节大小与 SHA256、skipped 清单

### Requirement: SSH 推送与远端保留清理
系统 SHALL 通过 SSH 将备份包推送到配置的远端机器目录（先 `mkdir -p`，再以 `.part` 临时名上传，成功后原子改名）；并按保留份数清理远端最旧备份；密码认证 MUST 经 SSHPASS 环境变量传递且绝不进入命令行参数；密钥认证 MUST NOT 依赖 sshpass；日志与审计中的命令 MUST 脱敏密码；**远端侧命令中拼接的路径与文件名参数 MUST 经 `shlex.quote` 转义**；远端列表与清理 MUST 仅匹配白名单正则 `^panshi_backup_\d{8}_\d{6}\.tar\.gz$` 的文件。

#### Scenario: 密码认证推送
- **WHEN** 配置为密码认证且 sshpass 已安装
- **THEN** 远端目录自动创建，备份包上传并原子改名完成，命令行参数中不含密码明文

#### Scenario: 上传中断不留半截文件
- **WHEN** 上传过程中连接中断
- **THEN** 远端仅存在 `.part` 临时文件（不计入保留份数、不出现在备份列表），下次备份不受影响

#### Scenario: sshpass 缺失提示
- **WHEN** 配置为密码认证且 sshpass 未安装
- **THEN** 备份失败并给出包含安装指引的明确错误信息

#### Scenario: 超保留量清理最旧
- **WHEN** 远端已有份数达到 retain_count 且新备份上传成功
- **THEN** 系统删除远端最旧的超出份（仅限白名单文件名），保持份数不超过 retain_count

#### Scenario: 远端命令参数转义
- **WHEN** 远端目录配置含空格或特殊字符
- **THEN** 拼接进远端命令的路径经 shlex.quote 转义，命令按预期执行且无注入风险

### Requirement: 备份配置模型与安全存储
系统 SHALL 以单行配置表存储备份目标与策略（启用、主机、端口、用户、认证方式、密码、密钥路径、远端目录、间隔、保留份数、三个打包开关、最近状态）；配置保存 MUST 校验间隔 ≥ 1 分钟、保留份数 ≥ 1；密码 MUST 以 Fernet 加密落库且 API 响应 MUST NOT 回显明文；系统 SHALL 以历史表记录每次备份（时间、状态、包体积、耗时、错误信息、触发来源）。

#### Scenario: 密码加密落库与不回显
- **WHEN** 保存含密码的备份配置后查询配置
- **THEN** 库中存储为 Fernet 密文，API 响应不含密码明文

#### Scenario: 非法配置值被拒
- **WHEN** 保存间隔为 0 分钟或保留份数为 0 的配置
- **THEN** 返回校验错误，配置不落库

#### Scenario: 备份历史可查
- **WHEN** 任一次备份（成功或失败）完成
- **THEN** 历史表新增记录含状态、耗时、包体积与触发来源，UI 历史列表可见

### Requirement: 手动立即备份与审计
系统 SHALL 提供「立即备份」操作（触发来源记 manual）；立即备份 MUST NOT 要求启用开关，但 MUST 要求目标配置完整（允许只跑一次不开定时）；备份或恢复任务进行中时手动触发 MUST 被拒绝并提示；配置变更、手动备份 MUST 写操作审计。

#### Scenario: 未启用时立即备份
- **WHEN** 备份配置已填写完整但未勾选启用，用户点击「立即备份」
- **THEN** 立即执行一次备份，历史触发来源为 manual

#### Scenario: 配置不完整时明确报错
- **WHEN** 目标配置缺少主机或远端目录，用户点击「立即备份」
- **THEN** 返回明确的配置不完整错误，不执行备份

#### Scenario: 配置变更审计
- **WHEN** 用户保存备份配置或执行立即备份
- **THEN** 操作审计日志记录对应操作

### Requirement: 权限与鉴权
备份全部端点 MUST 挂鉴权并复用 `database_management` 权限键；新增端点 MUST 纳入 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES 采样。

#### Scenario: 未认证访问被拒
- **WHEN** 未携带认证信息访问备份任一端点
- **THEN** 返回 401，且该端点已列入安全守卫测试采样

#### Scenario: 无数据库管理权限被拒
- **WHEN** 已认证但无 database_management 权限的用户访问备份端点
- **THEN** 返回 403
