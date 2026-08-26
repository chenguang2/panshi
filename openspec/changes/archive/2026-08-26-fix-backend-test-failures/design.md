# Design: fix-backend-test-failures

## Context

2026-08-21 全量实测：`uv run pytest --tb=no -q` → **37 failed / 1150 passed / 55 skipped**（98s）。失败高度聚集于四个互不重叠的文件簇：

| 簇 | 文件 | 数量 | 失败面 |
|---|---|---|---|
| A | test_cert_generator.py / test_ssl_reserved_sni.py | 3+8 | OpenSSL 检测、本地证书 SAN/SNI 内容 |
| B | test_cmd_exec_script.py | 9 | 黑白名单放行判定、超时/退出码上报、base64 传输 |
| C | test_node_task_api.py | 2 | 任务创建端点、cmd 参数透传 |
| D | test_route_api.py / test_route_list_api.py / test_upstream_list_api.py | 5+7+3 | 分页、排序、全局/字段搜索、集群/分组/插件过滤 |

已知环境线索：开发机为 macOS（darwin）；A 簇三个用例字面指向 openssl 二进制探测，存在「本机无 openssl 导致误报」的可能；D 簇全部为查询语义断言，疑似 API 响应结构或查询实现演进后测试未同步；B/C 簇可能同源（cmd 参数模式相关）。**以上均为待验证假设，不作为结论。**

## Goals / Non-Goals

**Goals:**
- 每一簇拿到确定性根因结论（代码缺陷 / 测试过时 / 环境依赖三选一），证据落盘可复查
- 全量 pytest 恢复零 failed；环境依赖用例转为带 reason 的 skip 并登记
- 修复过程不引入新失败（每簇修复后立即重跑该簇 + 关联簇）

**Non-Goals:**
- 不为凑绿删除或弱化测试断言（删测试 = 掩盖问题，禁止）
- 不重构与失败无关的模块（最小修复原则）
- 不在本变更内扩展新测试覆盖面（只恢复既有用例的绿）
- 不处理前端 Vitest/Playwright 用例（本次范围仅 backend/tests）

## Decisions

### D1: 先取证，后动手

每个簇的第一个动作是收集完整 traceback（`uv run pytest tests/<file> --tb=long -q`）与环境事实（openssl 版本/路径、Python/pytest 版本），写入 `evidence/<cluster>.md`。禁止在未读完证据前编辑任何文件。

### D2: 三分法处置，处置结论必须显式记录

| 根因类型 | 处置 | 记录位置 |
|---|---|---|
| 代码缺陷 | 最小修复产品代码，保持原断言 | tasks.md 勾选时附一行结论 |
| 测试过时 | 更新断言至现行预期行为，docstring 注明同步日期 | 同上 |
| 环境依赖 | `skip(reason=...)` 或 skipif 条件化 | tasks.md + 勘误豁免清单 |

任何一项不得落入「改到绿为止」的无结论状态。

### D3: 四簇并行推进，C 簇允许并入 B 簇

四簇文件互不重叠，可作为独立任务并行处理。若取证显示 C 簇（node_task_api 创建 cmd 任务）根因即 B 簇的参数模式问题，合并处理避免重复劳动。

### D4: 若需行为变更，先补 delta spec

若某簇 RCA 结论是「产品代码偏离既有规格」，修复即行为变更：实施前必须在 `specs/` 下补对应能力的 delta spec，走完规格流程再动代码。（当前预期不需要——多数失败疑似测试侧过时。）
