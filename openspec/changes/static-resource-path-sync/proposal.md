# Proposal

## Why

`ps_static_resource.url_path` 是**建卡当天**（或换绑路由时）对 `route.uri` 的快照；路由改 URI 后没有任何回写，于是同一张卡片里「路径」行显示旧 URI、「绑定」行显示实时 `route_uri`，自相矛盾。发布确认弹窗摘要、上传日志行、集群导出 Excel 路径列都消费这个字段，所以旧值会扩散到三处展示与导出。发布链路本身按 `edge_uuid` 工作、不受影响——但数据与展示必须一致。

## What Changes

- `PUT /clusters/{id}/routes/{rid}`（`update_route`）在提交前按 `route_id` 幂等回写该路由下静态资源的 `url_path = route.uri`（WHERE 差异行，含 `NULL`），**不推进 `updated_at`**（该列驱动静态资源「待发布」态，改路径不需要重发 zip）。
- 幂等 + 自愈：即使本次未改 URI（只改名称/描述等），存量脏行也会在下次路由保存时被纠正；无静态资源时为空更新（no-op）。
- 读取侧保持现状（卡片「路径」仍读 `url_path`），因为写入侧修正后该字段即为真值；不引入第二套展示口径。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `static-resource-management`: 新增「静态资源 URL 路径随路由 URI 变更同步」要求（幂等回写、不动 `updated_at`、自愈存量脏行）。

## Impact

- 后端：`app/api/v1/cluster_routes.py::update_route`（本次唯一写点）；新增 `backend/tests/test_static_resource_path_sync.py`。
- 数据：活动库 `static-test.db` 现存 1 条脏行（`url_path='/*'` vs 路由 `/webTrade/*`）将在下一次路由保存时自愈，可按需一次性纠正。
- 前端/Edge/发布链路：零改动（发布仍按 `edge_uuid`）。
