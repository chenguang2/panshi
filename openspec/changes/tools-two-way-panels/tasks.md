# Tasks

## 1. 测试先行（RED）

- [x] 1.1 更新 `Tools.test.ts`：url/base64/convert 用例改为新按钮标签（「编码 →」/「← 解码」/「转 JSON →」/「← 转 YAML」），并新增反向路径用例——右框贴编码串点「← 解码」→ 左框出原文；右框贴 JSON 点「← 转 YAML」→ 左框出 YAML。验证：定向 vitest 红（新标签不存在、旧行为不读右框）。

## 2. 实现（GREEN）

- [x] 2.1 `Tools.vue` URL 工具：按钮「编码 →」读左写右、「← 解码」读右写左；右 panel-label「结果」→「编码串」，右 placeholder「粘贴编码串进行反向解码」。验证：1.1 url 用例绿。
- [x] 2.2 `Tools.vue` Base64 工具：同款双向按钮与右框文案。验证：1.1 base64 用例绿。
- [x] 2.3 `Tools.vue` 互转工具：panel-label 左「YAML」右「JSON」，右框去 readonly，按钮「转 JSON →」读左写右、「← 转 YAML」读右写左，placeholder 同步。验证：1.1 convert 用例绿。
- [x] 2.4 `toolHelp.ts` url/base64/convert 三条目文案改两框对等表述。验证：toolHelp.source.test.ts 守卫仍绿；定向 vitest 全绿。

## 3. 回归与真机验收

- [x] 3.1 `npx vue-tsc -b` 零错误 + 全量 `npx vitest run --maxWorkers=4` 无新增失败。验证：两命令输出。
- [x] 3.2 Playwright 直连常驻 dev 服务真机验收：三工具各做一次正向 + 反向往返（URL/Base64 编码后原位反向解码还原；互转 YAML→JSON→YAML 还原），截图留档。验证：脚本断言全 PASS + 截图。

## Workflow follow-up

- 用户确认后归档变更，MODIFIED 三需求合入 `dev-tools` 主 spec，`openspec validate --all` 收口。
