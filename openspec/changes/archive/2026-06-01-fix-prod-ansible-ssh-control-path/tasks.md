## 1. Ansible 配置

- [x] 1.1 backend/ansible/ansible.cfg — SSH ControlPath 改为 `/tmp/panshi-cp`，使用 `control_path` 配置项 + `%%%%h-%%%%p-%%%%r` 四重转义
- [x] 1.2 backend/app/services/ansible_service.py — 设置 `ANSIBLE_SSH_CONTROL_PATH` 环境变量到 `/tmp/panshi-cp` + `%%h-%%p-%%r` 双重转义
- [x] 1.3 backend/app/services/ansible_service.py — 移除 `ANSIBLE_SSH_CONTROL_PATH_DIR`，简化环境变量

## 2. Collection 依赖

- [x] 2.1 backend/ansible/collections/requirements.yml — 新建，声明 `ansible.utils` collection
- [x] 2.2 product/linux/gen-linux.sh — 在 pip install 后新增 `ansible-galaxy collection install` 步骤

## 3. 部署脚本

- [x] 3.1 product/linux/start.sh — 新增 `mkdir -p /tmp/panshi-cp` 确保 socket 目录存在

## 4. 验证

- [x] 4.1 Python 语法检查通过
- [x] 4.2 SSH socket 路径长度验证（56 字符，远低于 108 限制）
