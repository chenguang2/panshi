## 1. 纯函数与单测

- [x] 1.1 在 `frontend/src/utils/ansibleInventory.ts` 新增 `parseBulkHosts(text)`：按行解析 `IP [用户] [密码]`，按空白拆分（空格/Tab），跳过空行，支持 `#` 整行注释与行尾注释（token 以 `#` 开头即丢弃其后内容），返回 `{ entries, duplicatesInText, errors }`（errors 含行号与原因：缺 IP、段数超限、IP 不匹配等；IP 校验使用与后端 `_HOST_KEY_RE` 完全一致的正则口径）
- [x] 1.2 新增合并函数：粘贴条目与现有行同 IP 时仅覆盖粘贴中提供的 user/pass 字段（未提及的保持原值）、保留高级字段与未知键，输出覆盖数量
- [x] 1.3 在 `frontend/src/utils/__tests__/ansibleInventory.test.ts` 补充上述纯函数单测（正常/整行与行尾注释/Tab 分隔/缺 IP/多余段/IP 口径不符/内部重复/与现有行覆盖——含部分凭据时保留原值的断言）

## 2. 表格交互改造

- [x] 2.1 移除「自定义字段」列；「高级」按钮叠加橙色圆点徽标 + tooltip（键名清单、"仅源码模式可维护、保存不丢"）
- [x] 2.2 「＋ 添加主机」移至表格底部通栏虚线按钮，移除顶部工具栏按钮
- [x] 2.3 抽取共享的「追加并定位」逻辑（nextTick scrollIntoView center + 2 秒高亮闪烁动画类 + 聚焦新行 IP 输入框），底部按钮与回车续录两条路径共用
- [x] 2.4 最后一行（IP 已填写）IP 输入框 Enter 触发「追加并定位」；最后一行 IP 为空、非最后一行、输入法组合输入（isComposing）时均不触发

## 3. 批量导入弹窗

- [x] 3.1 表格视图工具栏新增「批量导入」按钮与 Modal：textarea、格式说明 placeholder（空白分隔、# 注释）、实时解析预览（去重后识别条数 + 内部重复合并提示 + 覆盖标注 + 逐行错误；密码列掩码占位）、错误时禁用确认
- [x] 3.2 确认导入：条目写入 rows 并 markDirty，关闭弹窗；不绕过既有保存校验

## 4. 验证

- [x] 4.1 定向单测通过：`npx vitest run src/utils/__tests__/ansibleInventory.test.ts`
- [x] 4.2 Playwright 或手动链路验证：添加滚动高亮与聚焦、回车续录（含最后一行 IP 为空时不追加）、批量导入覆盖提示（含部分凭据保留原值）、保存后 inventory 内容正确、自定义字段徽标显示
