## 1. Ansible — 安装包文件名变量化

- [x] 1.1 修改 `backend/ansible/roles/edge/tasks/install_openresty.yml`，将 3 处 `openresty-edge-26071308.tar.gz` 替换为 `{{ openresty_file }}`

## 2. Backend — 文件列表 API

- [x] 2.1 在 `backend/app/api/v1/cluster_install.py` 中新增 `GET /clusters/{cluster_id}/nodes/openresty-files` 路由
- [x] 2.2 读取 `PRIVATE_DATA_DIR/soft/` 目录，过滤 `openresty-*.tar.gz` 文件
- [x] 2.3 返回文件名、大小（字节 + 格式化显示）、修改时间，按 mtime 降序
- [x] 2.4 处理目录不存在/空目录/权限错误等情况

## 3. Backend — 接受 openresty_file 参数 + 简化请求体

- [x] 3.1 `InstallOpenrestyRequest` 精简为 `prefix: str` + `openresty_file: str` 必填字段
- [x] 3.2 `install_openresty_stream()` endpoint 中 `srcpath` 改为从 `PRIVATE_DATA_DIR` 构建，`destpath` 从 `prefix` 父目录推出
- [x] 3.3 `_install_openresty_stream()` 将 `openresty_file` 传入 extravars
- [x] 3.4 `AnsibleRunnerService.install_openresty()` 新增 `openresty_file` 参数

## 4. Frontend — 共享选择对话框组件

- [x] 4.1 新建 `frontend/src/components/InstallOpenrestyDialog.vue`，包含：
  - 打开时调用 `GET /clusters/{cluster_id}/nodes/openresty-files` 获取文件列表
  - 展示节点 IP、安装路径
  - 列表展示文件（名称、大小、修改时间），radio 选择
  - "开始安装"按钮触发确认
  - 空列表/错误状态处理
- [x] 4.2 组件通过 `emit('confirm', { node, clusterId, openrestyFile })` 通知父组件，前端不再传 `srcpath`/`destpath`

## 5. Frontend — NodeList.vue 接入

- [x] 5.1 引入 `InstallOpenrestyDialog` 组件
- [x] 5.2 修改 `handleInstallOpenresty`：改为打开对话框，取消时关闭，确认后调用原有安装流
- [x] 5.3 安装请求 body 仅传 `{ prefix, openresty_file }`

## 6. Frontend — ClusterNodes.vue 接入

- [x] 6.1 引入 `InstallOpenrestyDialog` 组件
- [x] 6.2 修改 `handleInstallOpenresty`：改为打开对话框，取消时关闭，确认后调用原有安装流
- [x] 6.3 安装请求 body 仅传 `{ prefix, openresty_file }`

## 7. 验证

- [x] 7.1 启动后端，调用 `GET /clusters/1/nodes/openresty-files` 验证文件列表返回正确
- [x] 7.2 前端确认对话框正确展示文件列表，选择后开始安装
- [x] 7.3 验证 Ansible 复制了解压了用户选择的文件，而非硬编码文件
