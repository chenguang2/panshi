## 1. 后端重命名

- [x] 1.1 全局替换 `edge_install_path` → `openresty_path`（models/cluster.py、schemas/cluster.py、api/v1/nodes.py、cluster_install.py、cluster_export.py、services/node_task_service.py）
- [x] 1.2 更新测试夹具（test_node_task_executor.py 等）

## 2. 数据库迁移

- [x] 2.1 migrate.py 新增 `_rename_column` 函数（RENAME COLUMN，数据保留）
- [x] 2.2 更新 COLUMN_MIGRATIONS（edge_install_path → openresty_path）并在 run_migrations 中先 rename 后 add
- [x] 2.3 验证迁移：旧库含 edge_install_path 数据 → 迁移后 openresty_path 数据保留、幂等

## 3. 前端重命名

- [x] 3.1 全局替换 `edge_install_path` → `openresty_path`（types/api/composables/utils/views/components/tests）
- [x] 3.2 表单 label "Nginx安装路径" → "OpenResty安装路径"（NodeList.vue、ClusterNodes.vue）
- [x] 3.3 CSV 列头与别名映射同步（nodeImport.ts）

## 4. 验证

- [x] 4.1 后端全量 pytest：883 passed，71 failed 与 baseline 一致（无新增失败）
- [x] 4.2 前端 vitest：相关文件全绿；17 failed 与 baseline 对比无新增（含 5 个随机失败的页面 header 测试）
- [x] 4.3 前端 `npm run build` 通过

## 5. 文档同步

- [x] 5.1 活跃 specs 更新（node-task-center、edge-node-lifecycle、cluster-data-export、node-copy-batch-import）
- [x] 5.2 docs/architecture.md 更新
