# Tasks

## 1. 路由与侧边栏（TDD 先行）

- [x] 1.1 RED→GREEN：`router/__tests__/index.test.ts` 先补用例（`ssl_cert` 启用时注册 `/ssl/ca`、`/ssl/server`、`/ssl` redirect→`/ssl/server`；禁用时三者均不注册），再将 `featureRouteMap.ssl_cert` 改数组三条目（仿 `metrics` 先例）；`npx vitest run router/__tests__/index.test.ts` 全绿（另：navMeta 搜索索引同步登记 CaCertList/ServerCertList，移除 SslList）
- [x] 1.2 RED→GREEN：`components/__tests__/AppSidebar.test.ts` 先补用例（「证书管理」分组出现在核心功能之后且含 CA 根证书/服务器证书两项、核心功能不再含「SSL 证书」、`ssl_cert` 关闸后分组整体隐藏），再改 `AppSidebar.vue` navSections；该测试文件全绿（18/18）

## 2. 下载工具与共享组件（TDD 先行）

- [x] 2.1 `utils/download.ts`：新增证书文件命名工具（`.crt` 后缀、`application/x-x509-ca-cert` MIME、`{集群名}_{证书名}.crt` 拼装）；**`buildCertZip` 保持通用不收窄**（key 分支供生成后交付/客户端证书包使用），无私钥约束落在下载入口 UI 层；单测断言文件名与「下载弹窗路径无私钥产物」
- [x] 2.2 新建 `components/SslCertCard.vue`（顶栏/CN 或 SNI/算法/有效期徽章/签发 CA 行/操作栏 slot，CA 与服务器证书两形态共用）；组件测试覆盖 CA 形态隐藏 SNI/类型行、签发 CA 行点击 emit、`ca_cert_id` 无效显示「—」
- [x] 2.3 RED→GREEN 重做 `SslCertDownloadDialog.vue`：先做**消费方全量核对**（grep `SslCertDownloadDialog`/`buildCertZip`/`downloadPem`/`fetchSslPrivateKey`，已核全集：SslList→两页、SslViewDrawer、SslGenerateDialog、auth-session.test 守卫，约定 #217）；组件测试断言「无私钥选项」「选项名 `.crt` 后缀」「失效警示块与『下载 CA 根证书』按钮存在」「单证书直下不调 jszip、国密双证书打 zip 且内部仅两个 .crt」「client 类型卡片不出入口」，再实现；删除组件内 `fetchSslPrivateKey` 调用；同步各消费方既有断言
- [x] 2.4 `SslViewDrawer.vue`：证书/签名证书下载后缀改 `.crt`；**CA 下载文件名统一 `{集群名}_{证书名称}.crt`**（替换现状 `{name}_ca.crt`，抽屉内补集群名查找）；私钥/签名私钥保持 `.pem` 与高风险确认流程不变，确认弹窗补「CA 私钥绝不可分发给用户」；「下载客户端证书包」保持不变；更新该组件既有测试中的文件名断言

## 3. 两个视图页（TDD 先行）

- [x] 3.1 新建 `views/CaCertList.vue`（绿色分发横幅 + 安装指引折叠面板四段文案（Windows/macOS/Chrome/Linux；Chrome 段为浏览器内导入安装，无 Firefox） + 卡片单文件直下 + 临期红色警示条 ≤30 天 + 空态创建引导 + 创建 CA 根证书入口 + **删除确认含「仍被 N 张服务器证书引用」软提示**）；组件测试断言横幅文案、指引含 Chrome 段且不含 Firefox、临期警示条渲染、删除引用提示计数、下载调用单文件工具
- [x] 3.2 新建 `views/ServerCertList.vue`（琥珀警示横幅（含客户端证书指引句）+ 前端 `ca_cert_id→name` 映射签发 CA 行 + **client 卡片隐藏「下载证书」按钮** + 迁入既有上传/生成/发布/版本/删除流程 + 生成框内「创建 CA」成功后停留本页、对话框保持打开、CA 下拉自动刷新）；组件测试断言横幅与跳转、签发 CA 行、client 下载入口排除、生成框创建 CA 联动、既有 CRUD 冒烟（mock URL 感知，约束 #43）
- [x] 3.3 删除 `views/SslList.vue` 并清理引用：`grep -rn "SslList\|'/ssl'" frontend/src frontend/e2e` 清零（跳转改 `/ssl/server`）；`npx vue-tsc -b` 零错误

## 4. 收口验证

- [x] 4.1 前端全量单测串行收口：`cd frontend && npx vitest run --no-file-parallelism` 全绿（含 AppSidebar/router/下载弹窗/两视图测试）
- [x] 4.2 构建验证：`cd frontend && npm run build` 成功
- [x] 4.3 E2E 更新与运行：ssl 相关 spec 改 `page.goto('/ssl/server')`/`/ssl/ca`（约束 #102）并跑通相关 spec；后端 `cd backend && uv run pytest tests/test_security_guard.py tests/test_ssl_expiry.py -q` 确认零改动不受影响
- [x] 4.4 真页走查（对照示例页语义）：`http://localhost:12345` 侧边栏「证书管理」两页横幅/指引/下载 `.crt`（检查无 key、文件名正确）/弹窗警示块/CA 快捷按钮/签发 CA 跳转/旧链接 `/ssl` 重定向，截图留档
- [x] 4.5 `openspec validate --all` 0 error 收口
- [x] 4.6 用户手册截图更新：SSL 章节相关图（菜单挪入「证书管理」分组、两页横幅、新下载弹窗）经 `cd frontend && node scripts/manual-screenshots.mjs --only <ssl 相关分组>` 重截并核对 `docs/user-manual/` 引用
