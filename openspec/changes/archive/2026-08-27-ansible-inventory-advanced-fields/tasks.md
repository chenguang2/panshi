# Tasks

## 1. 后端（TDD）

- [x] 1.1 RED：`KNOWN_HOST_KEYS` 常量（12 键含 ip）；parse 的 unknown_keys 只收清单外键——含 `ansible_port` 等常用键的样例不再进 unknown_keys
- [x] 1.2 GREEN：实现常量替换与判定调整
- [x] 1.3 RED+GREEN：PUT 规范化与校验——port 数字字符串→int、become yes/no→bool、越界 400、connection 自由文本放行、空串键不写入 YAML
- [x] 1.4 回归：inventory 相关测试全量通过（57 passed；顺带修复存量环境依赖失败 test_put_hosts_vars_renders_to_file）

## 2. 前端

- [x] 2.1 行展开"高级设置"表单（端口数字框、connection 下拉可自定义输入、become 开关、文本字段；ansible_host 附含义提示），有高级值的行展开图标高亮
- [x] 2.2 已知键不再显示"含自定义字段"标签；标签文案指向源码模式
- [x] 2.3 vitest：高级字段编辑/清空删键/校验错误展示

## 3. 验证

- [x] 3.1 端到端：API 提交字符串端口 → 文件写入 int 11022、GET 回读 int、unknown_keys 清空；清空后恢复（以文件级验证替代真实节点任务，避免触碰生产节点）
- [x] 3.2 全量回归：pytest 1378 passed；vitest 失败均为存量基线（与改动零交集）；vue-tsc 通过
