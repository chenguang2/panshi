# node-task-center Delta Spec

## MODIFIED Requirements

### Requirement: 覆盖的操作类型

#### Scenario: 文件分发操作任务化

- **WHEN** 用户创建 task_type 为 `distribute_file` 的任务，params 含 `srcpath`（服务端文件路径，上传后迁移得到）、`destpath`（目标节点上的目标目录路径，后端自动补尾 `/`）、可选 `timeout`（超时秒数，默认 300s）
- **THEN** 系统 SHALL 为每个选中节点创建 `node_task_record`
- **AND** 任务级 SHALL 一次性调用 `run_playbook`（tag = `edge_master_copy_to_slaves`），传入所有节点 IP（逗号分隔）
- **AND** Ansible `copy` 模块 SHALL 将控制节点上的文件拷贝到目标节点的 `destpath` 目录下（保留原始文件名）
- **AND** `ips`、`srcpath`、`destpath` SHALL 以逗号分隔传参，与 `master_copy_to_slaves.yml` 格式一致
- **AND** 文件分发 SHALL 支持任意文件类型（不限文本/二进制），文件原样字节传输，不做编码转换
- **AND** 目标目录不存在时 SHALL 自动创建
- **AND** destpath SHALL 始终为目录路径，后端自动补尾 `/`
- **WHEN** 分发超时
- **THEN** 系统 SHALL 终止 ansible 执行，标记所有节点子任务为 failed
- **AND** stdout_tail SHALL 包含超时错误信息
- **WHEN** 单节点分发失败
- **THEN** 该节点子任务状态 SHALL 标记为 failed
- **AND** 其他节点子任务不受影响
- **WHEN** 分发成功（exit code 0）
- **THEN** 节点子任务状态 SHALL 标记为 success

#### Scenario: 创建任务窗口分发文件

- **WHEN** 用户在节点任务创建窗口选择「分发文件」类型
- **THEN** 窗口 SHALL 显示文件上传区域（支持拖拽和点击选择）
- **AND** 上传成功后 SHALL 显示文件名、大小、目标目录路径输入框
- **AND** 目标目录路径 SHALL 为必填项，提示"请输入目标目录路径，文件将以原始文件名存入"
- **AND** 上传的文件类型 SHALL 不限
- **AND** 文件大小限制 SHALL 为可调下拉框，默认 10MB
- **AND** 二进制文件 SHALL 显示「二进制文件，无法预览」提示
- **AND** 文本文件 SHALL 显示预览内容（可编辑）
- **AND** 用户 SHALL 可清除已上传文件并重新上传
