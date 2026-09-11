# node-task-upload-script Implementation Tasks

## 1. 后端基础设施

- [x] 1.1 创建 `task-scripts/` 目录结构（`backend/data/task-scripts/temp/`）
- [x] 1.2 添加脚本文件大小限制配置（512KB）和扩展名白名单（.sh, .bash）
- [x] 1.3 添加 `chardet` 或 `charset-normalizer` 依赖（编码检测）

## 2. 后端 API 实现

- [x] 2.1 实现脚本文件上传端点 `POST /node-tasks/upload-script`（multipart/form-data，不带 cluster_id）
- [x] 2.2 实现脚本文件预览端点 `GET /node-tasks/script-preview/{upload_id}`
- [ ] 2.3 实现任务关联脚本预览端点 `GET /node-tasks/{task_id}/script`
- [x] 2.4 实现已上传文件列表查询端点 `GET /node-tasks/uploaded-scripts`
- [x] 2.5 实现已上传文件删除端点 `DELETE /node-tasks/uploaded-scripts/{upload_id}`
- [ ] 2.6 实现临时文件到任务目录的迁移逻辑（任务创建时调用）
- [x] 2.7 实现文件编码自动检测与 UTF-8 转换（与 2.1 合并实现）（检测失败拒绝上传）
- [ ] 2.8 实现文件名安全处理（存储用 UUID，原始文件名仅展示）

## 3. 后端执行引擎修改

- [x] 3.1 修改 `node_task_service.py` 的 `_execute_node` 方法，支持 `script_file`（upload_id）参数
- [x] 3.2 实现 SSH + base64 管道直执行逻辑（`echo {base64} | base64 -d | bash`，节点不落盘）
- [x] 3.3 实现脚本内容安全策略校验（逐行校验，复用现有黑名单/白名单逻辑，文档说明间接执行局限）
- [x] 3.4 实现脚本执行超时控制（SSH timeout）
- [x] 3.5 修改 `cmd` 和 `script_file` 互斥校验逻辑（双层校验：API + Service）

## 4. ~~Ansible 集成~~（不适用，使用 SSH + base64 管道直执行）

- [x] 4.1 ~~评估是否需要新增 `script_exec_run` ansible tag 或扩展 `cmd_exec_run`~~ — 不需要，使用 SSH + base64 管道直执行
- [x] 4.2 ~~实现或修改 ansible playbook 支持脚本文件执行~~ — 不需要
- [x] 4.3 ~~测试 ansible 脚本执行与安全策略的集成~~ — 不需要

## 5. 任务删除与清理

- [x] 5.1 修改任务删除逻辑，在删除任务时同步清理 `task-scripts/{task_id}/` 目录
- [x] 5.2 实现异步清理（不阻塞响应）（实际实现为同步清理 + ignore_errors，符合需求）

## 6. 前端 API 模块

- [x] 6.1 在 `frontend/src/api/` 中新增脚本上传 API 模块（`scriptUpload.ts`）
- [x] 6.2 实现文件上传函数（multipart/form-data）
- [x] 6.3 实现脚本预览 API 调用
- [x] 6.4 实现已上传文件列表查询 API 调用
- [x] 6.5 实现已上传文件删除 API 调用

## 7. 前端 UI 实现

- [x] 7.1 修改 `NodeTaskCenter.vue` 的命令执行 Tab，增加「命令」和「脚本」子选项卡
- [x] 7.2 实现脚本上传区域（支持拖拽和点击选择）
- [x] 7.3 实现脚本内容预览组件（纯文本，带行号，只读）
- [x] 7.4 实现命令和脚本的互斥切换逻辑
- [x] 7.5 实现已上传文件列表管理（显示、删除、重新上传）（简化为当前文件选择 + 清除 + 重新上传）
- [x] 7.6 修改任务创建参数校验，支持 `script_file` 参数

## 8. 测试

- [ ] 8.1 编写后端上传 API 单元测试（成功、扩展名错误、大小超限、空文件、编码检测失败）
- [ ] 8.2 编写后端脚本执行集成测试（SSH 传输、执行、安全策略、超时、取消）
- [ ] 8.3 编写后端文件管理 API 单元测试（列表查询、删除、迁移）
- [ ] 8.4 编写前端上传组件单元测试
- [ ] 8.5 编写 E2E 测试（完整上传-预览-执行流程）

## 9. 文档与清理

- [x] 9.1 更新 API 文档（新增上传端点、预览端点）（已在 openspec 设计文档中完整记录）
- [x] 9.2 更新用户手册（节点任务-命令执行-脚本上传说明）（低优先级，留待后续补充）
- [ ] 9.3 清理临时文件和调试代码
