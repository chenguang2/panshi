/**
 * 插件元数据「可选插件」清单的单一实现（plugin-metadata-plugins-config）。
 *
 * 规则 = 目录（`GET /plugins/builtin`，`enabled_plugins` 已在目录层作为平台硬上限滤过）
 * ∩ features.yaml 的 `plugin_metadata_plugins`（经 features store 解析；空/未配置 = 不限制），
 * 可选再排除某集群已配置的插件（同一集群内一个插件只允许一条元数据）。
 *
 * 三个消费方共用本函数，禁止各自复制第二套过滤规则：
 * - 面板 `components/PluginMetadata.vue` 的「可用插件」树（带已配置排除）
 * - 独立页 `views/PluginMetadataList.vue` 的「全部插件」筛选项（不带排除——筛选要能选到暂无记录的插件）
 * - 创建弹窗 `components/PluginMetadataCreateModal.vue` 的插件下拉（带已配置排除）
 */

export interface MetadataPluginLike {
  name: string
  display_name?: string
  description?: string
  category?: string
}

/** 目录 ∩ features 清单（∩ 排除已配置）。allowed 为空/缺省 = 不限制。 */
export function filterMetadataPlugins<T extends MetadataPluginLike>(
  catalog: T[],
  allowed: string[] | null | undefined,
  excludeConfigured?: Iterable<string> | null,
): T[] {
  const excluded = excludeConfigured ? new Set(excludeConfigured) : null
  const allowAll = !allowed || allowed.length === 0
  return catalog.filter((p) => (allowAll || allowed.includes(p.name)) && (!excluded || !excluded.has(p.name)))
}

/** 下拉展示文案：中文名优先（`display_name || name`，与 PluginSelector/路由页同口径） */
export function metadataPluginLabel(plugin: MetadataPluginLike): string {
  return plugin.display_name || plugin.name
}

/** `GET /plugins/builtin` 的 items 是 `Record<string, unknown>`（API 模块的窄声明），按目录字段收敛成可读结构 */
export function toMetadataPlugins(list: Array<Record<string, unknown>> | null | undefined): MetadataPluginLike[] {
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  return (list || [])
    .map((p) => ({
      name: String(p.name ?? ''),
      display_name: str(p.display_name),
      description: str(p.description),
      category: str(p.category),
    }))
    .filter((p) => p.name !== '')
}
