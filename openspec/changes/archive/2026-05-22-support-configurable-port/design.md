## Context

当前 Linux（`start.sh`、`stop.sh`）和 Windows（`start.ps1`、`stop.ps1`）共 4 个部署脚本全部硬编码 `9000` 端口。当端口被占用或需要多实例时，用户无法灵活指定端口。

## Goals / Non-Goals

**Goals:**
- 4 个脚本均支持通过命令行参数、环境变量 `PANSHI_PORT`、端口文件三种方式指定端口
- stop 脚本自动获取上次使用的端口，无需手动传参
- 端口文件和 PID 文件存放于 `backend/` 目录，跟随项目迁移
- 向后兼容：不传参时行为与当前完全一致

**Non-Goals:**
- 不修改 develop 目录下的开发脚本（后续可按需同步）
- 不涉及前端代码
- 不涉及后端代码
- 不修改 API 路由

## Decisions

### Decision 1: 端口获取优先级

所有脚本统一使用以下优先级链：

```
1. 命令行参数（显式指定） $1 或 $args[0]
2. 环境变量 PANSHI_PORT
3. 端口文件 backend/.port
4. 脚本默认值 DEFAULT_PORT=9000
```

### Decision 2: 端口文件位置

选择 `backend/.port` 而非 `/tmp/` 或 `~/.config/`。

理由：
- 跟随项目目录，打包部署时端口配置自动携带
- 多项目实例互不干扰
- 添加 `.gitignore` 避免误提交

### Decision 3: PID 文件迁移

Linux 的 PID 文件从 `/tmp/panshi_backend.pid` 迁移到 `backend/.pid`。

理由：
- 跟随项目目录，多实例不冲突
- 与端口文件在同一目录，逻辑一致
- 部署包拷贝后 PID 文件自动失效（新启动会覆盖）

## Risks / Trade-offs

- **[风险] 端口文件过时**：如果手动 kill 进程后未更新端口文件，stop 可能读到错误的端口 → stop 读取端口后验证端口是否有进程监听，无则提示并兜底默认值
- **[风险] 环境变量污染**：`PANSHI_PORT` 可能在 shell 中残留 → 只在脚本内部读取，不导出到子进程
