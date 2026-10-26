# cluster-backup-restore-fix 变更规格

## MODIFIED Requirements

### Requirement: 单一模式导入重建（新 ID + 映射重建外键）

系统 SHALL 仅支持一种导入模式：创建新集群，忽略备份中的平台自增 ID（由数据库分配），并按名称（节点按 ip+service_port）映射重建外键。导入 SHALL 对备份中的 ISO 时间字符串按目标模型列类型矫正（DateTime/Date 列解析回原生类型），MUST NOT 将字符串原样绑定时间列；导入 MUST NOT 迁移源集群的运行态发布状态（`last_publish_ok`/`last_publish_detail`/`last_published_at`）；集群业务属性（含 `region_code` 区域绑定）SHALL 随导入保留；导入失败 SHALL 回滚全部数据库变更且不留任何已落盘文件（失败即无副作用）。

#### Scenario: 导入生成新集群
- **WHEN** 管理员上传备份并指定新集群名
- **THEN** 系统创建新集群，所有行获得数据库新分配的 ID，`cluster_id` 指向新集群

#### Scenario: 外键映射重建
- **WHEN** 导入执行
- **THEN** 路由的 `upstream_id`、静态资源的 `route_id`、证书的 `ca_cert_id`、四层代理的 `ref_node_id` 均通过插入时捕获的旧 ID → 新 ID 映射指向新分配的 ID；`route.plugin_config_ids` 中引用的插件组 `edge_uuid` 保持原值且引用有效

#### Scenario: 节点运行态重置
- **WHEN** 导入包含节点数据
- **THEN** 所有节点 `status` 重置为离线，不继承备份中的在线/离线状态

#### Scenario: 字段修正
- **WHEN** 导入完成
- **THEN** `creator_id` 为当前操作者，各实体 `current_version` 为空，集群状态为启用

#### Scenario: 目标集群名冲突时整体失败
- **WHEN** 指定的新集群名已存在于系统中
- **THEN** 导入整体回滚，返回 400 并说明冲突项，不产生部分数据

#### Scenario: 备份内重名实体不阻断导入
- **WHEN** 备份数据中存在同名实体（源集群历史数据常见）
- **THEN** 导入照常完成并忠实保留重名（外键按 ID 映射，与名称无关）

#### Scenario: 含已发布静态资源的备份可完整导入（回归 P0）
- **GIVEN** 源集群存在至少一个 `last_published_at` 非空的静态资源（备份中为 ISO 字符串）
- **WHEN** 导入该备份
- **THEN** 导入 SHALL 成功创建新集群，不再出现 `SQLite DateTime type only accepts Python datetime` 错误
- **AND** 时间类列的值 SHALL 为原生 datetime/date 类型或 NULL，MUST NOT 为字符串

#### Scenario: 运行态发布状态不迁移
- **WHEN** 备份中静态资源携带 `last_publish_ok=true`、`last_published_at`、`last_publish_detail`
- **THEN** 导入后的对应行三列 SHALL 全为 NULL/空（新集群未发布，不继承源集群发布痕迹）

#### Scenario: 区域绑定保留
- **WHEN** 备份源集群 `region_code` 非空
- **THEN** 导入出的新集群 `region_code` SHALL 与源值一致
- **AND** 新集群仍处于未发布状态（`status=1`），区域绑定变化后的网关白名单下发引导照常适用

#### Scenario: 失败即无副作用
- **WHEN** 导入在中途失败（校验错误、数据错误或写库异常）导致事务回滚
- **THEN** 磁盘上 SHALL NOT 残留本次导入写入的静态资源 zip 文件（含部分写入）
- **AND** 数据库 SHALL 无任何新建行

#### Scenario: 时间字段通用矫正（按类修）
- **WHEN** 备份条目包含目标模型定义为 DateTime/Date 列的字段且值为字符串
- **THEN** 导入 SHALL 按 ISO 格式解析为原生类型后写入；解析失败或空值 SHALL 置 None 并继续（不中断导入）
- **AND** 该矫正 SHALL 基于模型元数据通用实现，未来新增时间列无需修改导入逻辑即被覆盖

## ADDED Requirements

### Requirement: 导入错误可读

导入失败时系统 SHALL 返回结构化中文错误（`detail.errors` 数组），说明失败原因与建议动作；MUST NOT 向前端透出未加工的 500「服务器内部错误」。

#### Scenario: 数据类失败返回可读原因
- **WHEN** 导入因数据问题失败（如时间格式非法且不可回退、引用损坏）
- **THEN** 响应 SHALL 为 400，`detail.errors` 至少包含一条中文原因，定位到出错的资源类型/名称

#### Scenario: 前端呈现
- **WHEN** 导入失败
- **THEN** 弹窗错误区 SHALL 逐条展示原因（现有 `errorLines` 渲染路径，无前端结构改动）
