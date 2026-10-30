# tasks: tools-new-utilities

> 三工具（时间戳/JWT 解码/YAML↔JSON 互转），用户裁决 2026-10-30；TDD 先红后绿

- [x] 1.1 utils/tools/time.ts：parseTimeInput（10/13 位 epoch 自动识别、无后缀按 UTC、带后缀按其时区、后端毫秒 isoformat 兼容）+ epochToBeijing/fmtBeijing；18 用例含时区语义钉死
- [x] 1.2 utils/tools/jwt.ts：decodeJwt（三段拆解、base64url 无填充兼容、非法输入中文报错、不验签）
- [x] 1.3 utils/tools/convert.ts：yamlToJson/jsonToYaml（复用 yaml 库、中文错误文案）
- [x] 1.4 Tools.vue 三面板接线：timestamp（输入即算 + 结果对照表 + 当前时间/清空）、jwt（header/payload + exp 状态标签 + 签名省略提示）、convert（双栏双按钮）；导航 7→10 项；深链白名单扩展
- [x] 2.1 组件测试扩展：导航 10 项、三面板渲染/交互/深链/清空（Tools.test.ts 24 用例）
- [x] 2.2 收口（第一批）：vue-tsc 0 错误；全量串行 165 文件仅 1 个无关文件 CPU 漂移（隔离复跑绿）；真实 UI 验收
- [x] 2.3 第二批（用户追加裁决 5/7/8）：textdiff.ts 逐行 LCS（复用 dl-line 行样式、5000 行上限截断提示）+ ip.ts（/31 RFC3021、/32、私网段标注、中文报错）+ hash.ts（MD5 本地 RFC1321 实现 + SHA 系列 Web Crypto、小写十六进制）
- [x] 2.4 三面板接线（textdiff 对比按钮/ipcalc 输入即算 result-grid/hash 输入即算异步四算法）+ 导航 10→13 项 + 深链扩展
- [x] 2.5 组件测试扩展（Tools.test.ts 81 用例）+ utils 11 用例（IP 全字段/私网边界 172.16-31、MD5 RFC 向量、SHA 已知向量）；vue-tsc 0 错误
- [x] 2.6 收口（第二批）：全量串行回归；真实 UI 验收（文本 diff 摘要、/26 全字段+私网标注、MD5 向量 9001...72、SHA 四行）