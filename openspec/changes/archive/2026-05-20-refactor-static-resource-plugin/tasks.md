## 1. 修复代码结构和变量定义

- [ ] 1.1 补全 `attr_schema` 变量定义，修复第 123 行的引用错误
- [ ] 1.2 修正 `check_schema()` 方法，使其正确校验配置 schema
- [ ] 1.3 使用 `plugin.new()` 标准模式注册插件

## 2. 重构 access 阶段

- [ ] 2.1 将 `ngx.exit()` 调用替换为 `return status_code[, body]` 标准返回值
- [ ] 2.2 文件不存在时返回 `return 404` 而非 `ngx.exit(404)`
- [ ] 2.3 路径遍历攻击时返回 `return 403` 而非 `ngx.exit(403)`

## 3. 完成插件功能

- [ ] 3.1 实现文件分块读取（对大文件使用 `ngx.print` 分块输出）
- [ ] 3.2 保留 MIME 类型推断、ETag/304 缓存控制功能
- [ ] 3.3 保留 Cache-Control 和 Last-Modified 响应头
