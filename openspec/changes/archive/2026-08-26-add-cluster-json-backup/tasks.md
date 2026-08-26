# Tasks

## 1. 后端：备份导出

- [x] 1.1 定义备份文件常量与 Pydantic 模型：format 标识、version=1、options（include_secrets/include_files）
- [x] 1.2 实现导出服务：按表清单全字段查询，子表（targets/route plugins）内嵌父行，admin_key 始终排除，include_secrets/include_files 控制证书字段与静态资源 content_base64
- [x] 1.3 导出降级：静态资源文件缺失时跳过内容保留元数据并计入警告清单
- [x] 1.4 计算 data 的 SHA-256 校验和；实现 `GET /clusters/{id}/backup` 路由（StreamingResponse + 中文文件名 + 警告清单响应头）
- [x] 1.5 导出单元测试：字段完整性（对照 ORM 列清单）、敏感开关两种取值、校验和正确性、文件缺失降级

## 2. 后端：导入

- [x] 2.1 实现硬校验器：format/version/checksum、必备键与字段结构、目标集群名可用性；错误聚合报告
- [x] 2.2 实现导入主流程：新集群创建、忽略 ID 插入、cluster_id 替换；映射构建——name→new_id 与节点 ip:service_port→new_id
- [x] 2.3 外键重建：upstream_id / route_id / ca_cert_id 按名称；stream_proxies.ref_node_id 按节点 ip:port；plugin_config_ids 依赖 edge_uuid 原值直连
- [x] 2.4 悬空引用自动清理：解析失败的引用剔除/置空并计入 warnings；字段修正（creator_id=当前操作者、current_version 重置、集群启用、节点 status 置离线）
- [x] 2.5 结果组装：warnings[] 与 pending_items[]（无内容证书、无文件资源）；单事务包裹与回滚
- [x] 2.6 实现 `POST /clusters/import` 路由（multipart 上传，target_cluster_name 参数，管理员权限）
- [x] 2.7 导入单元测试：
  - 新 ID 分配与全部外键映射正确（含 ref_node_id）、plugin_config_ids 引用有效
  - 悬空引用清理场景逐条覆盖且计入 warnings
  - 内容缺失进入 pending_items
  - 名称冲突整体回滚无部分写入
  - SQLite/PG 双库跑通

## 3. 前端：统一管理页入口

- [x] 3.1 新增【备份下载】按钮（带 include_secrets/include_files 勾选与私钥保管风险提示），展示导出警告
- [x] 3.2 新增【从备份恢复】弹窗：上传文件、指定新集群名、校验错误列表展示
- [x] 3.3 导入结果页：warnings 列表、"需补齐清单"（重新生成证书/重传文件入口提示）、"集群未发布，需手动发布才生效"醒目提示

## 4. 验证

- [x] 4.1 端到端：demo 集群导出 → 导入重建 → 对比两集群配置一致（路由/上游/插件组/四层代理数量与内容，ref_node_id 指向对应节点）
- [x] 4.2 端到端：include_secrets=false 备份导入 → pending_items 正确列出全部证书；补生成证书后可正常发布
- [x] 4.3 手工构造悬空引用源数据 → 导入成功且 warnings 准确
- [x] 4.4 `uv run pytest` 全量回归通过；前端 `npx vitest run` 通过
