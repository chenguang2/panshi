## 1. product/ Linux 脚本

- [x] 1.1 `product/linux/start.sh`: 修改 `DEFAULT_PORT=9000` 为 `DEFAULT_PORT=12345`
- [x] 1.2 `product/linux/stop.sh`: 修改 `DEFAULT_PORT=9000` 为 `DEFAULT_PORT=12345`
- [x] 1.3 `product/linux/stop.sh`: 改造端口兜底部分，添加 `/proc/$PID/cmdline` 进程名验证

## 2. product/ macOS 脚本

- [x] 2.1 `product/mac/start.sh`: 修改 `DEFAULT_PORT=9000` 为 `DEFAULT_PORT=12345`
- [x] 2.2 `product/mac/stop.sh`: 修改 `DEFAULT_PORT=9000` 为 `DEFAULT_PORT=12345`
- [x] 2.3 `product/mac/stop.sh`: 改造端口兜底部分，添加 `ps -p $PID -o command=` 进程名验证（macOS 兼容）

## 3. product/ Windows 脚本

- [x] 3.1 `product/windows/start.ps1`: 修改 `$DEFAULT_PORT = 9000` 为 `$DEFAULT_PORT = 12345`
- [x] 3.2 `product/windows/stop.ps1`: 修改 `$DEFAULT_PORT = 9000` 为 `$DEFAULT_PORT = 12345`
- [x] 3.3 `product/windows/stop.ps1`: 改造端口停止部分，添加 `Get-CimInstance Win32_Process` 进程名验证

## 4. develop/ Linux 脚本

- [x] 4.1 `develop/linux/start.sh`: 提取端口为变量 `BACKEND_PORT=12344` `FRONTEND_PORT=12345`，替换所有硬编码端口
- [x] 4.2 `develop/linux/stop.sh`: 提取端口为变量，替换硬编码的 `lsof -ti:9000` 和 `lsof -ti:9100`；添加进程名验证

## 5. develop/ Windows 脚本

- [x] 5.1 `develop/windows/start.ps1`: 提取端口为变量 `$BACKEND_PORT = 12344` `$FRONTEND_PORT = 12345`，替换所有硬编码端口
- [x] 5.2 `develop/windows/stop.ps1`: 提取端口为变量，替换硬编码端口；添加进程名验证

## 6. 改进 product/ start.sh pre-start kill 逻辑

- [x] 6.1 `product/linux/start.sh`: pre-start kill 增加进程名双重确认
- [x] 6.2 `product/mac/start.sh`: pre-start kill 增加进程名双重确认

## 7. 验证

- [x] 7.1 检查所有脚本的端口号修改正确
- [x] 7.2 检查所有 stop 脚本的进程名验证逻辑正确
- [x] 7.3 检查所有 start 脚本的 pre-start kill 进程名验证逻辑正确
