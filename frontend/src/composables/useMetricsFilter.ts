import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listClusters } from '@/api/clusters'
import { fetchAllClusterNodes } from '@/composables/useClusterUtils'

export interface SelectOption {
  value: number | string
  label: string
  disabled?: boolean
}

/** 两级筛选宿主适配器：页面 store 提供筛选状态读写与变更后的重载行为（共享态机，禁止复制实现） */
export interface MetricsFilterAdapter {
  getClusterId(): number | -1 | null
  getNodeIp(): string | null
  /** 写入集群筛选（0=全部→null，-1=未纳管，>0=具体集群；具体语义由 store 实现两级联动重置） */
  applyCluster(id: number | -1 | null): void
  applyNode(ip: string | null): void
  /** 筛选变化后的页面行为：重载受筛选拉取 + URL 同步（页面各自实现） */
  onFilterChanged(): void
}

/**
 * 集群/节点两级筛选共享态机（metrics-cluster-node-filter D4 → metrics-query-ux D6 抽取）。
 * 职责：选项加载、a-select 值映射（0=全部集群/-1=未纳管）、切集群清空节点、URL 回显与规范形 patch。
 * URL 写入由页面完成（总览页只写 cluster/node；查询页还要写 metric/range，规范形不同）。
 */
export function useMetricsFilter(adapter: MetricsFilterAdapter) {
  const route = useRoute()
  const router = useRouter()
  const clusterOptions = ref<SelectOption[]>([])
  const nodeOptions = ref<SelectOption[]>([])
  const nodeLoading = ref(false)
  const nodeSelectOptions = computed<SelectOption[]>(() => [{ value: '', label: '全部节点' }, ...nodeOptions.value])

  // a-select 值映射：0=全部集群（store 态为 null），-1=未纳管
  const clusterSelectValue = computed(() => adapter.getClusterId() ?? 0)
  const nodeSelectValue = computed(() => adapter.getNodeIp() ?? '')
  const nodeSelectDisabled = computed(() => adapter.getClusterId() == null || adapter.getClusterId() === -1)

  // 固定项在前：全部集群(0) / 平台集群 / 未纳管节点(-1)
  const clusterSelectOptions = computed<SelectOption[]>(() => [
    { value: 0, label: '全部集群' },
    ...clusterOptions.value,
    { value: -1, label: '未纳管节点' },
  ])

  async function loadClusterOptions(): Promise<void> {
    try {
      const res = await listClusters({ page: 1, page_size: 500 })
      const items = ((res.data?.items ?? []) as { id: number; name: string }[]).filter((c) => c.id != null)
      clusterOptions.value = items.map((c) => ({ value: c.id, label: c.name }))
    } catch {
      // 集群清单拉取失败不阻塞页面（下拉仅缺选项，全部视角仍可用）
    }
  }

  async function onClusterChange(v: number | string): Promise<void> {
    const id = Number(v)
    if (!Number.isFinite(id)) return
    adapter.applyCluster(id === 0 ? null : id)
    nodeOptions.value = []
    const cid = adapter.getClusterId()
    if (cid != null && cid > 0) {
      nodeLoading.value = true
      try {
        const nodes = await fetchAllClusterNodes<{ ip: string }>(cid)
        // 「全部节点」首项由 nodeSelectOptions 固定提供，这里只放具体节点
        nodeOptions.value = nodes.filter((n) => !!n.ip).map((n) => ({ value: n.ip, label: n.ip }))
      } catch {
        nodeOptions.value = []
      } finally {
        nodeLoading.value = false
      }
    }
    adapter.onFilterChanged()
  }

  function onNodeChange(v: number | string): void {
    const ip = String(v)
    adapter.applyNode(ip === '' ? null : ip)
    adapter.onFilterChanged()
  }

  /** URL 回显：失效 id 由后端 warning 语义静默回退，前端不校验存在性 */
  function restoreFilterFromQuery(): void {
    const q = route.query
    if (q.cluster === 'unmanaged') {
      adapter.applyCluster(-1)
    } else if (typeof q.cluster === 'string') {
      const id = Number(q.cluster)
      if (Number.isFinite(id) && id > 0) adapter.applyCluster(id)
    }
    if (typeof q.node === 'string' && q.node) adapter.applyNode(q.node)
  }

  /** URL 规范形 patch：未纳管写 unmanaged（与 restoreFilterFromQuery 回读一致） */
  function filterQueryPatch(): Record<string, string> {
    const query: Record<string, string> = {}
    const cid = adapter.getClusterId()
    if (cid != null) query.cluster = cid === -1 ? 'unmanaged' : String(cid)
    const nip = adapter.getNodeIp()
    if (nip) query.node = nip
    return query
  }

  function replaceQuery(query: Record<string, string>): void {
    const replaced = router.replace({ query })
    if (replaced && typeof replaced.catch === 'function') replaced.catch(() => {})
  }

  return {
    clusterOptions,
    nodeOptions,
    nodeLoading,
    clusterSelectOptions,
    nodeSelectOptions,
    clusterSelectValue,
    nodeSelectValue,
    nodeSelectDisabled,
    loadClusterOptions,
    onClusterChange,
    onNodeChange,
    restoreFilterFromQuery,
    filterQueryPatch,
    replaceQuery,
  }
}
