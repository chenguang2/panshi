/**
 * 静态资源路由资格判定（static-resources-ux-close-loop 3.1）
 *
 * 两入口（全局静态资源页 / 集群统一管理 Tab）共用的唯一实现，禁止复制。
 * 三条件与后端 `_get_route_with_plugins` 同款校验对齐：
 * ① 路径以 `/*` 结尾；② 已发布（current_version 非空）；③ 挂 static_resource 插件。
 */

/** 挂载静态资源所需的插件名（与后端 static_resource 插件定义一致） */
export const STATIC_RESOURCE_PLUGIN_NAME = 'static_resource'

export interface StaticResourceRouteLike {
  uri?: string | null
  current_version?: number | null
  plugins?: { plugin_name?: string | null }[] | null
}

export interface StaticResourceRouteEligibility {
  eligible: boolean
  /** 不合格原因（不含括号），全部满足时为空数组 */
  reasons: string[]
}

/** 三条件判定；不合格原因按「路径 → 发布 → 插件」顺序返回 */
export function staticResourceRouteEligibility(route: StaticResourceRouteLike): StaticResourceRouteEligibility {
  const reasons: string[] = []
  if (!route.uri || !route.uri.endsWith('/*')) reasons.push('路径须以 /* 结尾')
  if (route.current_version == null) reasons.push('未发布')
  const hasPlugin = (route.plugins || []).some((p) => p.plugin_name === STATIC_RESOURCE_PLUGIN_NAME)
  if (!hasPlugin) reasons.push('未挂静态资源插件')
  return { eligible: reasons.length === 0, reasons }
}

/** 下拉 option 后缀：不合格加「（原因1、原因2）」，合格返回空串（视图拼接 `${name} (${uri})${suffix}`） */
export function routeEligibilitySuffix(route: StaticResourceRouteLike): string {
  const { reasons } = staticResourceRouteEligibility(route)
  return reasons.length > 0 ? `（${reasons.join('、')}）` : ''
}

/* ── 分发状态五态判定（static-resources-ux-close-loop 7.1/7.3）────────────────
 * 配置异常 > 待上传 > 待分发/已分发/失败（按 last_publish_ok 三态）；
 * 徽章组件（StaticResourceStateTag）与两入口按钮禁用逻辑同源消费，勿复制判定。
 */

export type StaticResourceState = 'broken' | 'pending_upload' | 'pending_dispatch' | 'dispatched' | 'failed'

export interface StaticResourceStateLike {
  current_version?: number | null
  last_publish_ok?: boolean | null
  route_exists?: boolean | null
}

export function staticResourceState(sr: StaticResourceStateLike): StaticResourceState {
  if (sr.route_exists === false) return 'broken'
  if (!sr.current_version) return 'pending_upload'
  if (sr.last_publish_ok === true) return 'dispatched'
  if (sr.last_publish_ok === false) return 'failed'
  return 'pending_dispatch'
}
