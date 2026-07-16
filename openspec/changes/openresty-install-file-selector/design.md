## Context

当前安装 OpenResty 的完整链路：

```
用户点击"安装 OpenResty"
  → showConfirm() 固定文本确认框
  → POST /clusters/{id}/nodes/{nid}/install-openresty { prefix: "..." }
    → cluster_install.py: InstallOpenrestyRequest 仅接受 prefix/srcpath/destpath
    → _install_openresty_stream(): extravars 传入 prefix/srcpath/destpath
      → Ansible tag=install_openresty_copy
        → install_openresty.yml 三处硬编码 openresty-edge-26071308.tar.gz
      → SSH 执行 install-edge.sh
```

`backend/ansible/soft/` 目录当前有 2 个 openresty 包 + 1 个 edge 包，文件名硬编码导致用户无法选择版本。

## Goals / Non-Goals

**Goals:**
- Ansible 脚本不再硬编码安装包文件名
- 后端提供 `soft/` 目录文件列表 API（含文件名、大小、修改时间）
- 前端弹出对话框展示可选安装包，用户选择后开始安装
- NodeList.vue 和 ClusterNodes.vue 两处安装入口统一复用同一组件

**Non-Goals:**
- 不实现文件上传功能（仅读取现有 `soft/` 目录）
- 不修改 `install-edge.sh` SSH 编译脚本
- 不修改数据库模型

## Decisions

### 1. 文件列表 API 路由

**方案：** `GET /api/v1/clusters/{cluster_id}/nodes/openresty-files`

**理由：** 路径与现有节点相关 API 风格一致（均在 `/clusters/{id}/nodes/` 下），codebase 惯例。

**返回格式：**
```json
{
  "files": [
    {
      "name": "openresty-edge-26071515.tar.gz",
      "size": 52428800,
      "mtime": "2026-06-15T10:30:00Z",
      "size_display": "50.0 MB"
    }
  ]
}
```

### 2. Ansible 脚本参数化

**方案：** `install_openresty.yml` 中 `openresty-edge-26071308.tar.gz` 替换为 `{{ openresty_file }}`，3 处全部替换。

**约束：** 所有 openresty tar 包 SHALL 保持相同的内部目录结构——解压后须包含 `install-edge/` 子目录及 `install-edge.sh`，否则 SSH 编译阶段会失败。

**理由：** 最简洁的变量化方式。Ansible 的 extravars 机制天然支持从上游传入变量。

### 3. InstallOpenrestyRequest 简化

**方案：** 请求体从 `{ prefix, srcpath, destpath, openresty_file }` 简化为 `{ prefix, openresty_file }`。`srcpath` 由后端从 `PRIVATE_DATA_DIR` 环境变量自动拼接，`destpath` 从 `prefix` 的父目录推出。

**理由：** 前端硬编码 `/home/qcg/panshi/backend/ansible/soft` 无法适应部署环境变化，后端已有 `PRIVATE_DATA_DIR` 配置机制。`destpath` 的计算逻辑前后端一致，没必要重复。

### 4. 前端共享组件

**方案：** 新建 `frontend/src/components/InstallOpenrestyDialog.vue`，封装选择对话框，NodeList.vue 和 ClusterNodes.vue 共同引用。

**理由：** 两处安装逻辑几乎完全重复，提取共享组件消除重复，后续维护只需改一处。

### 5. 复用现有安装流

**方案：** 对话框确认后，依旧调用 `installStream.start()` 走现有的 SSE 流式安装流程，body 增加 `openresty_file`。

**理由：** 安装流程（Ansible 传输→SSH 编译）无需改动，只需改变传输的文件名。

## Risks / Trade-offs

- [低] tar 包内部结构不一致 — 若未来有新的 openresty 包不包含 `install-edge/` 目录，SSH 阶段会失败。通过设计约束（所有包保持相同内部结构）规避。
- [低] `srcpath` 由后端默认 — 如果 `PRIVATE_DATA_DIR` 未正确配置或 `soft/` 目录未同步，文件列表 API 可能返回空。届时前端对话框会提示"未找到安装包"，用户可联系管理员检查配置。
- [低] NodeList.vue 和 ClusterNodes.vue 中 `handleInstallOpenresty` 逻辑差异 — 提取共享组件后，差异部分通过 props 传入（如节点数据来源不同）。
