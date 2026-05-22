## Why

当前所有启动/停止脚本硬编码了 `9000` 端口。部署场景中可能出现端口冲突（比如 9000 已被占用），需要能灵活指定端口。

## What Changes

- start 脚本支持通过命令行参数、环境变量 `PANSHI_PORT`、端口文件三种方式指定端口
- stop 脚本通过优先级链（参数 > 环境变量 > 端口文件 > 默认值）自动获取目标端口
- 端口文件和 PID 文件统一存放到 `backend/` 目录下
- `backend/.gitignore` 加上 `.port`、`.pid` 排除规则
- 默认端口 `9000` 作为脚本顶部的变量，方便后续修改

## Capabilities

### New Capabilities
- `configurable-port`: 启动/停止脚本端口配置功能，支持通过多种方式指定端口

### Modified Capabilities

无。本次不涉及已有 spec 的行为变更。

## Impact

- `prepare/linux/start.sh`：添加端口参数解析逻辑，修改 uvicorn 启动命令
- `prepare/linux/stop.sh`：添加端口优先级链读取，PID 文件路径改为 `backend/.pid`
- `prepare/windows/start.ps1`：添加端口参数解析，写入端口文件
- `prepare/windows/stop.ps1`：添加端口优先级链读取
- `backend/.gitignore`：新增 `.port` 和 `.pid` 忽略规则
