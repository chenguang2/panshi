import { ref } from 'vue'

/**
 * bootstrap 是否已收口（features 已加载 → 动态路由已注册 → 首次导航已补做）。
 *
 * 背景（B3）：`app.mount()` 时 router 已 `app.use`，会立即按 `window.location`
 * 做首次导航；而 feature-gated 路由（`/edge-client`、`/database-management` …）
 * 要等 features 拉取完成后才 `addRoute`。因此这类深链的首次导航只能落到
 * catch-all 占位路由（`BootstrapPlaceholder` 名字）——那是「暂定」结果，不是真 404。
 *
 * 占位视图（`views/NotFoundView.vue`）只在收口后渲染空态，避免 404 一闪而过：
 * features 拉取失败会重试 5 次（最长 15s），期间闪 404 会让用户误判功能已关闭。
 * 独立成模块（而非放在 router/index.ts）是为了让视图只依赖这一个 ref，
 * 不把整张路由表/守卫/store 拉进组件测试。
 */
export const bootstrapSettled = ref(false)
