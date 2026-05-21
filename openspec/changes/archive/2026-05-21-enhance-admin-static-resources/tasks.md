## 1. zip 格式校验

- [ ] 1.1 在 `handle_upload` 中添加 zip 魔数检查（前 4 字节 `PK\x03\x04`）
- [ ] 1.2 非 zip 文件返回 400 + `{ error_msg = "only zip files are supported" }`

## 2. shell 命令安全

- [ ] 2.1 为 `remove_directory`、`extract_zip`、`ensure_directory` 中的 shell 路径做转义

## 3. 解压结果校验

- [ ] 3.1 解压后检查目标目录是否有文件，空目录返回错误
- [ ] 3.2 清理空目录

## 4. 错误日志完善

- [ ] 4.1 关键操作失败时记录详细错误信息
