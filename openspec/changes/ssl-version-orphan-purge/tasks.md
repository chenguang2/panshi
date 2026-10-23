# Tasks: ssl-version-orphan-purge

## 1. 删除清版本（TDD 先行）

- [x] 1.1 RED→GREEN：`tests/test_ssl_version_orphan_purge.py` 先补「删除证书 → 版本快照清零、同 id 新证书不见旧条目」「仅 delete_edge 保留」用例，再在 `cluster_ssl.py` DELETE 的 delete_db 分支补 purge（对齐六域既有模式）
- [x] 1.2 守卫：断言 ssl 域删除路径含版本清理（防回归再漏；正则/行为式任选，参照既有域内守卫风格）

## 2. 存量孤儿清理（TDD 先行）

- [x] 2.1 RED→GREEN：先补用例（backdated 孤儿被清、同代快照保留、重复调用幂等），再实现 `services/ssl_version_cleanup.py::purge_orphan_ssl_versions`（join-delete，双方言）
- [x] 2.2 `main.py` lifespan `init_db` 后挂载单次调用（isolated lifespan 测试不破——确认 conftest 的 lifespan 隔离策略不触发真实清理）

## 3. 异代快照可见（TDD 先行，共享组件）

- [x] 3.1 消费方核对（约定 #217）：grep `VersionManagementModal` 使用点全集 + 既有断言清单，产出反转影响面
- [x] 3.2 RED→GREEN：`VersionManagementModal.test.ts` 先补用例（快照 name ≠ resourceName → 列表项异代标记 + 回滚确认红色警示；一致/解析失败 → 不渲染），再改 `VersionManagementModal.vue`（JSON.parse(config).name，条件渲染）
- [x] 3.3 全量收口：`npx vitest run --no-file-parallelism` + `npx vue-tsc -b` + `npm run build`

## 4. 验证与收口

- [x] 4.1 `uv run pytest -k "ssl"` 全绿；dev server 重启后真数据核对：uapm 名下 7 月孤儿 v1 消失、同代快照保留
- [x] 4.2 真页核对：uapm 版本管理中 gm-server 条目显示异代标记、回滚确认出红色警示
- [x] 4.3 `openspec validate --all` 0 error 收口
