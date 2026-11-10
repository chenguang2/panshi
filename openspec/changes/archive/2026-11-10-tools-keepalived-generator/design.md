# Design: tools-keepalived-generator

## Context

工具页现状：`Tools.vue` 单文件承载 13 个工具（左侧导航 + 右侧面板，`?tool=<key>` 深链），各工具逻辑单点在 `frontend/src/utils/tools/*.ts`（纯函数），测试分布在 `src/utils/tools/__tests__/` 与 `src/views/__tests__/Tools.test.ts`。无 zip/文件打包依赖；下载类能力此前未出现过。

## Goals

- 样例逐字复现（用户提供的 3 节点 DNS 高可用配置为唯一基准，回归单测钉死）
- 单点模板渲染（`utils/tools/keepalived.ts` 纯函数），Tools.vue 只做 UI 接线
- 零新依赖、零后端

## Decisions

- **D1 模板即纯函数**：`generateKeepalivedConfig(input): KeepalivedGenResult`，输入为参数对象（vip、nodes[]、interface、高级参数全带默认值导出 `KEEPALIVED_DEFAULTS`），输出为结构化文件清单（`{ key, title, filename, language, content, group: 'shared'|'node-<idx>' }[]` + 部署手册文本）。Tools.vue 不内嵌模板字符串，便于单测逐字断言。
- **D2 默认值=样例值**：全部高级参数默认值与用户样例一致；`router_id` 序号、`priority` 递减、`unicast_peer` 排除本机均为派生逻辑；VIP label 固定 `<interface>:vip`；脚本/实例名固定 `chk_dns`/`VI_DNS`。
- **D3 通知脚本固定三件**：`notify_master/backup/fault` 均为 `logger -t keepalived "VI_DNS: ..."`，host 动态 `$(hostname)`（样例原样）。
- **D4 复制与下载**：复制复用页面现有 copy 范式（`navigator.clipboard` + 兜底）；下载用 Blob + `URL.createObjectURL`（`text/plain`），不引打包依赖。
- **D5 校验不阻断**：红字（非法 IPv4、节点 <2、VIP 与节点重复）时输出区显示占位提示；黄字（网段不一致、密码超 8 字符）仅提示，生成继续。网段比较复用 `utils/tools/ip.ts` 的 `parseCidr`。
- **D6 部署手册随参数化**：手册内所有 IP/网卡均为生成时实际值；备选「直接放行 VRRP 协议」命令固定附于手册。

## Risks/Constraints

- Tools.vue 已 1282 行（页面级单文件是既有形态，新增一个工具区块属同类增量；不拆分，见约定 #11 同判据）
- 逐字回归断言对模板空格/缩进敏感——单测样例夹具与模板必须同步维护
- 后续如需「整包下载」再评估 jszip（本轮不做）

## Migration Plan

纯增量，无迁移。

## Open Questions

无（参数面/输出组织/下载形态/检查端口可配均已在提案批准时定案）。
