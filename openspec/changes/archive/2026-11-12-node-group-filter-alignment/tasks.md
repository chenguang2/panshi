# Tasks

## 1. 后端：`GET /node-tasks` 支持 group_name（TDD）

- [x] 1.1 RED：`backend/tests/test_node_task_api.py` 新增组过滤用例（镜像 `test_node_list_api.py` 种子范式：2 分组集群 + 1 未分组集群各 1 任务；断言具名分组 / `__ung__` / 缺省 `__all__` 三态精确返回），跑红确认 404/忽略或参数无效
- [x] 1.2 GREEN：`backend/app/api/v1/node_tasks.py` `_task_list_stmt` 增加 `group_name` 过滤（`__ung__`/具名/`__all__` 三态，镜像 nodes.py）；`list_all_tasks` 增加 `group_name` Query 参数并传入
- [x] 1.3 验证：新用例转绿；`uv run pytest tests/test_node_task_api.py tests/test_node_list_api.py -q` 域内回归全绿

## 2. 前端：自启动管理接线（TDD）

- [x] 2.1 RED：EdgeAutostart 页测试新增断言——选组后 `loadNodes` 请求带 `groupName`（含 `__all__`/`__ung__`/具名三态），跑红
- [x] 2.2 GREEN：`EdgeAutostart.vue` `loadNodes` 补传 `groupName: groupFilter.value`
- [x] 2.3 验证：用例转绿；既有 EdgeAutostart*.test.ts 全绿

## 3. 前端：节点任务中心接线（TDD）

- [x] 3.1 RED：`NodeTaskCenter.test.ts` 新增断言——`listParams()` 含 `group_name`、选组触发带参重载、`hasActiveFilters` 纳入分组、URL 深链写/回填 `group`
- [x] 3.2 GREEN：`NodeTaskCenter.vue` 四处——`listParams()` 加 `group_name`；`hasActiveFilters` 加 `filterGroup.value !== '__all__'`；`currentListQuery()` 写 `query.group`；`restoreFiltersFromQuery()` 回填
- [x] 3.3 验证：用例转绿；`NodeTaskCenter.test.ts` 既有用例全绿

## 4. 收口验证

- [x] 4.1 后端：`cd backend && uv run pytest tests/test_node_task_api.py tests/test_node_list_api.py -q` 全绿
- [x] 4.2 前端类型：`npx vue-tsc -b` 0 错误
- [x] 4.3 前端全量：`npx vitest run --no-file-parallelism` 全绿（波动家族按 #208 串行复核）
- [x] 4.4 `openspec validate --all` 0 error
