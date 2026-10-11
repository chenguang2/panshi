# Tasks: node-management-ux-batch1

> TDD：先写失败测试（RED）验证失败，再最小实现（GREEN）。子任务行号证据出自评审轮核码，实施时以实际文件为准。

## 1. 后端与共享删除流程

- [x] 1.1 RED：`backend/tests/` 新增/扩展用例钉 `GET /nodes?search=` 仅按 IP 过滤（`ALLOWED_SEARCH_FIELDS` 不含 name）；GREEN：`nodes.py:17` 移除 `"name"`
- [x] 1.2 RED：`useClusterUtils` 节点删除确认变体测试（无勾选项、三层后果文案字面、危险色确认按钮、AppModal 形态）；GREEN：实现 `showNodeDeleteConfirm`（复用 AppModal，禁再造手写 overlay）
- [x] 1.3 `NodeList.handleDelete`：拆自建 `showConfirm` 硬编码（:1126-1132），改走 `showNodeDeleteConfirm` + `executeDeleteWithProgress`（API 固定 `delete_db:true, delete_edge:false`）
- [x] 1.4 `useClusterNodes.deleteNode`：替换安慰剂勾选版 `showDeleteConfirm`（:401-425），两入口统一走 `showNodeDeleteConfirm`；进度弹窗保持 `executeDeleteWithProgress`

## 2. NodeList 页面快修

- [x] 2.1 `handleEdit` 重置全部 formErrors（收敛为遍历重置，含 openresty_path）；测试断言编辑态无残留错误
- [x] 2.2 全文件清点手写 detail 解析（:536-538、:697-699 等）统一换 `getApiErrorMessage`；测试断言 Pydantic 数组 detail 展示字段原因
- [x] 2.3 校验文案「请输入 Nginx 安装路径」→「请输入 OpenResty 安装路径」（:665；必填保持）
- [x] 2.4 删除 `.operation-log` 死 UI：模板 :121-125、`opLogVisible` :429、样式 :1268-1282
- [x] 2.5 双计数收敛：筛选栏计数仅在筛选生效时显示「筛出 X 个」；分页器 showTotal 保留
- [x] 2.6 命令预览去硬编码：fallback 串改相对路径 `-i inventory`（:756/:870）；SSH 腿去 `jboss@`/`~/.ssh/id_rsa`（:877-891，改 `ssh -p {port} {ip}` 通用形态）；`data.command` 优先回退保留
- [x] 2.7 emoji 操作图标换 AntDV 图标（🔍/▶/⏹/⟳/⋯ → SearchOutlined/PlayCircle/PauseCircle/ReloadOutlined/MoreOutlined）；`.node-filter-bar` `flex-wrap: nowrap` → `wrap`（:1234）

## 3. 流式展示

- [x] 3.1 NodeList `onLine` 消费侧过滤结构化事件（可 JSON.parse 且含 `type` 的行不入 `execLogs` 展示；complete 等业务分支保留）；测试断言日志区无 JSON 原文
- [x] 3.2 `NodeExecutionResultDrawer` 增加 `mode?: 'install'|'action'|'auto'` prop（默认 `'auto'` 保持 `startsWith('安装')` 兜底）；NodeList 安装类调用显式传 `install`、「关联新OpenResty/添加版本包/切换版本」三处传 `action`（:993/:1212/:1219）；测试断言三类操作走动作摘要模板

## 4. Tab 批量导入口径

- [x] 4.1 批量导入预览表行校验：`openresty_path` 为空 → 行标红报错（对齐单表单必填决策；默认值预填行为不变）；测试断言空值行标红

## 5. 全量验证

- [x] 5.1 后端：`cd backend && uv run pytest`（全量；如遇失败按约定 #175/#196 协议单跑判定）
- [x] 5.2 前端：`npx vue-tsc -b` 零错误 + `npx vitest run` 全量（首跑失败按 #196 串行复跑判定）
- [x] 5.3 实页验收（Playwright 直连 12345）：① 独立页删除走方案 A 弹窗（三层后果文案 + 进度弹窗 + DB 验证行已删）；② Tab 删除同弹窗无勾选项；③ 搜索占位「搜索 IP...」且名称搜索入口消失；④ 编辑任一节点表单无残留红字；⑤ 命令页签无 /home/qcg 硬编码；⑥ 三类流式操作摘要为动作模板
