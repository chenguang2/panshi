# Edge 升级功能设计文档

## 概述

在现有 Edge 安装功能（`manager install`）和已存在的 `upgrade_edge.yml`（自动化组合升级流）基础上，增加：
- **关联新OpenResty**：安装新 OpenResty 后，将现有 Edge 实例绑定到新 OpenResty 并同步配置模板
- **小版本管理**：独立暴露 `pack-list`、`pack-add`、`pack-rebase` 三个操作

## 现有基础设施

`backend/ansible/roles/edge/tasks/upgrade_openresty.yml` 已存在，跑的是 `manager upgrade`：
```yaml
cmd: "{{ item.1 }}/bin/manager upgrade {{ item.2 }}uap-edge"
```
本次在其基础上增加 `bin/edge init` 步骤（同步新 OpenResty 的配置模板），并补齐后端 endpoint 和前端入口。

`backend/ansible/roles/edge/tasks/upgrade_edge.yml` 已存在，做的是**组合小版本升级流**：
1. copy 文件到远端
2. `manager pack-add`
3. `manager pack-list`
4. 提取第二行版本号
5. `manager pack-rebase`

这个保留不动。本次新增的是独立暴露的 pack-* 操作。

## 操作入口

节点操作下拉菜单新增两项：

```
└─ 关联新OpenResty              — 修改 upgrade_openresty.yml（manager upgrade + init）
└─ 升级Edge小版本               — 弹出对话框
    ├─ 版本列表 (pack-list)
    ├─ 添加版本包 (pack-add)
    └─ 切换版本 (pack-rebase)
```

## 1. 关联新OpenResty

### 业务语义

用户已安装新版本的 OpenResty（通过已有的 `install_openresty`），需要将现有 Edge 实例指向新 OpenResty，并同步新 OpenResty 中的配置模板。

流程：
1. `manager upgrade {edge_dir}` — 用新 OpenResty 的 manager 升级 Edge
2. `bin/edge init` — 重新初始化，从新 OpenResty 同步配置模板

### Ansible

修改 `backend/ansible/roles/edge/tasks/upgrade_openresty.yml`，改用 `edge_target` 动态获取 Edge 目录名（支持 `uap-edge2` 等自定义命名），增加 init 步骤：

```yaml
- name: upgrade edge with new openresty
  shell:
    cmd: "source /etc/profile; install_dir={{ edge_target }}; parent_dir=$(dirname $install_dir); dir_name=$(basename $install_dir); cd $parent_dir; {{ item.1 }}/bin/manager upgrade $dir_name;"
  loop: "{{ ips.split(',') | zip(prefix.split(',')) | list }}"
  when: inventory_hostname == item.0
  tags:
    - upgrade_openresty

- name: edge init (sync config templates from new openresty)
  shell:
    cmd: "source /etc/profile; cd {{ edge_target }}; bin/edge init;"
  loop: "{{ ips.split(',') | zip(prefix.split(',')) | list }}"
  when: inventory_hostname == item.0
  tags:
    - upgrade_openresty
```

### 后端

**`cluster_install.py`** — 新增 endpoint：

```
POST /clusters/{cluster_id}/nodes/{node_id}/associate-new-openresty
Body: { prefix: string }

→ StreamingResponse (SSE)
```

后端自动推导逻辑（与 `install_edge` 一致）：
```python
prefix = node.edge_install_path or body.prefix
extravars = {"prefix": prefix, "edge_target": node.edge_path}
```

### 前端

**NodeList.vue / ClusterNodes.vue** 的节点操作下拉菜单新增 **"关联新OpenResty"** 按钮：

- 点击 → 弹出确认对话框，显示当前 Edge 路径和将关联的新 OpenResty 路径
- 确认后 → `installStream.start()` 调用 `/associate-new-openresty` endpoint
- 走现有 `NodeExecutionResultDrawer` SSE 流式输出

## 2. 小版本管理

### 2.1 版本列表 (pack-list)

#### Ansible

新建 `backend/ansible/roles/edge/tasks/edge_pack_list.yml`：

```yaml
- name: pack list
  shell:
    cmd: "source /etc/profile; cd {{ edge_target }}; bin/edge pack-list"
  register: pack_output
  changed_when: false
  failed_when: false
  tags:
    - edge_pack_list

- name: out
  debug:
    msg: "{{ pack_output.stdout_lines }}"
  when: pack_output.stdout is defined
  tags:
    - edge_pack_list
```

#### 后端

**`cluster_install.py`** — 新增 endpoint（非流式，直接返回结果）：

```
GET /clusters/{cluster_id}/nodes/{node_id}/edge-pack-list
→ { versions: [{ name: string, current: boolean }] }
```

使用 `generic_run(tag="edge_pack_list")`，从 `shell_stdout` 解析输出。

`bin/edge pack-list` 输出格式：
```
[*]2.7.5.26012617        ← 当前版本带 [*] 标记
2.7.6.26020421
```

解析逻辑：逐行读取，`[*]` 前缀标记为 `current: true`。

#### 前端

在"升级Edge小版本"对话框的"版本列表"Tab 中，以表格展示：

| 版本 | 状态 |
|---|---|
| 2.7.5.26012617 | 当前版本 |
| 2.7.6.26020421 | - |

打开 Tab 时自动调用 `/edge-pack-list` 加载。

### 2.2 添加版本包 (pack-add)

#### 文件列表 API

扩展现有 `openresty-files` 逻辑，新增过滤 `edge-pack-*.tgz` 的接口（可与 openresty-files 合并或新增独立路由）：

```
GET /clusters/{cluster_id}/nodes/edge-pack-files
→ { files: [{ name, size, size_display, mtime }] }
```

过滤模式：同时支持 `.tgz` 和 `.tar.gz`，文件名以 `edge-pack-` 开头。

#### Ansible

新建 `backend/ansible/roles/edge/tasks/edge_pack_add.yml`，复用 `install_openresty.yml` 的 copy 模式：

```yaml
- name: Create remote temp directory
  file:
    path: "{{ destpath }}/soft/"
    state: directory
  loop: "{{ ips.split(',') | zip(destpath.split(',')) | list }}"
  when: inventory_hostname == item.0
  tags: [edge_pack_add]

- name: Copy pack file
  copy:
    src: "{{ srcpath }}/{{ pack_file }}"
    dest: "{{ destpath }}/soft/{{ pack_file }}"
  loop: "{{ ips.split(',') | zip(destpath.split(',')) | list }}"
  when: inventory_hostname == item.0
  tags: [edge_pack_add]

- name: Manager pack-add
  shell:
    cmd: "source /etc/profile; cd {{ item.1 }}; {{ item.1 }}/bin/manager pack-add {{ destpath.split(',')[item|int] }}/soft/{{ pack_file }};"
  loop: "{{ lookup('ansible.utils.index_of', ips.split(','), 'eq', inventory_hostname, wantlist=True) }}"
  tags: [edge_pack_add]
```

#### 后端

**`cluster_install.py`** — 新增 endpoint：

```
POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-add
Body: { pack_file: string }

→ StreamingResponse (SSE)
```

后端从 `PRIVATE_DATA_DIR/soft/` 构建 `srcpath`，从 `node.edge_install_path` 的父目录推出 `destpath`。

#### 前端

在"升级Edge小版本"对话框的"添加版本包"Tab 中：
- 打开时调用 `edge-pack-files` 获取可用文件列表
- radio 选择
- "添加"按钮触发 pack-add 流程
- 走 `NodeExecutionResultDrawer` 流式输出

### 2.3 切换版本 (pack-rebase)

#### Ansible

新建 `backend/ansible/roles/edge/tasks/edge_pack_rebase.yml`，三步：

```yaml
- name: pack rebase
  shell:
    cmd: "source /etc/profile; cd {{ edge_target }}; bin/edge pack-rebase {{ version }};"
  tags: [edge_pack_rebase]

- name: edge init
  shell:
    cmd: "source /etc/profile; cd {{ edge_target }}; bin/edge init;"
  tags: [edge_pack_rebase]

- name: edge reload
  shell:
    cmd: "source /etc/profile; cd {{ edge_target }}; bin/edge reload;"
  failed_when: false
  tags: [edge_pack_rebase]
```

`reload` 用 `failed_when: false`，服务未运行时不报错。

#### 后端

**`cluster_install.py`** — 新增 endpoint：

```
POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-rebase
Body: { version: string }

→ StreamingResponse (SSE)
```

#### 前端

在"升级Edge小版本"对话框的"切换版本"Tab 中：
- 先调用 `pack-list` 获取可用版本列表
- radio 列表展示（当前版本标记，不可选）
- 用户选择目标版本 → 确认
- 流式输出

## 文件清单

### 新增文件

| 路径 | 说明 |
|---|---|
| `backend/ansible/roles/edge/tasks/edge_pack_list.yml` | `pack-list` 小版本列表 |
| `backend/ansible/roles/edge/tasks/edge_pack_add.yml` | `pack-add` 添加小版本包 |
| `backend/ansible/roles/edge/tasks/edge_pack_rebase.yml` | `pack-rebase` 切换小版本 |
| `docs/superpowers/specs/2026-07-16-edge-upgrade-design.md` | 本文档 |

### 修改文件

| 路径 | 说明 |
|---|---|
| `backend/ansible/roles/edge/tasks/upgrade_openresty.yml` | 改用 `edge_target`，增加 `bin/edge init` 步骤 |
| `backend/app/api/v1/cluster_install.py` | 新增 4 个 endpoint + edge-pack-files 路由 |
| `frontend/src/views/NodeList.vue` | 新增"关联新OpenResty/升级Edge小版本"菜单项 |
| `frontend/src/views/clusters/ClusterNodes.vue` | 同上 |
| `backend/ansible/roles/edge/tasks/main.yml` | 新增 `edge_pack_list/add/rebase` 的 `import_tasks` |

## 注意事项

- `upgrade_openresty.yml` 对应**关联新OpenResty**功能（`manager upgrade` + `bin/edge init`），不是 OpenResty 安装
- `upgrade_edge.yml`（已存在）是自动化组合升级流（pack-add + rebase），本次新增的是独立 pack-* 操作
- pack-add 的 copy 模式参照 `install_openresty.yml`，文件传到 `{destpath}/soft/` 下
- pack-list 输出解析注意 `[*]` 前缀
- pack-rebase 的 reload 用 `failed_when: false`
- `edge-pack-files` 接口过滤模式：`edge-pack-*.tgz` / `edge-pack-*.tar.gz`
- 所有 endpoint 的 prefix 传递逻辑与 `install_edge` 一致（后端取 `node.edge_install_path`）
