## 1. 插件 Lua 实现（edge_node/handlers/static_resource.lua）

- [x] 1.1 在 schema、attr_schema、default_attr_schema、default_attr 中增加 `spa_fallback`（boolean，默认 true）与 `app_base`（string，默认空字符串）字段声明
- [x] 1.2 新增 `strip_app_base(relative_path, app_base)` 辅助函数：app_base 归一化（去尾部 `/`），相对路径以归一化前缀开头且边界为 `/` 或结尾时剥离前缀，否则返回原路径
- [x] 1.3 新增 `is_resource_request(relative_path)` 辅助函数：提取最后路径段扩展名，扩展名在 MIME_TYPES 表中 → 资源请求（不回退）；无扩展名或扩展名不在表中 → 导航请求（可回退）
- [x] 1.4 重构 `access()` 为两阶段：阶段一纯解析（不设置任何响应头）——`extractPath`（空串 → index_file，`..` → 403）→ 候选探测 → 剥离试探/app_base → SPA 回退 → 404
- [x] 1.5 实现候选探测：候选 1 `base/route_id/relative_path`、候选 2 `base/route_id/relative_path/index_file`（尾斜杠去重）、候选 3 根 index_file（SPA 回退）；open+seek 成功即命中，共用文件句柄不重复打开
- [x] 1.6 剥离试探：app_base 为空时，对 relative_path 剥第一段后再走候选探测（不递归，多段 base 靠 app_base）；原始路径命中优先
- [x] 1.7 SPA 回退：`spa_fallback=true` 且 `is_resource_request` 为 false 时尝试候选 3；目录索引拼接的 index_file 校验不含 `..`
- [x] 1.8 阶段二基于最终 filepath 设置响应：ext/content_type/etag/304/Content-Length/读取返回（MIME 与 etag 永远基于实际返回的文件）
- [x] 1.9 保留路径遍历防护（`..` → 403，剥离前检查）、ETag 条件请求、Cache-Control 逻辑；删除一切 shell 调用（无 is_directory/io.popen）

## 2. 后端插件 schema（backend/app/config/plugin_definitions.py）

- [x] 2.1 在 `static_resource` 插件定义的 properties 中增加 `spa_fallback`（boolean，default true，description 说明 SPA history 回退）
- [x] 2.2 增加 `app_base`（string，default ""，description 说明构建 base 前缀剥离，多段 base 必须配置）
- [x] 2.3 确保新增字段出现在前端插件编辑器渲染所需的 schema 结构中（不破坏现有字段）

## 3. 规格与文档同步

- [x] 3.1 确认 change 内 delta specs（static-resource-spa-serving 新增 + static-resource-serving 修改）与实现一致
- [x] 3.2 更新 `docs/edge/framework/static-resource-implementation.md`：补充 Vue SPA 包支持说明（`spa_fallback`、`app_base` 配置、单段自动剥离/多段需配置、构建 base 与路由 uri 的关系）
- [x] 3.3 在 `docs/edge/framework/static-resource-implementation.md` 写明 zip 根目录约束：解压后 `index.html` 必须在包根目录（内嵌一层 `dist/` 需重新打包；上传校验留待后续 change）
- [x] 3.4 验证 `openspec validate` 通过（spec 格式、delta 操作合规）

## 4. 部署与联调（节点 192.168.0.13）

> 已通过 SSH（jboss@192.168.0.13）完成真实部署：上传插件 → 重启 edge → 全部场景实测通过。**spa_fallback 已改为默认 true**（所有静态资源默认 SPA 兜底），配置 `{}` 时 history 路由刷新/直达正常，资源请求仍严格 404。error.log 无新增报错。

- [x] 4.1 将新 `static_resource.lua` 复制到节点 `/work/jboss/uapm/openresty/lualib/edge-root/edge/plugins/static_resource.lua`（覆盖）— 已上传（含备份 .bak.20260731220208、.bak.20260731230522）
- [x] 4.2 重启 edge 节点：`bin/edge stop && bin/edge start` — 已执行，master+4 workers 正常
- [x] 4.3 验证 `GET /` 返回 200 index.html（目录索引）— 实测 200
- [x] 4.4 验证 `GET /webTrade/assets/js/index-DAVGGJ_A.js` 返回 200（单段剥离试探，webTrade 包 base=/webTrade/）— 实测 200
- [x] 4.5 验证 `GET /webTrade/` 返回 200 index.html（剥离后空路径 → 目录索引）— 实测 200
- [x] 4.6 验证 `GET /webTrade/login`（导航请求）返回 index.html — 实测 200（spa_fallback 默认 true，含 /user/profile、/v1.0、/webTrade/index 直达）
- [x] 4.7 验证资源缺失仍 404（如 `GET /webTrade/assets/missing.js`，`.js` 在 MIME 表）— 实测 404（含 missing.css）
- [x] 4.8 验证导航路径 `/webTrade/v1.0`（扩展名不在 MIME 表）在开启 spa_fallback 后返回 index.html — 实测 200
- [x] 4.9 检查节点 `/work/jboss/uapm/uap-edge/logs` error.log 无新增报错，必要时加临时调试日志并清理 — error.log 3 行均为重启 notice，无新增 error

## 5. 回归验证

- [x] 5.1 确认普通 HTML 包（相对路径引用）常规文件访问行为不变（TestAccessBasicResolution 10 tests 覆盖）
- [x] 5.2 确认 `backend/app/config/plugin_definitions.py` 改动不影响后端测试（静态资源相关测试全通过；test_plugin_switches 3 个失败为 stash 基线验证过的预存环境问题，与本次改动无关）
- [x] 5.3 确认 `openspec status --change` 显示 apply-ready（4/4 artifacts complete）
