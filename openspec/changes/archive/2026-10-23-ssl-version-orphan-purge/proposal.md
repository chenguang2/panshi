# Proposal: ssl-version-orphan-purge

## 背景

用户发现今天创建的 uapm 证书带有 7 月 22 日的版本历史。取证还原：

1. 7 月存在证书 `gm-server`（当时占用 id=2），发布过一次（v1，老格式快照）。
2. gm-server 被删除时，**cluster_ssl 的 DELETE 端点是全仓库唯一漏掉「删除时清版本」的域**（routes/upstreams/plugin_configs/global_rules/plugin_metadata/static_resources 六域均有 purge，ssl 没有）→ v1 成孤儿。
3. 新建 uapm 复用了 SQLite 空出的 id=2 → 孤儿 v1 被继承进 uapm 的版本历史。
4. 用户回滚到 v1 时，`_restore` 连 name/证书文件整体恢复——7 月死证书的身份被「复活」并再次发布（v3/v5 快照 name=gm-server），即此前 uapm 系列问题的共同根源。

## 影响

- 孤儿版本混入版本历史（7 月条目出现在今天的证书上），误滚会整体覆盖当前证书（含改名）。
- `ConfigVersion.resource_id` 为裸 Integer 无 FK，id 复用即「改嫁」，缺陷跨域可复现（其它域因删除清理而未暴露）。

## 拟议变更

1. **删除清版本**：cluster_ssl DELETE 端点在删除库记录时同步 purge 该证书全部版本快照（对齐既有六域模式 + 守卫测试）。
2. **存量孤儿清理**：启动时一次性清理「`created_at` 早于所属证书 `created_at`」的 ssl 版本行（精确判定、幂等；同代快照不受影响）。
3. **异代快照可见 + 回滚防误滚**：版本管理弹窗从版本 `config` 原文解析快照 `name`，与当前资源名不一致时在列表项标注，并在回滚确认弹窗追加红色警示（纯前端，`config` 已在响应中）。

## 影响

- 后端：cluster_ssl.py 删除分支补 purge；新增 `services/ssl_version_cleanup.py` + main.py lifespan 挂载；零 schema 变更。
- 前端：`VersionManagementModal.vue`（共享组件，按约定 #217 先核对消费方）条件化渲染，其它域不受影响。
