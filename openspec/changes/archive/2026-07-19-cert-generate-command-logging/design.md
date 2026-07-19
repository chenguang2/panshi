## Context

当前证书生成流程中，后端执行 openssl 命令（本地 subprocess 或远程 SSH），生成成功后直接返回证书并保存到数据库。整个过程中，所有执行过的命令和输出都仅存在于内存中，没有持久化记录。当出现问题时（如远程节点 openssl 版本不兼容、SM2 曲线不支持等），运维人员无法追溯当时具体执行了什么命令、哪个步骤失败。

项目中已有两套日志机制：
- **标准 Python logging**：`logging.getLogger(__name__)` 写入 `logs/app.log`
- **EdgeLogger**：自定义类写入 `logs/edge/*.log`，专用于 Edge 发布操作审计

证书生成命令日志不属于 Edge API 交互，不使用 EdgeLogger。

## Goals / Non-Goals

**Goals:**
- 所有证书生成的 openssl 命令（含参数、退出码、stdout/stderr）记录到日志文件，便于事后排查
- API 响应中返回命令执行记录，前端可实时展示
- 前端进度条从假 setTimeout 改为基于真实命令执行状态的展示
- 证书详情中可查看该证书的生成命令记录（命令日志持久化到 DB）

**Non-Goals:**
- 不改变"生成并保存"的单按钮操作流程（不拆分按钮）
- 不做 WebSocket 流式推送（生成过程短暂，不需要流式更新）
- 不修改 openssl 命令本身的逻辑

## Decisions

### Decision 1: 命令日志的数据结构

使用统一的结构记录每个步骤：

```python
class CommandLogEntry(BaseModel):
    step: str        # 步骤名称，如 "探测 openssl"、"生成密钥对"、"生成 CSR"、"签发证书"
    command: str     # 完整命令行（参数已展开）
    exit_code: int   # 退出码
    stdout: str      # 标准输出（前 500 字符，过长时截断）
    stderr: str      # 标准错误（完整保留）
```

**理由**：简单、自包含，前后端共用同一个类型定义（后端 Pydantic 模型）。

### Decision 2: 日志写入方式 — 复用 Python logging

**不**使用 `EdgeLogger`，证书生成日志与 Edge API 无关。

改用 `logging.getLogger("cert_generate")` + 独立 `FileHandler` 写入 `logs/cert_generate.log`。每行一条 JSON，格式为 JSON Lines：

```json
{"time":"2026-07-19 10:00:00","cluster_id":1,"cluster_name":"prod","cert_name":"mycert","step":"生成密钥对","command":"/path/openssl ecparam -genkey -name SM2 -out ...","exit_code":0,"stderr":""}
```

**理由**：
- 复用 Python logging 基础设施，线程安全由 logging 模块保证
- JSON Lines 每行独立，grep 友好
- `propagate = False` 不重复写入 `app.log`
- 与 `EdgeLogger` 解耦，不增加其复杂度

### Decision 3: 命令日志同时落地文件 + API 返回 + DB 持久化

三层：

| 层 | 存储方式 | 用途 |
|---|---|---|
| 文件 | `logs/cert_generate.log`（JSON Lines） | 事后排查，不依赖任何服务 |
| API 响应 | `generate_log: list[CommandLogEntry]` | 前端实时展示 |
| DB | `SslCertificate.generate_log` Text 字段存 JSON | 证书详情页历史追溯 |

**理由**：
- 文件日志解决运维排查需求，保留完整历史
- API 返回解决"实时展示"需求
- DB 持久化解决"证书详情页查看历史命令"需求，用户可随时回查

### Decision 4: 本地生成模式收集命令日志

`cert_generator.py` 中的 `_run_openssl()` 当前返回 `subprocess.CompletedProcess`。修改为返回增强类型，携带命令字符串、退出码、stdout、stderr。上层调用方（`_generate_local()`）收集这些记录。

所有调用 `_run_openssl()` 的函数（`generate_sm2_keypair`、`generate_csr`、`self_sign_certificate`、`detect_openssl` 检测命令等）均改为收集并返回命令日志。

**包括 openssl 探测阶段的命令**：`_check_sm2_support()`、`_detect_flavor()` 等调用的 `_run_openssl()` 也在记录范围内。探测失败时仍然记录已执行的命令。

### Decision 5: 远程生成模式收集命令日志

保持单脚本（不改远程执行方式），在脚本中插入标记分隔符，后端解析 stdout 分割出每个步骤的日志。

标记格式：
```bash
echo "===PASHI_STEP:genkey==="
openssl ecparam -genkey -name SM2 -out enc.key
echo "===PASHI_EXIT:$?==="
```

`===PASHI_` 前缀用于降低与 openssl 输出的冲突概率。按步骤解析 stdout 后，每个步骤独立记录 command、exit_code、stderr。

### Decision 6: DB 持久化命令日志

`POST /clusters/{id}/ssl/generate` 生成成功后，`generate_log` 序列化为 JSON 存入 `SslCertificate` 模型的 `generate_log` Text 字段。

`GET /clusters/{id}/ssl/{cert_id}` 返回的 `SslCertificateResponse` 中也包含该字段，供前端证书详情弹窗展示。

### Decision 7: 前端使用真实命令替换假进度

当前 `SslGenerateDialog.vue` 中的进度条步骤是固定的 5 步，用 `setTimeout` 模拟。

修改为：前端调用 API 后，等待响应返回，用 `generate_log` 中的步骤列表替换固定步骤，显示每个步骤的 command、exit_code、output。由于生成过程是同步的（API 阻塞式返回），所有步骤在响应中一次性返回，前端直接渲染完整的步骤结果。

**不采用轮询/流式**：一个证书生成通常在 1-3 秒内完成，流式推送的复杂度 > 收益。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 远程模式分步采集命令需多次 SSH 连接，增加延迟 | 保持单脚本，用 `===PASHI_` 标记解析 stdout 分割步骤 + `===PASHI_EXIT:` 捕获独立退出码 |
| 命令日志中可能包含敏感信息（如私钥） | 日志中只记录命令本身和退出码/错误输出，不记录私钥 PEM 内容 |
| `generate_log` 字段增大 API 响应体积（PEM 已经很大了） | 命令日志通常是几行文本，对响应体积影响可忽略 |
| 前端一次性渲染所有步骤无法展示"进行中"动画 | 改为"已完成"步骤展示 + 最终结果，不做流式 |
| DB 存储命令日志增大单条记录体积 | Text 字段存储 JSON 字符串，典型证书步骤 5-10 条命令，体积可控 |
