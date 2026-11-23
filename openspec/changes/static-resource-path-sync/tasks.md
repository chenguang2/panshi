# Tasks

## 1. 测试（RED 先行，#16）

- [x] 1.1 新增 `backend/tests/test_static_resource_path_sync.py`：① 改 URI → `url_path` 跟随且 `updated_at` 不变；② 未改 URI + 存量脏行 → 自愈；③ `url_path IS NULL` → 回写；④ 路由无静态资源 → 正常成功。验证：实现前 4 例红（至少 ①②③ 红）。
- [x] 1.2 回归既有静态资源域用例（`test_static_resource_rebind.py`、`test_static_resource_route_conflict.py`、`test_static_resource_publish_log.py`）。验证：全绿、零断言反转。

## 2. 实现

- [x] 2.1 `backend/app/api/v1/cluster_routes.py::update_route`：`db.commit()` 前按 `route_id` 幂等回写 `url_path`（条件 `url_path != route.uri OR url_path IS NULL`），Core `update()` 把 `updated_at` 赋回自身列以抑制 onupdate；顶部补 `or_` 与 `StaticResource` 导入（如缺）。验证：1.1 全绿。
- [x] 2.2 `openspec validate --all` 0 error。验证：命令输出。

## 3. 存量数据与真机验证

- [x] 3.1 活动库（`data/static-test.db`）现存脏行 `id=1 url_path='/*'` vs 路由 `/webTrade/*`：先 SELECT 复核目标行，再单行 UPDATE 为 `/webTrade/*`（不动 `updated_at`），写后复核影响行数=1 且 SELECT 校验。验证：`GET /clusters/1/static-resources` 返回 `url_path=/webTrade/*`。
- [x] 3.2 真机确认卡片「路径」行与「绑定」行同值（1600 视口截图），并确认卡片未因本次修复出现「待发布」态（`updated_at` 未变）。
