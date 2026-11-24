# Design

## D1 单一事实源与两腿收敛

上限只有一个来源：`features.yaml` 的 `limits.static_zip_max_mb`（`features.static_zip_max_mb()`，mtime 热加载，static-zip-limit-config 已落地）。本变更把它分别投影到「Edge 直连腿」与「中继网关腿」：

| 腿 | 上限由谁生效 | 本变更后 |
|---|---|---|
| 上传（浏览器→平台） | 后端校验 + 前端预检 | 不变（已消费同一配置） |
| 直连发布（平台→Edge:management_port） | Edge pack `nginx_server_monitor.conf` **server 级** 32m，可被 `deploy.http.admin.client_max_body_size` 覆盖 | 部署 edge.env 时自动对齐 |
| 经中继发布（平台→网关:8443→Edge） | 网关 nginx server 块 | 渲染时写入 `client_max_body_size {N}m` |

## D2 生效上限公式（诊断口径）

```
admin = deploy.http.admin.client_max_body_size（存在则解析为 MB）
effective = admin if admin is not None else 32      # Edge pack 基线，硬常量 EDGE_ADMIN_BASELINE_MB = 32
sufficient = effective >= platform_mb
```

要点：**http 级的 `client_max_body_size` 不参与判定**——pack 的 server 级 32m 恒覆盖它。这一点必须写进 `note` 文案，否则用户会重复 2026-11-23 的踩坑。基线常量单点定义 + 注释「实测值，pack 升级需复核」。

## D3 注入必须是文本级，不能 YAML round-trip

edge.env 是人工编辑的 YAML，含大量注释与顺序语义（如 `## http 模块…` 说明块）。`yaml.safe_load` + `yaml.safe_dump` 会丢注释、重排键序，属于不可接受的副作用。因此：

1. 先用既有 `validate_edge_env()` 校验（YAML 合法 + 必填结构存在）；不合法则按现状报错，不做任何写入。
2. 再用**行扫描**定位：顶层 `http:` → 其下的 `admin:`（同为 http 的子键，缩进相等）→ 在 `admin:` 子块内找 `client_max_body_size:`。
3. 命中 → 仅替换该行的值部分；未命中 → 在 `admin:` 行之后插入一行，缩进取 `admin:` 下第一个子行的缩进（无子行则 `admin:` 缩进 + 2）。
4. 返回 `(new_content, action, current_mb)`，`action ∈ {inserted, kept, absent}`——**只在缺失时写（inserted），已存在一律 kept 原样返回**（2026-11-24 用户裁决 B：显式更低值属运维刻意收紧，平台不得静默覆盖；落差交三处告警）。非 http.admin 结构的异常情况走 `absent` 并只记录说明，不猜测改写。

约束：插入点不跨越其它块；只处理「第一个 http.admin」；重复键已在既有校验覆盖范围外，出现多个 `admin:` 时按首个处理并在说明里注明（防御，不报错）。

## D4 部署链注入位置与回报

`deploy_edge_env` 现状：取 `request.content` → 作为 `env_content` extravars 下发。注入放在**校验通过之后、渲染 extravars 之前**，注入后的内容才下发（节点落盘即对齐后的内容，用户下次「读取节点配置」看到的就是真值，闭环）。回报两条途径：
- SSE：注入发生时在流首部推一行 `{line: "已自动补齐 http.admin.client_max_body_size: 132m（平台上限 32 → 132）"}`；
- 响应/审计：`edge_env` 版本记录里写入实际下发内容（现状已记录），无需新字段。

若平台上限本身 ≤ 32（缺省），注入仅在「admin 段存在且更小」或「缺失且 http 段更大」时有意义；缺失时仍写入平台值（幂等、把真相显式化），不做「什么都不写」的优化——因为 pack 基线是隐藏陷阱，显式写出更利于后续排障。

## D5 读取态诊断

`GET /clusters/{id}/edge-env` 响应加 `limits` 对象（Pydantic 模型 `EdgeEnvLimits`）：`platform_mb`、`admin_mb: int|None`、`effective_mb`、`sufficient: bool`、`note: str`。解析同 D2（纯函数复用）。前端在状态条旁渲染：充足 → 灰字「Edge 上传上限 132MB（已对齐）」；不足 → 警示条「Edge 实际上限 32MB，低于平台 132MB：直连发布大文件会 413；部署时会自动补齐」。

## D6 前端编辑态提示

编辑器内容变化时用同一判定（TypeScript 纯函数 `parseAdminBodyLimit(content)`，写在 `utils/edgeEnvLimits.ts`，与后端公式逐字对齐并有单测；不做「本地自动改写内容」——写入只发生在部署时，避免编辑器里静默改用户文本）：
- 未配置/低于平台 → 「部署时将自动补齐到 {N}MB」；
- 已够 → 不提示。

## D7 中继网关 leg

`relay_init.render_relay_server_conf` 在 `server { … }` 内加 `client_max_body_size {N}m;`（N 取 `static_zip_max_mb()`）。`config-preview` 已复用该函数（relay.py 预览与 init 同源），故自动一致；`test_relay_init.py` 现有结构断言需增该行（断言反转清单见 tasks）。

注意：网关机上若运维手工调过该值，再次「初始化网关」会以平台值为准重写——与现有 `relay_8443.conf` 整文件幂等覆盖语义一致，属既定行为，写进文档。

## D8 断言反转清单（#217，落地前已 grep）

| 位置 | 现状 | 处理 |
|---|---|---|
| `tests/test_relay_init.py::test_render_relay_server_conf_structure` | 断言 server 块结构（可能逐行/含子串） | 补 `client_max_body_size 132m;` 断言（默认平台值 32 下为 32m，测试内 pin 平台值） |
| `tests/test_relay_init.py::test_render_relay_server_conf_port_parametrized` | 端口参数化 | 不受影响，确认即可 |
| `tests/test_edge_env*.py` 部署用例 | 断言下发内容 == 提交内容 | 改为断言「下发内容 = 注入后内容」；新增未注入场景保持逐字相等（平台上限 ≤ admin 值时） |
| `frontend` EdgeEnv 用例 | 状态条文案断言 | 新增警示条用例，旧断言不动（新 DOM 节点） |

## D9 不做的事

- 不做发布前逐节点读 edge.env 的实时探测（每节点一次 ansible，代价与失败面都高）；诊断只在「读取/编辑/部署」三个已有互动的时刻给出。
- 不改 Edge pack、不落库 edge.env 副本（现有读取即取即用）。
- 不做「自动重启 Edge」——注入后仍按现有流程 `bin/edge init` + `reload`（既有 playbook 语义不变）。
