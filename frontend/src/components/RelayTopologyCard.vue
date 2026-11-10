<template>
  <section class="topo-card" :data-code="gateway.code">
    <!-- 卡头：名称 / 区域码 / 状态徽章 / 直连徽章 / 体检 chip + 动作区（测试/下发/更多） -->
    <div class="topo-head">
      <div class="th-left">
        <h2>
          <span class="editable-name" title="点击重命名" @click="emitNameClick($event)">{{ gateway.name }}</span
          ><i class="pencil-inline">✎</i>
        </h2>
        <span class="code-tag mono">{{ gateway.code }}</span>
        <span
          :class="gateway.status === 'enabled' ? 'badge ok clickable' : 'badge off clickable'"
          title="点击切换 启用 / 禁用"
          @click="emitBadgeClick($event)"
        >
          {{ gateway.status === 'enabled' ? '启用' : '禁用（直连回退）' }}
        </span>
        <span v-if="stage === 'fresh'" class="badge warn">直连 · 无网关机</span>
        <span class="hchip" :class="healthCls" :title="healthTip">
          <template v-if="health"
            >{{ healthText }}<time>{{ healthTimeText }}</time></template
          >
          <template v-else>未检测</template>
        </span>
      </div>
      <div class="th-actions">
        <button
          class="btn btn-secondary btn-sm"
          title="探测该区域两条腿，结果更新体检徽章；直连区域测直连可达性"
          @click="emitTest"
        >
          测试
        </button>
        <a-dropdown :trigger="['click']">
          <button class="btn btn-secondary btn-sm">更多 ▾</button>
          <template #overlay>
            <a-menu>
              <a-menu-item key="edit" @click="emitMenu('edit')">
                <div class="menu-item-stack">
                  <span>编辑</span>
                  <small>修改地址、账号与状态</small>
                </div>
              </a-menu-item>
              <a-menu-item key="init" @click="emitMenu('init')">
                <div class="menu-item-stack">
                  <span>初始化网关</span>
                  <small>首次装机必做：写入 8443 监听（幂等可重复）</small>
                </div>
              </a-menu-item>
              <a-menu-item key="sshd" @click="emitMenu('sshd')">
                <div class="menu-item-stack">
                  <span>配置跳板转发</span>
                  <small>放行网关 sshd 转发（需 root，一次即可）</small>
                </div>
              </a-menu-item>
              <a-menu-item key="preview" @click="emitMenu('preview')">
                <div class="menu-item-stack">
                  <span>查看配置</span>
                  <small>预览将写入网关机的文件内容</small>
                </div>
              </a-menu-item>
              <a-menu-item key="cred" @click="emitMenu('cred')">
                <div class="menu-item-stack">
                  <span>查看凭据</span>
                  <small>查看网关机 SSH 口令（记录审计）</small>
                </div>
              </a-menu-item>
              <a-menu-item key="toggle" @click="emitMenu('toggle')">
                <div class="menu-item-stack">
                  <span>{{ gateway.status === 'enabled' ? '禁用' : '启用' }}</span>
                  <small>停止/恢复经网关中转，回退直连</small>
                </div>
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item
                key="delete"
                danger
                :disabled="(gateway.attached_cluster_count || 0) > 0"
                @click="emitMenu('delete')"
              >
                <div class="menu-item-stack">
                  <span>删除</span>
                  <small v-if="(gateway.attached_cluster_count || 0) > 0">
                    已被 {{ gateway.attached_cluster_count }} 个集群挂接，先解挂再删除
                  </small>
                  <small v-else>未被集群挂接时可删除</small>
                </div>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <!-- 卡头副条：steady → 白名单统计条；未 steady → 五步清单条（design D7） -->
    <div class="th-sub">
      <template v-if="stage === 'steady'">
        <template v-if="!gateway.push_drift">尚无成功下发记录</template>
        <template v-else>
          白名单 <b>{{ gateway.enabled_node_count ?? 0 }}</b
          >/<b>{{ gateway.total_node_count ?? 0 }}</b> 已同步
          <template v-if="driftAddedCount > 0"
            ><span class="sep">·</span><span class="c-add">{{ driftAddedCount }} 个未下发</span></template
          >
          <template v-if="driftRemovedCount > 0"
            ><span class="sep">·</span><span class="c-rm">{{ driftRemovedCount }} 个待移除</span></template
          >
          <span class="sep">·</span>上次下发 {{ formatDateTime(gateway.last_pushed_at) }}
        </template>
      </template>
      <template v-else>
        <span v-for="step in checklist" :key="step.label" class="st">
          {{ step.label }} <b :class="step.done ? 'ok' : 'no'">{{ step.done ? '✓' : '○' }}</b>
        </span>
        <span class="sep">·</span><span class="c-add">下一步：{{ nextStep }}</span>
      </template>
    </div>

    <!-- 图体：平台 → 两腿 → 网关机（阶段机四形态） → 分发边 → 集群们 -->
    <div class="topo-body">
      <div class="col">
        <div class="node platform" title="中控平台：发布、节点任务的发起方。所有进局请求从这两条腿出去。">
          <div class="n-title">中控平台</div>
          <div class="n-sub">发布 · 任务发起方</div>
        </div>
      </div>

      <div class="edge">
        <span
          v-if="httpConfigured"
          class="leg-chip clickable"
          title="点击编辑：发布、回滚等管理请求经它进入该局"
          @click="emitLegClick('http', $event)"
        >
          <b>HTTP 腿</b> <span class="mono">{{ httpDisplay }}</span>
          <span :class="httpSeg && !httpSeg.ok ? 'st-fail' : 'st-ok'">{{ legBadge(httpSeg) }}</span>
        </span>
        <span v-else class="leg-chip dim clickable" title="点击登记 HTTP 腿" @click="emitLegClick('http', $event)">
          HTTP 腿 · 未配置
        </span>
        <span
          v-if="sshConfigured"
          class="leg-chip clickable"
          title="点击编辑：安装、初始化等 SSH 任务先跳到网关机再进局内"
          @click="emitLegClick('ssh', $event)"
        >
          <b>SSH 跳板</b> <span class="mono">{{ stageSource.ssh_jump }}</span>
          <span :class="sshSeg && !sshSeg.ok ? 'st-fail' : 'st-ok'">{{ legBadge(sshSeg) }}</span>
        </span>
        <span v-else class="leg-chip dim clickable" title="点击登记 SSH 跳板" @click="emitLegClick('ssh', $event)">
          SSH 跳板 · 未配置
        </span>
      </div>

      <div class="col">
        <!-- steady：实体卡（整卡可点开三字段 popover，批次三；✎ 悬浮角标） -->
        <div
          v-if="stage === 'steady'"
          class="node editable"
          title="点击就地编辑 SSH 账号 / 端口 / OpenResty 前缀（口令与高级参数在「更多 ▸ 编辑」弹窗）"
          @click="emitNodeBoxClick($event)"
        >
          <i class="pencil">✎ 就地编辑</i>
          <div class="n-title">
            网关机 · {{ gateway.name }}
            <span class="code-tag mono small">{{ gateway.code }}</span>
            <span
              v-if="gateway.inventory_group_missing"
              class="tag gwarn"
              title="ansible 清单 inventory/gateways 缺该局主机组，初始化/下发会被前置拦截"
              >清单缺组</span
            >
          </div>
          <div class="n-main">{{ sshUserLabel }}@{{ sshHost }}:{{ sshPortLabel }}</div>
          <div class="n-sub mono" :title="prefix">{{ prefixTrunc }}</div>
        </div>

        <!-- ready-init：虚线待初始化框（整框可点完善连接信息；前缀未填红字提示 + 初始化按钮） -->
        <div
          v-else-if="stage === 'ready-init'"
          class="node ghost editable"
          title="点击填写 SSH 账号 / 端口 / OpenResty 前缀"
          @click="emitNodeBoxClick($event)"
        >
          <i class="pencil">✎ 连接信息</i>
          <div class="n-title muted">网关机 · 待初始化 <span class="tag pend">待初始化</span></div>
          <div class="n-main">{{ sshUserLabel }}@{{ sshHost }}</div>
          <div class="n-sub mono">
            <template v-if="prefix">{{ prefixTrunc }}</template>
            <span v-else class="st-miss">OpenResty 前缀未填 · 点此填写</span>
          </div>
          <button class="btn btn-primary btn-sm node-btn" @click.stop="emitInit($event)">初始化网关</button>
        </div>

        <!-- init-blocked：缺 SSH 账号变体（整框可点 + 补账号按钮，就地 popover） -->
        <div
          v-else-if="stage === 'init-blocked'"
          class="node ghost editable"
          title="点击补 SSH 账号 / 端口 / OpenResty 前缀"
          @click="emitNodeBoxClick($event)"
        >
          <i class="pencil">✎ 连接信息</i>
          <div class="n-title muted">网关机 · 待初始化 <span class="tag gerr">缺 SSH 账号</span></div>
          <div class="n-main">{{ sshHost }}</div>
          <div class="n-sub">SSH 账号用于平台登录网关机执行初始化 / 下发</div>
          <button class="btn btn-primary btn-sm node-btn" @click.stop="emitNodeBoxClick($event)">补 SSH 账号</button>
        </div>

        <!-- legs-partial：仅 HTTP 腿，SSH 腿未登记 -->
        <div v-else-if="stage === 'legs-partial'" class="node ghost">
          <div class="n-title muted">未配置网关机</div>
          <div class="n-sub">SSH 腿未登记 · 初始化不可用</div>
        </div>

        <!-- fresh：两腿均空（直连形态 #11） -->
        <div v-else class="node ghost" title="登记两腿后此处显示网关机真实形态">
          <div class="n-title muted">未配置网关机</div>
          <div class="n-sub">直连路径</div>
        </div>
      </div>

      <div class="edge">
        <template v-if="stage === 'fresh'">
          <span class="leg-chip dim">直连</span>
        </template>
        <template v-else>
          <span
            class="leg-chip"
            title="初始化/下发写入网关机 nginx 的节点白名单 map（edge_targets.conf）；✓ = 名单已同步（与当前节点一致）"
          >
            <b>8443 白名单</b> {{ syncedCount }} 节点<span v-if="whitelistSynced" class="st-ok">✓</span>
          </span>
          <span
            class="leg-chip"
            title="「配置跳板转发」以 root 写入 sshd drop-in（PermitOpen）；✓ = 体检证实经跳板转发可达"
          >
            <b>sshd PermitOpen</b><span v-if="sampleSeg?.ok" class="st-ok">✓</span>
          </span>
          <!-- B″ 动作框（初始化网关同款语言：需要时出现、完成即隐）；确认/凭据摩擦由既有 handlePush / openSshdSetup 弹窗承担 -->
          <div v-if="showPushBox" class="push-box">
            <div class="pb-title">白名单待下发 <span class="tag warn">有漂移</span></div>
            <div class="pb-line">
              <span v-if="driftAddedCount" class="c-add">{{ driftAddedCount }} 个未下发</span>
              <span v-if="driftAddedCount && driftRemovedCount" class="pb-sep">·</span>
              <span v-if="driftRemovedCount" class="c-rm">{{ driftRemovedCount }} 个待移除</span>
            </div>
            <button
              class="btn btn-primary btn-sm"
              title="把该局节点白名单推送到网关机（全量替换）；确认弹窗中可核对本次规模与漂移"
              @click="emitPush"
            >
              下发配置
            </button>
          </div>
          <div v-if="showSshdBox" class="push-box sshd">
            <div class="pb-title">跳板转发待配置 <span class="tag warn">体检证据</span></div>
            <div class="pb-line">网关 sshd 禁 TCP 转发（体检报 administratively prohibited）</div>
            <button
              class="btn btn-primary btn-sm"
              title="以 root 写入 sshd drop-in（AllowTcpForwarding + PermitOpen）并 reload；root 密码仅本次使用"
              @click="emitSshd"
            >
              配置跳板转发
            </button>
          </div>
        </template>
      </div>

      <div class="col col-clusters">
        <div
          v-for="cluster in clusters"
          :key="cluster.id"
          class="cluster-card"
          title="点击挂接 / 解挂该集群"
          @click="emitClusterClick(cluster, $event)"
        >
          <div class="cc-head">
            {{ cluster.display_name || cluster.name }}
            <span class="n-count">{{ cluster.nodes.length }} 节点</span>
            <i class="pencil-inline">✎</i>
            <span class="goto">挂接/解挂 ›</span>
          </div>
          <div
            v-for="node in cluster.nodes"
            :key="node.ip + ':' + node.management_port"
            class="nrow"
            :title="nodeHealthTip(node.ip)"
            @click.stop="emitNodeClick(node, cluster)"
          >
            <span class="dot" :class="node.status === 1 ? 'ok' : 'off'"></span>{{ node.ip }}:{{ node.management_port }}
            <span v-if="node.status !== 1 && node.whitelist_state === 'pending_remove'" class="nname">已停用</span>
            <span v-if="node.whitelist_state !== 'synced'" class="tag" :class="wlTagCls(node.whitelist_state)">
              {{ wlTagText(node.whitelist_state) }}
            </span>
            <span v-if="nodeSkipped(node.ip)" class="tag skip">自跳直连</span>
            <span v-if="nodeHealthFail(node.ip)" class="tag gerr">✗</span>
          </div>
        </div>
        <div v-if="!topo && (gateway.attached_cluster_count || 0) > 0" class="degraded-hint">
          已挂接 {{ gateway.attached_cluster_count }} 个集群（节点明细加载中）
        </div>
        <div class="attach-dashed" @click="emitAttach($event)">+ 挂接集群</div>
        <div v-if="stage === 'fresh'" class="direct-guide">
          登记网关机两腿后可经中继进局（<button @click="emitLegClick('http', $event)">去登记</button
          >）。当前按直连执行。
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  type RelayGateway,
  type RelayHealthResult,
  type RelaySegment,
  type RelayTopologyCluster,
  type RelayTopologyNode,
  type RelayTopologyRegion,
} from '@/api/relay'
import {
  attachedCountOf,
  checklistOf,
  nextStepOf,
  sshHostOf,
  stageOf,
  type RelayStageSource,
} from '@/composables/useRelayTopology'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  /** 列表行数据（含 enabled_node_count/push_drift/inventory_group_missing 等注入字段） */
  gateway: RelayGateway
  /** 该区域拓扑明细；加载中/缺失为 null → 降级仅按列表行数据渲染 */
  topo: RelayTopologyRegion | null
  /** 组件态体检结果（未检测为 null）；结构与视图 HealthMeta 兼容 */
  health: { result: RelayHealthResult; checkedAt: string } | null
}>()

// 就地交互（批次三）：编辑类点击一律 emit 意图 + 锚点元素，由视图的 popover 引擎承接；
// 口令与高级参数仍走「更多 ▸ 编辑」旧弹窗（emitMenu('edit') 保持不动）。
const emit = defineEmits<{
  test: []
  push: []
  /** 跳板转发动作框按钮 → 视图打开既有 root 凭据表单弹窗（openSshdSetup；「更多」菜单的 sshd 不经此） */
  sshd: []
  /** ready-init 框上「初始化网关」按钮 → 视图打开初始化轻确认 popover（「更多」菜单的 init 不经此） */
  init: [anchor: HTMLElement]
  'menu-action': [item: string]
  'node-click': [node: RelayTopologyNode, cluster: RelayTopologyCluster]
  'cluster-click': [cluster: RelayTopologyCluster, anchor: HTMLElement]
  'attach-click': [anchor: HTMLElement]
  /** 两腿 chip 就地编辑（配置态=编辑 / dim 态=登记） */
  'leg-click': [kind: 'http' | 'ssh', anchor: HTMLElement]
  /** 卡头名称就地改名 */
  'name-click': [anchor: HTMLElement]
  /** 状态徽章切换确认 */
  'badge-click': [anchor: HTMLElement]
  /** 网关机框（steady 实体卡 / ready-init / init-blocked）整框就地编辑 */
  'node-box-click': [anchor: HTMLElement]
  /** 批次三草稿卡接线预留（草稿卡在视图层，本组件不触发） */
  create: []
}>()

// ── 阶段机（单点派生：composables/useRelayTopology.ts；topo 优先，缺失回退列表行） ──
const stageSource = computed<RelayStageSource>(() => props.topo ?? props.gateway)
const stage = computed(() => stageOf(stageSource.value))
const attachedCount = computed(() => attachedCountOf(props.topo, props.gateway))
const checklist = computed(() => checklistOf(stageSource.value, attachedCount.value))
const nextStep = computed(() => nextStepOf(stageSource.value, attachedCount.value, props.gateway.push_drift))

const clusters = computed(() => props.topo?.clusters ?? [])
const driftAddedCount = computed(() => props.gateway.push_drift?.added.length ?? 0)
const driftRemovedCount = computed(() => props.gateway.push_drift?.removed.length ?? 0)

/** B″ 动作框（初始化网关同款语言：需要时出现、完成即隐）：下发框 = steady 且有漂移（未下发/待移除） */
const showPushBox = computed(() => stage.value === 'steady' && driftAddedCount.value + driftRemovedCount.value > 0)
/** 跳板转发框证据驱动：体检任一失败段（含节点级错误）报出「administratively prohibited」精确标记
 * （后端 _probe_node_ssh_via_jump 检出 ssh stderr 后追加；裸「跳板转发建立失败 (rc=255)」对节点
 * 不可达歧义，不作证据——修错方向比不修更糟）。手动兜底留「更多 ▾」 */
const showSshdBox = computed(() => {
  const segs = props.health?.result?.segments ?? []
  return segs.some(
    (s) =>
      !s.ok &&
      (!!s.error?.includes('administratively prohibited') ||
        (s.nodes ?? []).some((n) => !n.ok && !!n.error?.includes('administratively prohibited'))),
  )
})

const httpConfigured = computed(() => !!stageSource.value.http_base_url)
const sshConfigured = computed(() => !!stageSource.value.ssh_jump)
const httpDisplay = computed(() => (stageSource.value.http_base_url || '').replace(/^https?:\/\//, ''))
const sshHost = computed(() => sshHostOf(stageSource.value.ssh_jump))
const sshUserLabel = computed(() => stageSource.value.ssh_user ?? '')
const sshPortLabel = computed(() => String(props.topo?.ssh_port ?? props.gateway.ssh_port ?? 22))
const prefix = computed(() => props.topo?.openresty_prefix ?? props.gateway.openresty_prefix ?? '')
const prefixTrunc = computed(() => {
  if (!prefix.value) return '（未填）'
  return prefix.value.length > 36 ? prefix.value.slice(0, 30) + '…' + prefix.value.slice(-6) : prefix.value
})

/** 8443 白名单 chip 的节点数：拓扑明细优先（synced 计数），缺失回退列表行启用节点数 */
const syncedCount = computed(() => {
  if (props.topo) {
    return props.topo.clusters.reduce((acc, c) => acc + c.nodes.filter((n) => n.whitelist_state === 'synced').length, 0)
  }
  return props.gateway.enabled_node_count ?? 0
})

// ── 体检（组件态；分段序号固定：0 网关HTTP腿 / 1 SSH跳板 / 2 抽样节点两腿） ──
const httpSeg = computed(() => props.health?.result.segments?.[0])
const sshSeg = computed(() => props.health?.result.segments?.[1])
const sampleSeg = computed(() => props.health?.result.segments?.[2])
/** 8443 白名单 ✓：steady 且已成功下发过（push_drift 非空）且零漂移；从未下发/有漂移不亮（漂移由 B″ 黄框报警） */
const whitelistSynced = computed(
  () => stage.value === 'steady' && !!props.gateway.push_drift && driftAddedCount.value + driftRemovedCount.value === 0,
)

function legBadge(seg?: RelaySegment): string {
  if (!seg) return '未检测'
  return seg.ok ? '✓' : '✗'
}

const healthCls = computed(() => (!props.health ? 'unknown' : props.health.result.ok ? 'ok' : 'fail'))

const healthText = computed(() => {
  if (!props.health) return '未检测'
  if (props.health.result.ok) return '✓ 正常'
  const failed = props.health.result.segments.find((s) => !s.ok)
  return failed ? `✗ ${failed.name}不可达` : '✗ 异常'
})

const healthTimeText = computed(() => (props.health ? formatDateTime(props.health.checkedAt) : ''))

const healthTip = computed(() => {
  if (!props.health) return ''
  const lines = props.health.result.segments.map((s) => `${s.name}：${s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}`}`)
  if (props.health.result.error) lines.push(`错误：${props.health.result.error}`)
  return `体检时间 ${formatDateTime(props.health.checkedAt)}\n${lines.join('\n')}`
})

/** 抽样节点两腿明细按 ip 匹配（relay_health 段 3 的 node 字段即节点 ip） */
function healthEntry(ip: string) {
  return sampleSeg.value?.nodes?.find((n) => n.node === ip)
}

function nodeSkipped(ip: string): boolean {
  return healthEntry(ip)?.ssh_skipped === true
}

function nodeHealthFail(ip: string): boolean {
  const entry = healthEntry(ip)
  return !!entry && entry.ok === false
}

function nodeHealthTip(ip: string): string {
  const entry = healthEntry(ip)
  if (!entry) return ''
  return [entry.error, entry.note].filter(Boolean).join('\n')
}

/** whitelist_state 徽章（服务端派生四态，design D3；synced 只显绿点不出徽章） */
function wlTagCls(state: RelayTopologyNode['whitelist_state']): string {
  if (state === 'pending_add') return 'pend'
  if (state === 'pending_remove') return 'rm'
  return 'skip'
}

function wlTagText(state: RelayTopologyNode['whitelist_state']): string {
  if (state === 'pending_add') return '未下发'
  if (state === 'pending_remove') return '待移除'
  return '已停用'
}

// ── 动作区 emit（多语句 handler 一律提取为函数，约定 #25） ──
function emitTest() {
  emit('test')
}

function emitPush() {
  if (stage.value !== 'steady') return
  emit('push')
}

function emitSshd() {
  emit('sshd')
}

function emitInit(e: MouseEvent) {
  emit('init', e.currentTarget as HTMLElement)
}

function emitAttach(e: MouseEvent) {
  emit('attach-click', e.currentTarget as HTMLElement)
}

function emitMenu(item: string) {
  emit('menu-action', item)
}

function emitNodeClick(node: RelayTopologyNode, cluster: RelayTopologyCluster) {
  emit('node-click', node, cluster)
}

function emitClusterClick(cluster: RelayTopologyCluster, e: MouseEvent) {
  emit('cluster-click', cluster, e.currentTarget as HTMLElement)
}

// ── 就地编辑入口 emit（批次三：锚点元素供视图 popover 引擎定位） ──
function emitLegClick(kind: 'http' | 'ssh', e: MouseEvent) {
  emit('leg-click', kind, e.currentTarget as HTMLElement)
}

function emitNameClick(e: MouseEvent) {
  emit('name-click', e.currentTarget as HTMLElement)
}

function emitBadgeClick(e: MouseEvent) {
  emit('badge-click', e.currentTarget as HTMLElement)
}

function emitNodeBoxClick(e: MouseEvent) {
  emit('node-box-click', e.currentTarget as HTMLElement)
}
</script>

<style scoped>
/* 移植 docs/refactoring/relay-region-topology-mockup.html（视觉基准）；令牌取自 theme.css，
   mockup 专有的 --border-strong / --orange 在站内无对应令牌，就地以同值补齐。 */
.topo-card {
  --border-strong: oklch(74% 0.02 240);
  --orange: #e07a1f;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.topo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px 8px;
}
.th-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.th-left h2 {
  margin: 0;
  font-size: 16px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
.code-tag {
  background: var(--accent-bg);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 7px;
  font-weight: 600;
}
.code-tag.small {
  font-size: 10px;
}
.badge {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
}
.badge.ok {
  background: oklch(70% 0.17 150 / 14%);
  color: var(--success);
}
.badge.off {
  background: oklch(50% 0.018 240 / 10%);
  color: var(--muted);
}
.badge.warn {
  background: oklch(80% 0.15 85 / 18%);
  color: var(--warning);
}
.hchip {
  font-size: 12px;
  font-weight: 600;
}
.hchip.ok {
  color: var(--success);
}
.hchip.fail {
  color: var(--danger);
}
.hchip.unknown {
  color: var(--muted);
  opacity: 0.75;
}
.hchip time {
  color: var(--muted);
  font-weight: 400;
  font-size: 11px;
  margin-left: 4px;
}
.th-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.th-sub {
  padding: 0 18px 12px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.th-sub b {
  color: var(--fg);
}
.th-sub .sep {
  margin: 0 6px;
  opacity: 0.5;
}
.th-sub .c-add {
  color: var(--warning);
  font-weight: 600;
}
.th-sub .c-rm {
  color: var(--orange);
  font-weight: 600;
}
.th-sub .st {
  white-space: nowrap;
}
.th-sub .st b.ok {
  color: var(--success);
  font-weight: 700;
}
.th-sub .st b.no {
  color: var(--muted);
  opacity: 0.55;
  font-weight: 400;
}
.st-miss {
  color: var(--warning);
}

/* 图体：平台 → 两腿 → 网关机 → 分发 → 集群们 */
.topo-body {
  display: flex;
  align-items: stretch;
  padding: 22px 18px;
  gap: 0;
  overflow-x: auto;
}
.col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}
.node {
  background: var(--surface);
  border: 1.5px solid var(--border-strong);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 128px;
  text-align: center;
}
.node .n-title {
  font-weight: 700;
  font-size: 13px;
}
.node .n-title.muted {
  color: var(--muted);
}
.node .n-sub {
  color: var(--muted);
  font-size: 11px;
  margin-top: 2px;
}
.node .n-main {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
}
.node .node-btn {
  margin-top: 8px;
}
.node.ghost {
  border-style: dashed;
  background: transparent;
}

/* 就地编辑（批次三，mockup 移植）：整框可点 + ✎ 悬浮角标 + 徽章/名称可点 */
.node.editable {
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  position: relative;
}
.node.editable:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 10px oklch(56% 0.16 210 / 18%);
}
.node.editable .pencil {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  color: var(--accent);
  opacity: 0;
  transition: opacity 0.15s;
  font-style: normal;
}
.node.editable:hover .pencil {
  opacity: 1;
}
.pencil-inline {
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--accent);
  font-style: normal;
  font-size: 11px;
  margin-left: 4px;
}
.th-left h2 .editable-name {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
}
.th-left h2 .editable-name:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.th-left h2:hover .pencil-inline {
  opacity: 1;
}
.badge.clickable {
  cursor: pointer;
}
.badge.clickable:hover {
  outline: 1.5px solid currentColor;
  outline-offset: 1px;
}
.edge .leg-chip.clickable {
  cursor: pointer;
  border-color: var(--border-strong);
}
.edge .leg-chip.clickable:hover {
  color: var(--fg);
}
.cc-head .goto {
  margin-left: auto;
  color: var(--accent);
  font-size: 11px;
  font-weight: 400;
  opacity: 0;
  transition: opacity 0.15s;
}
.cluster-card:hover .goto,
.cluster-card:hover .pencil-inline {
  opacity: 1;
}

/* 边（连线 + 标签 chip 叠在线上，CSS 伪元素连线） */
.edge {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 240px;
  flex-shrink: 0;
  padding: 10px 0;
}
/* B″ 动作框（2026-11-10）：分发边上「待下发 / 跳板转发待配置」——初始化网关同款语言
   （需要时出现、完成即隐）；确认与凭据摩擦由既有 handlePush / openSshdSetup 弹窗承担 */
.push-box {
  position: relative;
  z-index: 1;
  background: var(--surface);
  border: 1.5px dashed var(--warning);
  border-radius: 10px;
  padding: 10px 12px;
  width: 100%;
  text-align: center;
}
.push-box.sshd {
  border-color: var(--orange);
}
.push-box .pb-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 6px;
}
.push-box .pb-line {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.push-box .pb-line .c-add {
  color: var(--warning);
  font-weight: 600;
}
.push-box .pb-line .c-rm {
  color: var(--orange);
  font-weight: 600;
}
.push-box .pb-sep {
  margin: 0 6px;
  opacity: 0.5;
}
.push-box .btn {
  width: 100%;
}
.edge::before {
  content: '';
  position: absolute;
  left: -2px;
  right: 12px;
  top: 50%;
  height: 2px;
  background: var(--border-strong);
}
.edge::after {
  content: '';
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  border-left: 9px solid var(--border-strong);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
}
.edge .leg-chip {
  position: relative;
  z-index: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11px;
  color: var(--muted);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.edge .leg-chip b {
  color: var(--fg);
  font-weight: 600;
}
.edge .leg-chip .st-ok {
  color: var(--success);
  font-weight: 700;
}
.edge .leg-chip .st-fail {
  color: var(--danger);
  font-weight: 700;
}
.edge .leg-chip.dim {
  opacity: 0.65;
  border-style: dashed;
}

/* 集群列 */
.col-clusters {
  flex: 1 1 auto;
  min-width: 330px;
  max-width: 520px;
  gap: 12px;
}
.cluster-card {
  border: 1.5px solid var(--border-strong);
  border-radius: 10px;
  padding: 10px 14px 8px;
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.cluster-card:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 10px oklch(56% 0.16 210 / 18%);
}
.cc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 4px;
}
.cc-head .n-count {
  color: var(--muted);
  font-weight: 400;
  font-size: 11px;
}
.nrow {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border-top: 1px dashed var(--border);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
}
.nrow:hover {
  background: var(--accent-bg);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 4px;
}
.nrow:first-of-type {
  border-top: none;
}
.nrow .nname {
  color: var(--muted);
  font-family: inherit;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.ok {
  background: var(--success);
}
.dot.off {
  background: oklch(65% 0.01 240);
}
.tag {
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.tag.pend {
  background: oklch(80% 0.15 85 / 18%);
  color: var(--warning);
}
.tag.rm {
  background: oklch(75% 0.14 55 / 18%);
  color: var(--orange);
}
.tag.skip {
  background: oklch(50% 0.018 240 / 8%);
  color: var(--muted);
  font-weight: 400;
}
.tag.gerr {
  background: oklch(60% 0.2 25 / 12%);
  color: var(--danger);
}
.tag.gwarn {
  background: oklch(80% 0.15 85 / 18%);
  color: var(--warning);
}
.attach-dashed {
  border: 1.5px dashed var(--border-strong);
  border-radius: 10px;
  padding: 9px 14px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  background: transparent;
}
.attach-dashed:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 直连区域引导 / 降级提示 */
.direct-guide {
  font-size: 12px;
  color: var(--muted);
  padding: 6px 2px 0;
}
.direct-guide button {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}
.degraded-hint {
  font-size: 12px;
  color: var(--muted);
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  padding: 8px 14px;
  text-align: center;
}

/* 卡头菜单二级描述（与表格「更多 ▾」同款） */
</style>
