## Why

集群管理节点页面中，启动/停止/状态查询等操作缺少执行过程的可视化反馈，且 Edge 版本号、Nginx 运行状态等关键信息无法直观展示。运维人员排查问题时需要手动登录节点查看，效率低下。

## What Changes

- **节点启动/停止增加进度弹窗**：参考路由发布的弹窗模式，显示执行命令、返回码、stdout/stderr、关键信息摘录
- **节点状态查询改用 edge_statistic**：原本只读数据库，改为远程执行 edge_statistic，获取 CPU/内存/版本等实时数据
- **Edge版本列**：节点表格新增"Edge版本"列（IP右侧），显示状态查询返回的版本号
- **Nginx状态智能判断**：解析命令输出中的 Nginx 进程状态（running/not_exist/stopped），替代之前仅靠返回码判断的方式
- **状态列文案调整**：将原有"离线"文案保留，根据 Nginx 实际运行状态显示"健康"或"离线"
- **修复 TextIOWrapper 序列化错误**：ansible-runner 返回的 stdout/stderr 可能是文件句柄，需要转为字符串后再 JSON 序列化
- **修复 _parse_statistic_stdout 解析失败**：playbook stdout 含 ANSI 码和 JSON 格式化，解析统计信息前需清洗
- **操作后自动刷新节点列表**：启动/停止/状态查询完成后自动重新加载表格数据

## Capabilities

### New Capabilities
- `node-action-progress-dialog`: 节点操作进度弹窗，展示命令和结果的执行记录
- `node-edge-version-column`: 节点表格展示 Edge 版本号
- `nginx-status-detection`: 通过解析命令输出来判断 Nginx 运行状态

### Modified Capabilities
- `node-management`: 节点管理功能增强，状态列改为基于 Nginx 实际运行状态的动态判断

## Impact

- `backend/app/services/ansible_service.py`: `run_playbook` 返回 command 字段；`build_status_detail` 解析 nginx 状态和统计信息；`_parse_statistic_stdout` 重写以处理 playbook stdout 格式
- `backend/app/api/v1/cluster_nodes.py`: 所有节点操作端点返回 stdout/stderr/command；`_update_status_detail` 保留 nginx 状态跨标签不丢失
- `frontend/src/composables/useClusterNodes.ts`: 节点操作函数改用进度弹窗；新增 `executeNodeAction` 共享函数
- `frontend/src/views/clusters/ClusterNodes.vue`: 新增 Edge版本列渲染和 nginx 状态判断函数
- `frontend/src/types/index.ts`: Node 接口新增 status_detail 字段
- `backend/pyproject.toml`: 新增依赖 ansible-core
- 环境依赖：Python 3.11、ansible.utils collection
