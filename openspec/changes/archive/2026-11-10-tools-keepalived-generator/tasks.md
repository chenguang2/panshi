# Tasks: tools-keepalived-generator

## 1. 生成器单点（TDD）

- [x] 1.1 `utils/tools/keepalived.ts`：参数接口 + `KEEPALIVED_DEFAULTS` + `generateKeepalivedConfig`（RED：样例逐字回归用例先行——3 节点样例输入 → 每文件内容与样例逐字一致，含注释与缩进）
- [x] 1.2 派生逻辑单测：priority 递减、unicast_peer 排除本机、router_id 序号、防火墙命令不含本机 IP、节点数 2 与 5 的边界
- [x] 1.3 校验函数单测：非法 IPv4 / 节点 <2 / VIP 与节点重复（红字）；不同网段 / 密码超 8 字符（黄字不阻断）

## 2. 工具页接线

- [x] 2.1 Tools.vue：导航项（Keepalived 配置 / shortLabel `Keepalived` / 深链 key `keepalived`）+ 输入表单（必填 3 项 + 高级折叠）+ 输出区（共用文件节 / 每节点折叠卡 / 部署手册节，各带复制与下载）
- [x] 2.2 复制与 Blob 下载函数 + 校验提示渲染（红/黄）

## 3. 验证收口

- [x] 3.1 目标测试（Tools.test.ts + keepalived 单测，43/43）+ `vue-tsc -b`（0）+ ESLint（0 error）
- [x] 3.2 全量串行（#208 `npx vitest run --no-file-parallelism`，2634/2635；唯一失败 DatabaseManagement 切换弹窗为 #58 CPU 争抢漂移，隔离复跑 40/40 绿）
- [x] 3.3 真页验收：样例输入逐字比对 + 修改高级参数联动 + 复制/下载可用（用户实际页面，2026-11-10 用户确认可归档）
- [x] 3.4 openspec validate --all 收口（204/204）
