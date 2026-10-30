# tools-new-utilities 提案

> 2026-10-30 工具箱新增三工具（用户从候选清单裁决：1 时间戳转换 + 2 JWT 解码器 + 4 YAML↔JSON 互转）

## Why

- **时间戳转换**：审计日志 / ConfigVersion / 备份文件名全是 UTC isoformat（AGENTS #26），运维对时间靠心算 +8——全站最高频痛点
- **JWT 解码器**：平台 token 即 JWT（security.py），401/过期/pwd_ver 吊销三类认证问题的第一排查动作从「看后端日志」变成「粘进去秒懂」
- **YAML↔JSON 互转**：edge.env 是 YAML、插件配置是 JSON，两域配置互看互转是真实操作链

## What

三个纯前端新工具面板（沿用统一双栏/输入即算布局），新增 `utils/tools/time.ts`（parseTimestamp/格式化，时区语义显式：无后缀按 UTC=平台约定、展示北京时间）与 `utils/tools/jwt.ts`（三段拆解 + exp 状态）、`utils/tools/convert.ts`（YAML↔JSON）。导航 7→10 项。

追加裁决（2026-10-30 第二批）：5 文本 Diff + 7 IP/CIDR 计算器 + 8 哈希计算（用户从候选清单追加选定）。文本 Diff 复用 renderLineDiff 渲染层；IP/CIDR 仅 IPv4（运维场景为主，明确标注）；哈希 MD5 本地实现 + SHA 系列走 Web Crypto（jsdom 测试环境无 subtle 时相关用例降级，真实浏览器必有）。

## 决策边界

- JWT 不验签（纯解码，工具目的是看内容；无安全放大——payload 本就明文）
- 时间戳无后缀字符串按 **UTC** 解析（对齐平台存储约定 #26）、展示北京时间为主 + UTC/epoch 全量对照
- YAML↔JSON 显式按钮（yamlToJson / jsonToYaml），不做格式自动猜测
