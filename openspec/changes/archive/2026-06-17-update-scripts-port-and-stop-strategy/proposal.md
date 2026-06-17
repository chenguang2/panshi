## Why

当前启动/停止脚本使用默认端口 9000，且停止脚本的端口杀进程部分缺乏进程名验证，存在误杀其他进程的潜在风险。需要统一调整端口分配并增强停止脚本的安全性。

## What Changes

- **product/** 系列脚本默认端口从 9000 改为 **12345**
- **develop/** 系列脚本后端端口改为 **12344**，前端端口改为 **12345**
- 所有 `stop.sh` / `stop.ps1` 中按端口 kill 的部分改为 **端口 + 进程名双重确认** 方式
- 改动涉及以下 10 个文件：
  - `product/linux/start.sh`、`product/linux/stop.sh`
  - `product/mac/start.sh`、`product/mac/stop.sh`
  - `product/windows/start.ps1`、`product/windows/stop.ps1`
  - `develop/linux/start.sh`、`develop/linux/stop.sh`
  - `develop/windows/start.ps1`、`develop/windows/stop.ps1`

## Capabilities

### New Capabilities
- `start-stop-scripts`: 项目启动/停止脚本的管理规范，包括端口配置策略和进程安全停止机制

### Modified Capabilities

无。已有 `configurable-port` spec 描述的是前端可配置端口的功能，与本变更不重叠。

## Impact

- **脚本**: 10 个文件需要同步修改端口号和停止逻辑
- **兼容性**: 端口号变化后，通过 9000 端口访问旧部署的用户需要更新访问地址
- **无 API 变更**: 纯脚本层改动，不影响后端接口
