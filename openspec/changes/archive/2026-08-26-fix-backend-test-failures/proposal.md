# Proposal: fix-backend-test-failures

## Why

后端测试套件长期存在 37 个失败（2026-08-21 全量实测：1150 passed / 55 skipped / **37 failed**），横跨证书生成、命令执行、节点任务、路由/上游列表四类模块。持续红灯使回归信号失真——新引入的破坏无法与既有失败区分，测试套件可信度被侵蚀。需要系统性排查根因并恢复绿色基线。

## What Changes

- **先取证后动手**：对四个失败簇逐一收集完整 traceback 与环境事实，归档到本变更目录 `evidence/`，杜绝凭猜测改代码。
- **按根因三分法处置**：
  - 代码缺陷 → 最小修复产品代码；
  - 测试过时（断言与现行预期行为脱节）→ 更新测试断言；
  - 环境依赖（如本机缺 openssl）→ 显式 `skip(reason)` 并登记豁免清单。
- **四簇独立排查**（簇间无共享根因假设，可并行）：
  - **A 证书/OpenSSL**（11 个）：`test_cert_generator.py` ×3、`test_ssl_reserved_sni.py` ×8
  - **B 命令执行脚本**（9 个）：`test_cmd_exec_script.py` 黑名单/白名单/超时退出码/base64 传输
  - **C 节点任务 API**（2 个）：`test_node_task_api.py` 任务创建端点与 cmd 参数透传
  - **D 列表 API 查询行为**（15 个）：`test_route_api.py` ×5、`test_route_list_api.py` ×7、`test_upstream_list_api.py` ×3 的分页/排序/搜索/过滤
- **验收口径**：`uv run pytest` 全量零 failed；确属环境依赖的用例以带理由的 skip 呈现并在勘误中登记。

## Capabilities

### New Capabilities

（无。本变更为质量修复，不新增用户可见能力。）

### Modified Capabilities

（预期无能力行为变更：多数失败疑似测试断言过时或环境依赖。若 RCA 判定某簇需修改产品代码且改变既有规格行为，须在实施前补充对应能力的 delta spec 再动手——见 design.md D4。）

## Impact

- **测试**：`backend/tests/` 下 7 个文件——`test_cert_generator.py`、`test_cmd_exec_script.py`、`test_node_task_api.py`、`test_route_api.py`、`test_route_list_api.py`、`test_ssl_reserved_sni.py`、`test_upstream_list_api.py`
- **可能涉及的产品代码**（视 RCA 而定）：OpenSSL 检测/证书生成服务、命令执行脚本服务、节点任务创建端点、路由与上游列表查询逻辑
- **文档**：tasks.md 记录每簇根因结论；如产生 skip 豁免，在变更勘误中登记豁免清单与理由
