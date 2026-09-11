# Tasks: 节点任务 — 分发文件

## Group 1: 后端基础设施

- [ ] 1.1 新增文件分发上传配置：文件大小限制可调下拉框（默认 10MB），无扩展名白名单
- [ ] 1.2 文件分发上传端点：原样字节存储，不做编码检测/转换（独立于脚本上传端点）

## Group 2: 后端 API

- [ ] 2.1 新增文件分发上传端点 `POST /node-tasks/upload-distribute-file`
- [ ] 2.2 修改文件预览端点：二进制文件返回 `preview_available: false`

## Group 3: 后端执行引擎

- [ ] 3.1 在 `_execute_node` 中新增 `distribute_file` 任务类型分支（仅创建 node_task_record，不执行）
- [ ] 3.2 新增任务级执行路径：一次性调用 `run_playbook`（tag = `edge_master_copy_to_slaves`），传入所有节点 IP
- [ ] 3.3 任务创建时将文件从 `task-scripts/temp/` 迁移到 `task-scripts/{task_id}/`
- [ ] 3.4 解析 ansible 输出，根据每个节点的 exit code 更新对应的 `node_task_record`
- [ ] 3.5 默认 timeout = 300s
- [ ] 3.6 destpath 后端自动补尾 `/`

## Group 4: 前端 API

- [ ] 4.1 新增文件分发上传函数（独立于脚本上传）
- [ ] 4.2 复用预览函数：二进制文件处理

## Group 5: 前端 UI

- [ ] 5.1 NodeTaskCenter 新增「分发文件」操作类型选项
- [ ] 5.2 文件上传区域（独立于脚本上传，支持任意文件类型）
- [ ] 5.3 文件大小限制可调下拉框（默认 10MB）
- [ ] 5.4 目标目录路径输入框（必填，提示"请输入目标目录路径"）
- [ ] 5.5 二进制文件预览提示 / 文本文件预览
- [ ] 5.6 提交时组装 `distribute_file` 类型的 task_type + params
- [ ] 5.7 补齐已上传文件列表/删除 UI（脚本上传和分发文件共享，修复脚本上传的遗留缺失）

## Group 6: 测试

- [ ] 6.1 后端上传 API 测试（任意文件类型、原样字节存储验证）
- [ ] 6.2 后端分发执行测试（mock ansible，验证多节点统一执行 + 结果解析）
- [ ] 6.3 前端组件测试（文件上传、目标路径、提交参数）
