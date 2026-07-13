## 1. 前端 — 域名行增加 TTL

- [x] 1.1 DnsDomain 接口新增 ttl/checks 字段
- [x] 1.2 域名行模板加 TTL 输入框（默认 10s）
- [x] 1.3 addDnsDomain() 默认 ttl=10、checks=''
- [x] 1.4 handleSubmit() 输出 ttl_valid 和 checks 到 dns_config

## 2. 前端 — 编辑加载兼容

- [x] 2.1 编辑时读取 ttl_valid 和 checks 回填

## 3. 前端 — DNS 默认健康检查

- [x] 3.1 dnsDefaultChecksJson 改为 {"type": "tcp", "active": {}, "passive": {}}

## 4. 验证

- [x] 4.1 TypeScript 编译通过
- [x] 4.2 Python 语法检查通过
