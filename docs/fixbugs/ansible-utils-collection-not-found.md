# Ansible `ansible.utils.index_of` 插件未找到

## 现象

执行 Ansible 启动/操作 Edge 节点时失败，报错：

```bash
TASK [edge : run] **************************************************************
[WARNING]: Error loading plugin 'ansible.utils.index_of': No module named 'ansible_collections.ansible.utils'
[ERROR]: The lookup plugin 'ansible.utils.index_of' was not found.
Origin: /home/qcg/panshi/backend/ansible/roles/edge/tasks/nginx_cmd.yml:5:9

fatal: [192.168.100.42]: FAILED! => {"msg": "The lookup plugin 'ansible.utils.index_of' was not found."}
```

涉及文件 `roles/edge/tasks/nginx_cmd.yml` 第 5 行：

```yaml
loop: "{{ lookup('ansible.utils.index_of', ips, 'eq', inventory_hostname, wantlist=True) }}"
```

## 原因

1. **集合未安装**：`backend/ansible/collections/` 下只存放了 `ansible-utils-6.0.2.tar.gz` 压缩包，未解压到 Ansible 可识别的目录结构中。
2. **目录规范不符**：Ansible 的 `collections_paths` 配置为 `./collections`，集合文件必须存放在 `collections/ansible_collections/<namespace>/<name>/` 路径下才能被加载。仅存放 `.tar.gz` 文件不会被识别。
3. **离线环境**：目标机器无外网访问，无法通过 `ansible-galaxy collection install` 在线安装。

## 解决方案

### 手动解压集合到正确路径

```bash
cd backend/ansible/collections

# 创建 namespace/name 目录结构
mkdir -p ansible_collections/ansible/utils

# 解压 tarball 到目标目录
tar xzf ansible-utils-6.0.2.tar.gz -C ansible_collections/ansible/utils/
```

### 验证

解压后目录结构应为：

```
collections/
├── ansible-utils-6.0.2.tar.gz
├── requirements.yml
└── ansible_collections/
    └── ansible/
        └── utils/
            ├── MANIFEST.json
            ├── plugins/
            │   └── lookup/
            │       └── index_of.py   ← 关键插件
            └── ...
```

确认 `index_of.py` 存在：

```bash
ls collections/ansible_collections/ansible/utils/plugins/lookup/index_of.py
```

### 配置说明

`ansible.cfg` 中 `collections_paths = ./collections` 为相对路径，Ansible 会在 playbook 所在目录（`backend/ansible/`）下查找 `collections/ansible_collections/`。

```ini
[defaults]
collections_paths = ./collections
```

## 预防

- 提交 `.tar.gz` 时同步提交解压后的目录，或在部署流水线中添加解压步骤
- 或将解压步骤加入部署脚本，确保每次部署时自动安装
