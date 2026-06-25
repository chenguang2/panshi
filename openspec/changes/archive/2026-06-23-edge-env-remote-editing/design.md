## Context

Edge 网关的核心配置保存在每台节点的 `edge.env` 文件中（YAML 格式），包含 HTTP/Stream 监听端口、插件开关、日志配置等。当前只能 SSH 到服务器手工修改后执行 `bin/edge init` 生效。

磐石 Admin 已具备 ansible-runner 基础设施（`backend/ansible/`），用于节点启停等运维操作。SSH 通道已就绪，无需额外配置凭据。每个 Node 模型记录 `ip`、`edge_path`（即 edge 服务目录）和 `port`（管理端口）。

后端已有 `AnsibleRunnerService` 服务（`backend/app/services/ansible_service.py`），封装了 ansible-runner 调用、SSE 实时日志推送、并发控制。现有的 `edge_init_env` playbook 和 tag 可以直接复用。

前端目前是全局列表页模式（`/routes?cluster_id=1`、`/upstreams?cluster_id=1`），侧边栏导航管理，集群详情通过 Modal 展示。

## Goals / Non-Goals

**Goals:**
- 新增全局页面「edge.env 配置」，入口在侧边栏"核心功能"区，与上游管理、路由管理同级
- 用户通过 YAML 编辑器在线编辑完整的 edge.env，一键部署到集群的所有节点
- 部署串联执行现有 ansible-runner (`edge_init_env` tag)，完成备份 → 写入 → init → reload
- 部署前后自动生成 diff 对比，展示变更内容
- 每次部署生成版本记录，支持查看历史版本和变更 diff

**Non-Goals:**
- 不提供图形化的表单编辑（保留 YAML 编辑器，因为 edge.env 字段太多且不断变化）
- 不做 YAML 字段级别的权限控制（全部或不允许编辑）
- 不支持单个节点的差异化部署（所有节点相同 edge.env，`node.env` 的差异化管理暂不纳入）
- 不修改 Edge 网关本身的 API（短期内不会加）

## Decisions

### Decision 1: 全局页面而非弹窗

**选择**：新增全局页面 `/edge-env?cluster_id=1`，侧边栏加导航入口。

**理由**：
- 现有路由管理、上游管理等都是全局页面 + cluster_id 筛选模式，保持一致
- edge.env 内容较长，全局页面可视面积远大于弹窗（现有弹窗 `max-width: 700px`，YAML 编辑器需要足够宽度避免横向滚动）
- diff 对比、版本历史、部署日志等附属信息需要额外空间，弹窗多层嵌套交互重
- 编辑状态在页面刷新后也可恢复（基于版本历史）

### Decision 2: Monaco Editor 编辑器

**选择**：安装 `monaco-editor` + `@guolao/vue-monaco-editor` 作为 YAML 编辑器。

**理由**：
- YAML 语法高亮、语法校验、折叠、自动缩进完整支持
- edge.env 行数较多（60-200行），Monaco 大文件编辑体验远好于 textarea
- 通过异步加载（dynamic import）控制打包体积增量

### Decision 3: 复用现有 edge_init_env Ansible tag + content 参数

**选择**：修改现有的 `backend/ansible/roles/edge/tasks/edge_init_env.yml`，增加 `content` 参数支持。原有 `src` 路径保持不变。

```yaml
- name: copy env file via content
  ansible.builtin.copy:
    content: "{{ env_content | default('') }}"
    dest: "{{ destpath.split(',')[item|int] }}/edge.env"
  when: env_content is defined and env_content | length > 0
  tags:
    - edge_init_env
```

**理由**：
- 已有 `edge_init_env` tag，`AnsibleRunnerService.ALLOWED_TAGS` 中已有 `edge_init_env`
- 直接用 `ansible.builtin.copy` 的 `content` 参数，避免后端写临时文件再清理
- 与现有 `src` 方式兼容，不破坏已有的部署流程

### Decision 4: 串行部署 + SSE 实时日志

**选择**：串行逐个节点部署，每个节点通过 SSE 推送完整执行日志。

**理由**：
- `AnsibleRunnerService.run_playbook()` 每次只能针对一个 IP 执行
- 串行实现简单，节点数通常不多（< 10），总耗时可接受
- SSE 端点复用 `_run_ansible_stream()` 的已有实现
- 日志中标记节点 IP 和步骤（backup/write/init/reload），前端按节点分组展示
- 每个节点完成后立即更新版本记录中的 `node_results`

### Decision 5: 用户选择参考节点

**选择**：用户打开页面时，先展示集群的活跃节点列表，由用户选择从哪个节点读取 edge.env 作为初始内容。

**理由**：
- 实际环境中不同节点的 edge.env 可能有细微差异（历史原因、手动修改过），不能假设它们完全一致
- 用户可能有倾向——某个节点是他们信任的"标准配置"源
- 选择节点而非自动选择，避免"选错了节点读到错误配置然后覆盖了其他节点"的问题
- 默认选中第一个活跃节点，用户可以快速切换

**流程**：
1. 页面加载时调用 `GET /clusters/{id}/nodes?status=1` 获取活跃节点列表
2. 默认选中第一个活跃节点，自动读取该节点的 edge.env
3. 用户可通过下拉框切换到其他节点重新读取
4. 编辑区和节点选择器联动——切换节点时提示"当前编辑内容将丢弃，是否继续？"

### Decision 6: 版本管理

**选择**：新增 `EdgeEnvVersion` 模型，内容字段存储完整 edge.env 文本。

**schema**：
- `id` (int, PK)
- `cluster_id` (FK → ps_cluster)
- `content` (text) — 部署的内容
- `previous_content` (text) — 上次部署的内容（用于 diff）
- `content_hash` (str) — 用于去重和乐观锁
- `node_results` (JSON) — 每个节点的部署结果 `[{ip, status, steps: [{step, status, message}]}]`
- `status` (str) — `all_success | partial | all_failed`
- `deployed_by` (int, FK → sys_user)
- `deployed_at` (datetime)

## Risks / Trade-offs

- **[风险] YAML 格式错误导致 Edge 无法启动** → 部署前在后端做 YAML 语法校验；保留远端备份 `edge.env.bak.{timestamp}`，部署失败可一键回滚
- **[风险] 多节点分发一致性** → 如果一个节点失败其他成功，记录每个节点的独立状态。整体状态标记为"部分成功"
- **[风险] edge.env 中敏感信息** → edge.env 可能包含 API Key、密钥等，通过 HTTPS 传输，后端加密存储版本历史，前端编辑器防 XSS
- **[风险] 编辑中的并发冲突** → 当前不做乐观锁，最后保存者覆盖。如果未来多人协作需求强烈，可基于 content_hash 加冲突检测
- **[风险] ansible-runner 长时间卡住** → 设置合理的超时（如 60s），超时后标记节点部署失败
