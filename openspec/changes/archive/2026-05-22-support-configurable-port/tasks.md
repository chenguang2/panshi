## 1. 基础设施

- [x] 1.1 在 `backend/.gitignore` 中添加 `.port` 和 `.pid` 忽略规则

## 2. Linux 脚本

- [x] 2.1 修改 `prepare/linux/start.sh`：添加 `DEFAULT_PORT` 变量 + 端口优先级链 + 写入 `backend/.port` + PID 文件改到 `backend/.pid`
- [x] 2.2 修改 `prepare/linux/stop.sh`：添加端口优先级链 + 从 `backend/.pid` 读取 PID + 从 `backend/.port` 读取端口

## 3. Windows 脚本

- [x] 3.1 修改 `prepare/windows/start.ps1`：添加 `$DEFAULT_PORT` 变量 + 端口优先级链 + 写入 `backend/.port`
- [x] 3.2 修改 `prepare/windows/stop.ps1`：添加端口优先级链 + 从 `backend/.port` 读取端口

## 4. 验证

- [ ] 4.1 测试 Linux 脚本：默认端口启动/停止、自定义端口启动/停止、环境变量、文件读取
- [/] 4.2 测试 Windows 脚本：语法通过，需在实际环境验证
  - start.ps1 无参数 → 默认 9000
  - start.ps1 8080 → 8080 端口启动
  - $env:PANSHI_PORT=3000; start.ps1 → 3000 端口启动
  - stop.ps1 → 读 backend/.port 停对应端口
