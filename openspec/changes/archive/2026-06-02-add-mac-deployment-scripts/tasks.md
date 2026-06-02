## 1. macOS 部署准备脚本

- [x] 1.1 创建 `product/mac/gen-mac.sh`，基于 `product/linux/gen-linux.sh` 适配 macOS
- [x] 1.2 修复 macOS `venv --copies` 的 SIGABRT 问题：使用 `--without-pip` 创建，手动拷贝 `libpython3.11.dylib`，再运行 `ensurepip`
- [x] 1.3 修正 `sed -i ''` 为 macOS 语法（Linux 用 `sed -i` 但 macOS 需空备份扩展名）

## 2. macOS 启动脚本

- [x] 2.1 创建 `product/mac/start.sh`，端口监听检查改用 `lsof -iTCP -sTCP:LISTEN -P -n`

## 3. macOS 停止脚本

- [x] 3.1 创建 `product/mac/stop.sh`（与 Linux 版一致，`lsof` 通用）

## 4. 验证

- [x] 4.1 运行 `bash product/mac/gen-mac.sh`，确认全部 5 步无报错
- [x] 4.2 确认生成的 `panshi/start.sh` 和 `panshi/stop.sh` 路径已修正（`SCRIPT_DIR` 而非 `SCRIPT_DIR/../..`）
