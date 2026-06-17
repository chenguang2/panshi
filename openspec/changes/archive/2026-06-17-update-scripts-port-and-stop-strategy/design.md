## Context

项目现有 10 个启动/停止脚本分布在 product/ 和 develop/ 目录下，覆盖 Linux、macOS、Windows 三种平台。当前默认端口为 9000，product/ 和 develop/ 共用同一端口，在同时运行开发和部署版本时会产生冲突。

停止脚本目前使用两层策略：
1. PID 文件 → `kill` (SIGTERM，优雅停止)
2. 端口查杀 → `lsof -ti:$PORT | xargs kill -9`（强杀兜底）

第二层纯按端口强杀，不做进程身份验证，存在误杀其他监听同端口进程的潜在风险。

## Goals / Non-Goals

**Goals:**
- 统一端口分配：product → 12345，develop → 后端 12344 + 前端 12345
- 改造停止脚本第二层：按端口找到 PID 后，验证进程名再杀
- 保持现有 PID 文件优雅停止逻辑不变
- 覆盖 Linux、macOS、Windows 三种平台

**Non-Goals:**
- 不改变启动/停止脚本的整体架构和流程
- 不引入 systemd 管理（已有独立 service 文件）
- 不修改 Docker 部署配置

## Decisions

### Decision 1: 进程名验证方式

| 方案 | Linux | macOS | Windows |
|---|---|---|---|
| `/proc/$PID/cmdline` 匹配 | ✅ 原生支持 | ❌ 不支持 | ❌ |
| `ps -p $PID -o command=` | ✅ 兼容 | ✅ 兼容 | ❌ |
| `pkill -f "app.main:app"` | ✅ 但会全量扫描 | ✅ 同左 | ❌ |
| `Get-Process` + `CommandLine` | ❌ | ❌ | ✅ |

**决定：平台差异化方案**

- **Linux**: 使用 `/proc/$PID/cmdline` 验证，读取进程命令行并匹配 `app.main:app`
- **macOS**: 使用 `ps -p $PID -o command=` 验证（`/proc` 不可用）
- **Windows**: 使用 `Get-Process -Id $PID` 并通过 `CommandLine` 属性筛选（需通过 WMI 或 `Get-CimInstance`）

```bash
# Linux 实现 (product/linux/stop.sh)
PID=$(lsof -ti:"$PORT" 2>/dev/null)
if [ -n "$PID" ]; then
    # 双重确认：进程命令行包含 app.main:app
    if tr '\0' ' ' < /proc/$PID/cmdline 2>/dev/null | grep -q "app\.main:app"; then
        kill -9 "$PID" 2>/dev/null || true
    fi
fi
```

```bash
# macOS 实现 (product/mac/stop.sh)
PID=$(lsof -ti:"$PORT" 2>/dev/null)
if [ -n "$PID" ]; then
    # macOS 下用 ps 替代 /proc
    if ps -p "$PID" -o command= 2>/dev/null | grep -q "app\.main:app"; then
        kill -9 "$PID" 2>/dev/null || true
    fi
fi
```

```powershell
# Windows 实现 (product/windows/stop.ps1)
$conn = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($conn -and $conn.OwningProcess -gt 0) {
    $proc = Get-CimInstance -Query "SELECT * FROM Win32_Process WHERE ProcessId = $($conn.OwningProcess)"
    if ($proc.CommandLine -match "app\.main:app") {
        Stop-Process -Id $conn.OwningProcess -Force
    }
}
```

### Decision 2: develop/ 脚本的端口变量化

develop/ 系列脚本当前是硬编码端口，趁这次改为使用变量：

- `develop/linux/start.sh`: 提取 `BACKEND_PORT=12344` + `FRONTEND_PORT=12345` 变量
- `develop/linux/stop.sh`: 改为从变量读取端口，而非硬编码
- `develop/windows/start.ps1`: 同样提取为 `$BACKEND_PORT = 12344` + `$FRONTEND_PORT = 12345`
- `develop/windows/stop.ps1`: 同理

### Decision 3: 保持 product/ 脚本的端口灵活性

`product/*/start.sh` 和 `stop.sh` 保留现有 `DEFAULT_PORT` + 命令行参数 + 环境变量的优先级覆盖机制，仅将默认值从 9000 改为 12345。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| `/proc/$PID/cmdline` 在部分容器环境不可读 | 读取失败时跳过，不执行 kill，避免误杀 |
| Windows `Get-CimInstance` 可能权限不足 | 降级为不做进程名验证，仍按端口 kill（保持现状行为） |
| macOS `lsof` 输出格式在不同版本有差异 | 使用 `lsof -ti:"$PORT"`（简洁格式，跨版本稳定） |
| 已有用户习惯 9000 端口 | 非兼容变更，需在发布说明中标注 |
| develop/ 后端 12344 可能与其他开发工具冲突 | 12344-12345 非常见应用端口范围，冲突概率极低 |
