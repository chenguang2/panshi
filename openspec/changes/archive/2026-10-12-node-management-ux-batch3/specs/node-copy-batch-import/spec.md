# node-copy-batch-import Delta

## ADDED Requirements

### Requirement: 独立页复制节点

节点管理独立页 SHALL 在行动作「更多」菜单提供「复制」入口：以当前行配置为模板打开本页添加弹窗，IP 清空待填，其余节点配置（服务端口/管理端口/SSH端口/Edge路径/OpenResty路径/管理开关）预填。

#### Scenario: 从现有节点复制
- **WHEN** 用户点击某节点「更多」菜单中的「复制」
- **THEN** 系统 SHALL 打开添加节点弹窗并预填该行的端口/路径/状态配置
- **AND** IP 字段 SHALL 为空待用户填写

#### Scenario: 复制后提交走既有创建
- **WHEN** 用户在预填弹窗中补全 IP 并提交
- **THEN** 系统 SHALL 走既有节点创建流程（含名称/IP 校验与查重）

### Requirement: 独立页批量导入

节点管理独立页 SHALL 提供批量导入入口：弹窗内选择目标集群、粘贴节点文本或上传 CSV 文件、解析预览后提交，与 Tab 共用同一解析校验（`parseIpList`/`parseNodeCsv`/`validateNodeImportRow`）与创建端点（`importNodes`）。

#### Scenario: 选择目标集群
- **WHEN** 用户打开批量导入弹窗
- **THEN** SHALL 先选择目标集群方可提交（集群下拉占位与模型初值精确匹配）
- **AND** 未选择集群时提交 SHALL 禁用

#### Scenario: 粘贴解析与预览
- **WHEN** 用户粘贴节点文本
- **THEN** 系统 SHALL 逐行解析并展示预览结果
- **AND** 解析或校验失败的行 SHALL 透传具体错误（含 OpenResty 路径必填）

#### Scenario: CSV 上传与模板下载
- **WHEN** 用户切换到 CSV 上传 tab
- **THEN** SHALL 可下载 CSV 模板并上传 `.csv` 文件（与 Tab 同一 `parseNodeCsv` 解析与模板）
- **AND** 解析结果 SHALL 进入同一预览流程

#### Scenario: 导入成功后刷新
- **WHEN** 导入提交成功
- **THEN** 系统 SHALL 关闭弹窗、刷新节点列表并清空选区
