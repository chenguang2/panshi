## Context

节点管理页面之前使用简单的 message 提示操作结果，缺少执行过程的详细展示。状态列仅依赖数据库中的 `node.status` 字段（0/1），无法反映 Nginx 实际运行状态。Edge 版本号需手动 SSH 登录节点查看。

技术栈：FastAPI + ansible-runner（后端），Vue 3 + Ant Design Vue（前端）。节点操作通过 ansible-runner SSH 到目标节点执行 shell 脚本。

## Goals / Non-Goals

**Goals:**
- 启动/停止/状态查询操作弹出进度弹窗，展示完整命令和输出
- 节点表格增加 Edge 版本列
- 状态列基于 Nginx 进程实际状态显示"健康"或"离线"
- 修复 ansible-runner TextIOWrapper 序列化错误
- 修复统计信息解析失败问题

**Non-Goals:**
- 不修改 ansible playbook 本身的工作方式
- 不引入 WebSocket/SSE 实时推送（保持请求-响应模式）

## Decisions

### 1. 进度弹窗复用 executePublish 模式
- **方案**：复用 `useClusterUtils.ts` 中已有的 `buildDeleteProgressContent` 和 `Modal.info` 模式
- **理由**：路由发布弹窗已经实现了完整的"进度条 + 日志区"交互，代码成熟且用户熟悉
- **替代考虑**：重新实现弹窗组件 → 成本高且不一致

### 2. Nginx 状态解析在服务端完成
- **方案**：后端 `build_status_detail` 中解析 stdout，提取 `nginx_running` 布尔值存入 `status_detail`
- **理由**：前端无需理解 ansible 输出格式；`status_detail` 随节点列表 API 返回，无需额外请求
- **替代考虑**：前端解析 stdout → 逻辑重复，每个前端客户端都要重复解析

### 3. status_detail 跨标签保留 nginx 信息
- **方案**：`_update_status_detail` 中如果新数据不含 `nginx` 字段但旧数据有，则保留
- **理由**：`edge_statistic` 标签不产生 nginx 状态，但不应清除之前 `nginx_cmd_run` 存入的信息
- **替代考虑**：每个标签都跑 nginx 解析 → 在 cron_check.sh 中已有 nginx 检测逻辑，所以 `edge_statistic` 也会解析

### 4. playbook stdout 解析策略
- **方案**：先 `_strip_ansi` 去色，再逐行 `.strip().strip('",').strip()` 清洗后匹配关键词
- **理由**：ansible-runner 返回的是完整 playbook 输出（含 ANSI 码、JSON debug 格式化），不是原始脚本输出
- **替代考虑**：改用 ansible-runner events 结构化数据 → 复杂度高，需要读取 artifact 目录

## Risks / Trade-offs

- **playbook stdout 格式依赖**：解析逻辑依赖 ansible debug 模块的输出格式。如果 playbook 的 debug 输出方式改变，解析可能失败 → 测试覆盖关键路径
- **cron_check.sh 中的 Edge version**：只有 Nginx 运行时才执行 curl 获取版本。如果 Nginx 停止，"Edge版本"列显示 "-"
- **ansible.utils collection 依赖**：playbook 使用了 `ansible.utils.index_of` lookup，需要额外安装 collection → 已加入部署文档
- **Python 版本兼容**：系统 Python 3.14 与 pydantic-core 不兼容，需要固定 Python 3.11 → 启动命令需加 `UV_PYTHON=3.11`
