## 1. 数据模型

- [x] 1.1 在 `backend/app/models/cluster.py` 中新增 `EdgeEnvVersion` 模型（表 `ps_edge_env_version`），字段：id, cluster_id(FK), content(text), previous_content(text), content_hash(str), node_results(JSON), status(str), deployed_by(FK→sys_user), deployed_at(datetime)
- [x] 1.2 在 `backend/app/schemas/edge_env.py` 中定义 Pydantic schema：EdgeEnvReadResponse、EdgeEnvDeployRequest、EdgeEnvDeployResponse、EdgeEnvVersionResponse、EdgeEnvVersionListItem
- [x] 1.3 执行数据库 migration

## 2. Ansible playbook 改造

- [x] 2.1 修改 `backend/ansible/roles/edge/tasks/edge_init_env.yml`，新增 `content` 参数支持的 task（`ansible.builtin.copy content="{{ env_content }}"`），与原有 `src` 方式共存
- [x] 2.2 确认 `edge_init_env` tag 已在 `AnsibleRunnerService.ALLOWED_TAGS` 中，无需新增
- [x] 2.3 playbook 增加备份步骤：发布前将远端 `edge.env` 备份为 `edge.env.bak.{timestamp}`
- [ ] 2.4 验证改造后的 playbook 在开发环境可正常执行（手动测试）

## 3. 后端 API

- [x] 3.1 在 `backend/app/api/v1/` 中新增 `cluster_edge_env.py`，实现以下端点：
  - `GET /clusters/{clusterId}/edge-env?node_id={nodeId}` — 通过 ansible-runner 从指定节点读取 edge.env
  - `POST /clusters/{clusterId}/edge-env/deploy` — 部署 edge.env 到所有活跃节点（串行）
  - `GET /clusters/{clusterId}/edge-env/versions` — 分页获取版本历史列表
  - `GET /clusters/{clusterId}/edge-env/versions/{versionId}` — 获取单个版本的详细内容
  - `GET /clusters/{clusterId}/edge-env/deploy/logs?task_id={taskId}` — SSE 实时日志推送（复用 `_run_ansible_stream`）
- [x] 3.2 在 `backend/app/main.py` 中注册 `cluster_edge_env_router`
- [x] 3.3 实现后端部署核心逻辑：
  - 按 `?status=1` 筛选活跃节点
  - 对每个节点串行调用 ansible-runner（`edge_init_env` tag），传入 `env_content`、`destpath`（node.edge_path）
  - 收集每个节点的执行结果，写入 `EdgeEnvVersion.node_results`
- [x] 3.4 后端 YAML 语法校验工具函数
- [x] 3.5 后端新增 SSE 流式读取端点 `GET /clusters/{clusterId}/edge-env/read-stream?node_id={nodeId}`
- [x] 3.6 deploy 接口支持 `node_ids` 参数，只发布到指定节点（空=全部活跃）
- [x] 3.7 后端增加 edge.env 字段验证（deploy / deploy.http / deploy.http.edge.listen / deploy.http.admin.listen 必填）

## 4. 前端 API 客户端

- [x] 4.1 在 `frontend/src/api/edgeEnv.ts` 中封装 API 调用：fetchEnv、deployEnv、getVersions、getVersionDetail、getDeployLogStream(SSE)
- [x] 4.2 新增 `readEdgeEnvStream(clusterId, nodeId)` SSE 流式读取接口

## 5. 前端页面

- [x] 5.1 安装依赖：`monaco-editor` + `@guolao/vue-monaco-editor`
- [x] 5.2 在 `frontend/src/views/EdgeEnv.vue` 中实现主页面，包含：
  - 顶部：集群选择器 + 当前集群名称 + 操作按钮行（刷新、版本历史、部署）
  - 中部：Monaco Editor YAML 编辑器（异步加载）
  - 部署确认弹窗：含 diff 对比 + 确认按钮
  - 部署进度弹窗：SSE 日志按节点卡片分组展示
  - 版本历史弹窗：列表 + 详情 + diff
- [x] 5.3 改造 EdgeEnv.vue：
  - 顶部改为"获取配置模板" + "发布"按钮
  - "获取配置模板"改用 SSE 流式 + 弹窗显示过程
  - "发布"弹窗增加节点多选（离线节点置灰）
  - 编辑器空内容时点"发布"提示"请先获取配置模板或输入内容"
  - 发布前前端字段验证（deploy / deploy.http.edge.listen / deploy.http.admin.listen 必填）
- [x] 5.4 在 `frontend/src/router/index.ts` 中注册 `/edge-env` 路由
- [x] 5.5 在 `frontend/src/components/AppSidebar.vue` 核心功能区添加「edge.env 配置」导航项

## 6. 集成与测试

- [ ] 6.1 端到端验证：获取模板 → 编辑 → 字段验证 → 发布（选节点）的完整流程（需手动，依赖实际节点）
- [x] 6.2 验证空内容发布被拦截（`test_empty_content_returns_422`）
- [x] 6.3 验证必填字段缺失时被拦截（6 个单元测试全部通过）
- [ ] 6.4 验证所有节点不可达时的错误处理（需手动）
- [ ] 6.5 验证部分节点发布失败的"部分成功"状态（需手动）
- [ ] 6.6 验证 SSE 实时日志推送和进度展示（`test_read_stream_returns_sse_events` 通过，真实展示需手动验证）
