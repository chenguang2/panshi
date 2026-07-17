## Context

当前系统支持安装 OpenResty（`install_openresty`）和安装 Edge（`install_edge`），但升级 Edge 功能缺失。`upgrade_openresty.yml` 已存在但未被后端和前端调用，且硬编码了 `uap-edge` 作为 Edge 目录名。另外 `upgrade_edge.yml` 已存在，做的是自动化的组合升级流（pack-add + rebase），但 pack-* 操作没有独立暴露。

## Goals / Non-Goals

**Goals:**
- 关联新OpenResty：安装新 OpenResty 后，将已有 Edge 绑定到新 OpenResty
- 小版本列表：独立查询 Edge 实例的可用小版本包
- 添加版本包：从 soft/ 目录选择 edge-pack 文件上传并注册
- 切换版本：选择目标版本执行 pack-rebase + reload

**Non-Goals:**
- 不修改 OpenResty 安装流程（`install_openresty`）
- 不修改 `upgrade_edge.yml` 现有的组合升级流
- 不涉及数据库模型变更
- 不涉及文件上传到服务器（pack 文件已在 soft/ 目录下）

## Decisions

### 1. 关联新OpenResty 复用 `upgrade_openresty.yml`
- 不新建 ansible task，直接修改现有的 `upgrade_openresty.yml`
- `manager upgrade` 内部自动处理初始化，不需要额外 `bin/edge init`
- 改用 `edge_target` 动态取值替代硬编码 `uap-edge`

### 2. pack-add 复用 `install_openresty` 的文件传输模式
- 文件从 `PRIVATE_DATA_DIR/soft/` 通过 ansible `copy` 模块传到远端
- 与 openresty-files 共享 soft/ 目录，新增过滤 `edge-pack-*.tgz`

### 3. pack-rebase 三步：rebase → init → reload
- 切换版本后先 `bin/edge init` 加载新版本配置，再 `bin/edge reload` 使生效
- reload 用 `failed_when: false`，服务未运行时不报错

### 4. pack-list 直接返回结果（非流式）
- 用 `generic_run` 执行，解析 `[*]` 前缀标记当前版本

## Risks / Trade-offs

- [低] `upgrade_openresty` 命名容易误解为 OpenResty 升级——通过文档和代码注释说明
- [低] pack 文件格式多样化（.tgz / .tar.gz）——过滤时两种都支持
