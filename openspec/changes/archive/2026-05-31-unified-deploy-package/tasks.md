## 1. gen-linux.sh 输出目录改造

- [x] 1.1 修改 `TARGET_DIR` 为 `$SCRIPT_DIR/panshi`
- [x] 1.2 添加 `backend/ansible/` 拷贝到部署包
- [x] 1.3 添加 editable install `.pth` 相对路径修正步骤
- [x] 1.4 POSIX 兼容：`&>` 替换为 `>/dev/null 2>&1`
- [x] 1.5 更新注释和帮助信息中的路径提示

## 2. 启停脚本兼容性修复

- [x] 2.1 start.sh: `&>` 替换为 POSIX 语法
- [x] 2.2 stop.sh: 确认无 `&>` 残留

## 3. 配套文件更新

- [x] 3.1 `.gitignore`: 忽略路径从 `product/panshi/` 改为 `product/linux/panshi/`

## 4. 演示数据库清理

- [x] 4.1 清理 `sample.db`，仅保留 admin 用户和系统字典数据
