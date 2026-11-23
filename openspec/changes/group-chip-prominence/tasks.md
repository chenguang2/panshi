# Tasks

## 1. 实现样式单点

- [x] 1.1 重写 `frontend/src/style.css` 的 `.g-chip` 段（含 `.ok/.warn/.bad` 三条 tone 规则）为规格数值：基础 `12px / 600 / var(--fg) / 底 12% / border: 1px solid transparent` + 数量档边 22%；ok/warn/bad 各自前景加深一档、底 20%/20%/16%、`border-color` 同色 35%；不动 `.g-name`/`.g-meta`/`.g-chev`。验证：读文件核对逐值与 `openspec/changes/group-chip-prominence/specs/list-page-console-visual/spec.md` 一致。

## 2. 设计基准同步

- [x] 2.1 同步 `docs/ui/Live-Artifact-5/proposal-c/theme.css` 的 `.g-chip` / `.g-chip.ok` / `.g-chip.bad` / `.g-chip.warn` 四条规则为同值。验证：`diff` 两侧值一致。
- [x] 2.2 核对三张设计页 `nodes.html` / `upstreams.html` / `routes.html` 的组头行渲染与基准一致（若页面无内联覆盖则无需改动，逐一确认并记录）。验证：浏览器打开三页组头与真实页观感同档。

## 3. 守卫与回归测试

- [x] 3.1 `frontend/src/components/__tests__/ClusterGroupRow.test.ts` 追加源码扫描 describe：断言 `style.css` `.g-chip` 段含 `font-size: 12px`、`font-weight: 600`、`border: 1px solid`、三档 tone 新前景值；断言 `theme.css` `.g-chip` 段含同值（同值性钉死）。验证：`npx vitest run src/components/__tests__/ClusterGroupRow.test.ts` 全绿；人为改回 11px 时守卫转红。
- [x] 3.2 回归三页既有测试（`NodeList` / `UpstreamList` / `RouteList` 的 `.test.ts` + `mockupParity.source.test.ts`）。验证：`npx vitest run --maxWorkers=4` 相关文件全绿、零断言反转。

## 4. 真机验收与收尾

- [x] 4.1 真机截图验收：登录 `localhost:12345`，1600 视口打开节点/上游/路由三页分组视图（含待发布/部分失败数据的集群组），截图与对比稿方案 C 同档对照；确认 chips 12px/600、行动性状态可辨、组头行整体观感可接受。验证：三页截图存档于本变更目录，用户确认。
- [x] 4.2 验收通过后删除对比稿 `docs/ui/Live-Artifact-5/proposal-c/group-chip-variants.html`（约定 #91）。验证：文件不存在、`git status` 干净（仅本变更相关改动）。
- [x] 4.3 `openspec validate --all` 收口（0 error）。验证：命令输出 0 error。
