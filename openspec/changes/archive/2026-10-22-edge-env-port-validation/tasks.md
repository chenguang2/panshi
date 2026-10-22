# Tasks: edge-env-port-validation

> 已完成（2026-10-22）。验收记录：后端校验器 29 绿 + 端点文件 29 绿 + 前端全量 1873/1873 + vue-tsc 干净；实机 422 文案逐字命中 design D3、拦截不建版本（36→36）、正常发布 v37 all_success 收尾；1.5 端点用例落笔即绿（422 通路既有，RED 在校验器层成立）；PG 冒烟豁免理由见 3.3。**范围外发现**：`test_repo_yaml_ships_default_list` 红——`backend/features.yaml`（运行态文件）在 HEAD 即含 `redirect`，与守卫断言默认清单 [traceid, monitor] 漂移，先于本变更存在、与本变更无关，待用户定夺（还原默认清单 or 更新守卫）。
> 全部走 TDD（#16，RED 先验证失败）。范围见 proposal 决策点 A（按推荐值：仅 `deploy.http.edge.listen` / `deploy.http.admin.listen` 两字段）。
> 设计细节见同目录 design.md（D1-D6）。

## 1. 后端校验器（权威）

- [x] 1.1 RED：`backend/tests/test_yaml_validator.py` 新增端口校验用例——非法值参数化（`99999`/`0`/`-1`/`abc`/空串/无冒号 addr）SHALL 返回 (False, 含字段路径+项序号+原值+「1-65535」的文案)；当前结构检查放行，必红
- [x] 1.2 RED：合法边界 `1`/`65535` SHALL 通过；`unix:` 前缀条目 SHALL 跳过；纯字符串条目 `"0.0.0.0:8080"` SHALL 校验；无 `addr` 键的 dict 条目 SHALL 跳过（不误伤）
- [x] 1.3 RED：**实机真实内容护栏用例**——test 集群 v32 真实内容（含 `unix:` 条目、ssl dict 条目、注释）SHALL 整体通过校验（防误伤护栏）
- [x] 1.4 GREEN：`yaml_validator.py::validate_edge_env` 结构检查后追加 `_validate_listen_ports`（提取规则见 design D2；错误文案见 D3 定稿格式）
- [x] 1.5 RED→GREEN：部署端点集成（`test_cluster_edge_env.py`）——99999 内容 POST deploy SHALL 422 且 detail 含字段路径（校验先于 ansible，无需 mock 执行流；既有 422 通路自动生效）

## 2. 前端即时反馈

- [x] 2.1 RED：`EdgeEnv.test.ts`——99999 内容点「发布」SHALL NOT 打开发布弹窗，SHALL 提示含「端口非法」（当前 validateFields 放行，必红）；合法内容照常打开（钉住不误伤）
- [x] 2.2 GREEN：`EdgeEnv.vue::validateFields` 结构检查后追加同语义端口检查（文案与后端一致，提取规则同 D2）

## 3. 回归与验收

- [x] 3.1 后端：`pytest -k "edge_env or cluster"` 全绿；前端：`EdgeEnv.test.ts` + 触碰文件串行复跑 + 全量 `--no-file-parallelism` + `vue-tsc -b`（#208）
- [x] 3.2 实机验收（test 集群）：API 部署 99999 内容 → 422 带字段路径（不触节点、版本数不变）；正常内容单节点发布收尾不受影响
- [x] 3.3 PG 方言冒烟不触发（纯校验增强，无 schema/写库路径变更，#103 不适用——此处显式记录豁免理由）
- [x] 3.4 openspec 同步与归档：主 spec「发布前字段验证」场景按 delta 替换（MODIFIED 全块取自主 spec 现文，#53 手工流）；变更目录移入 `archive/2026-10-22-edge-env-port-validation`
