## 1. Ansible — 关联新OpenResty

- [x] 1.1 修改 `backend/ansible/roles/edge/tasks/upgrade_openresty.yml`，用 `edge_target` 动态取值替代硬编码 `uap-edge`，`manager upgrade` 使用 `$dir_name` 而非拼写死的目录名

## 2. Ansible — 小版本管理

- [x] 2.1 新建 `backend/ansible/roles/edge/tasks/edge_pack_list.yml`，在 `{{ edge_target }}` 目录下执行 `bin/edge pack-list` 并注册输出
- [x] 2.2 新建 `backend/ansible/roles/edge/tasks/edge_pack_add.yml`，包含 copy 文件 + `manager pack-add` 两步（参照 `install_openresty.yml`）
- [x] 2.3 新建 `backend/ansible/roles/edge/tasks/edge_pack_rebase.yml`，执行 `pack-rebase` + `init` + `reload` 三步
- [x] 2.4 在 `main.yml` 中新增 3 个 `import_tasks`

## 3. Backend — 关联新OpenResty

- [x] 3.1 在 `cluster_install.py` 中新增 `POST /clusters/{cluster_id}/nodes/{node_id}/associate-new-openresty` stream endpoint，tag 为 `upgrade_openresty`，extravars 包含 `prefix` 和 `edge_target`

## 4. Backend — ALLOWED_TAGS

- [x] 4.1 在 `ansible_service.py` 的 `ALLOWED_TAGS` 中新增 `edge_pack_list`

## 5. Backend — 小版本管理 API

- [x] 5.1 新增 `GET /clusters/{cluster_id}/nodes/{node_id}/edge-pack-list` 非流式 endpoint，使用 `generic_run(tag="edge_pack_list")`，传入 `edge_target`，解析 `[*]` 前缀标记当前版本
- [x] 5.2 新增 `GET /clusters/{cluster_id}/nodes/edge-pack-files` 文件列表接口，过滤 `edge-pack-*.tgz` / `edge-pack-*.tar.gz`
- [x] 5.3 新增 `POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-add` stream endpoint，自动推导 srcpath/destpath
- [x] 5.4 新增 `POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-rebase` stream endpoint

## 6. Frontend — 菜单项和对话框

- [x] 6.1 NodeList.vue 新增"关联新OpenResty"按钮 + 确认弹窗 + 流式输出
- [x] 6.2 ClusterNodes.vue 同上
- [x] 6.3 NodeList.vue 新增"升级Edge小版本"按钮 + 弹出对话框（含版本列表/添加版本包/切换版本三个 Tab）
- [x] 6.4 ClusterNodes.vue 同上
