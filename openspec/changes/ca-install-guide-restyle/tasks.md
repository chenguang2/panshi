# Tasks

## 1. 组件测试先行（TDD RED）

- [x] 1.1 `frontend/src/views/__tests__/CaCertList.test.ts` 新增/改造断言并验证 RED：四张平台卡标题（Windows / macOS / Chrome / Edge 浏览器 / Linux）；Chrome/Edge 卡含 `chrome://settings/security` 与 `edge://settings/privacy`；Windows 步骤含「本地计算机」与「受信任的根证书颁发机构」及 UAC 提示；Linux 卡两条命令 + RHEL/CentOS 提示；底部验证条（锁图标 + 「您的连接不是专用连接」排查文案）；「复制全部文本」按钮存在；全文不含 Firefox

## 2. 指引区实现（TDD GREEN）

- [x] 2.1 `CaCertList.vue` 指引区模板重写：`<details>` + summary（标题 + 提示语 + 「复制全部文本」按钮，`@click.prevent` 防折叠冲突）+ `.guide-body` 2×2 平台卡（`.p-card` 解剖：p-head 图标/名称/徽标 + p-body 序号步骤 + note 行）+ Linux 代码条带单条复制 + 底部 `.verify-strip`；`npx vitest run src/views/__tests__/CaCertList.test.ts` 全绿
- [x] 2.2 `ssl-page-shared.css` 指引样式族重写（`.install-guide` 保留壳、`.guide-body`/`.guide-col` → `.p-card`/`.p-head`/`.p-body`/`.step`/`.code-row`/`.note-row`/`.verify-strip`；≤1200 单列断点）；summary 行按 D8/V1 落地——28×28 accent 浅底圆角块内 14px 描边 chevron（展开旋转 90°）+ 整行 hover 灰底 + 提示语尾缀「点此展开」，移除旧 `::before '▸'`；确认旧 `.guide-col` 类无其它消费方后移除（前缀 grep 全量核对，约定 #47）
- [x] 2.3 复制实现：`navigator.clipboard.writeText` + 失败降级 toast 提示手动复制；「复制全部文本」取指引面板 `innerText`（实现按 design D4 二选一：先程序性展开再取文本）

## 3. 设计基线同步与收口

- [x] 3.1 `docs/ui/Live-Artifact-5/proposal-c/ca-certs.html` 指引区同步为四卡解剖（#91）；删除过程稿 `/tmp/opencode/ca-guide-proposals/`（#91 用完即删）
- [x] 3.2 `npx vue-tsc -b` 零错误；`npx vitest run src/views/__tests__/ --maxWorkers=4` 目录级全绿
- [x] 3.3 真机验收（常驻 12345 实例）：CA 根证书页展开指引截图对照样例页逐项核对（四卡结构/验证条/复制按钮/无 Firefox），按 #51 规则验证落在用户实际操作的页面
