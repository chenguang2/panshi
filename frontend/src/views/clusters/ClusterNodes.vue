<template>
  <div class="tab-content node-tab">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openNodeForm(null)">
        <StrokeIcon name="plus" :size="13" /> 添加节点
      </a-button>
      <a-button size="small" @click="openNodeImportModal"> <StrokeIcon name="upload" :size="13" /> 批量导入 </a-button>
      <a-button size="small" @click="handleEditSelectedNode" :disabled="!singleOpEnabled">编辑节点</a-button>
      <a-button size="small" danger :disabled="!deleteEnabled" @click="handleDeleteClick"
        >删除节点{{ deleteCount > 0 ? `(${deleteCount})` : '' }}</a-button
      >
      <a-divider type="vertical" />
      <a-button size="small" @click="handleNodeStart" :disabled="!(singleOpEnabled || batchOpEnabled)">
        <StrokeIcon name="play" :size="13" /> 启动{{ batchCount > 0 ? `(${batchCount})` : '' }}
      </a-button>
      <a-button size="small" @click="handleNodeStop" :disabled="!(singleOpEnabled || batchOpEnabled)">
        <StrokeIcon name="pause" :size="13" /> 停止{{ batchCount > 0 ? `(${batchCount})` : '' }}
      </a-button>
      <a-button size="small" @click="handleNodeReload" :disabled="!(singleOpEnabled || batchOpEnabled)">
        <StrokeIcon name="rotate" :size="13" /> 重载{{ batchCount > 0 ? `(${batchCount})` : '' }}
      </a-button>
      <a-button size="small" @click="handleNodeStatusQuery" :disabled="!(singleOpEnabled || batchOpEnabled)"
        >状态查询{{ batchCount > 0 ? `(${batchCount})` : '' }}</a-button
      >
      <a-dropdown
        v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')"
        :trigger="['click']"
      >
        <a-button size="small" :disabled="!cluster.selectedNode">
          安装 <StrokeIcon name="chevronDown" :size="13" />
        </a-button>
        <template #overlay>
          <a-menu>
            <a-menu-item
              v-if="featuresStore.has('install_openresty')"
              @click="() => handleInstallOpenresty()"
              :disabled="!cluster.selectedNode"
            >
              <div class="menu-item-stack">
                <span>安装 OpenResty</span>
                <small>选择安装包在节点上安装 OpenResty</small>
              </div>
            </a-menu-item>
            <a-menu-item
              v-if="featuresStore.has('install_edge')"
              @click="() => handleInstallEdge()"
              :disabled="!cluster.selectedNode"
            >
              <div class="menu-item-stack">
                <span>安装 Edge</span>
                <small>在节点 edge_path 部署 Edge 程序</small>
              </div>
            </a-menu-item>
            <a-menu-item
              v-if="featuresStore.has('install_edge')"
              @click="() => handleAssociateNewOpenresty()"
              :disabled="!cluster.selectedNode"
            >
              <div class="menu-item-stack">
                <span>关联新 OpenResty</span>
                <small>把本机 Edge 切换关联到新装的 OpenResty</small>
              </div>
            </a-menu-item>
            <a-menu-item
              v-if="featuresStore.has('install_edge')"
              @click="() => handleEdgePackManagement()"
              :disabled="!cluster.selectedNode"
            >
              <div class="menu-item-stack">
                <span>升级 Edge 小版本</span>
                <small>版本包管理与 Edge 小版本升级</small>
              </div>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
      <div class="toolbar-right">
        <ColumnConfigPopover
          v-model:open="nodeColumnPopoverVisible"
          :all-columns="allNodeColumns"
          v-model:columns="nodeColumnsSelected"
          :all-actions="allNodeActionButtons"
          v-model:actions="nodeActionsSelected"
          v-model:search="nodeSearchVisible"
          width-resettable
          @reset-widths="handleResetColumnWidths"
        />
        <a-button size="small" @click="loadNodes(cluster)"><StrokeIcon name="rotate" :size="13" /> 刷新</a-button>
        <template v-if="nodeSearchVisible">
          <SearchInput
            v-model="cluster.nodesSearch"
            placeholder="搜索节点"
            :width="150"
            size="small"
            @search="
              () => {
                cluster.nodesPagination!.page = 1
                cluster.selectedNodeKeys = []
                cluster.selectedNode = null
                loadNodes(cluster)
              }
            "
          />
          <a-select
            v-model:value="cluster.nodesSearchField"
            placeholder="字段"
            style="width: 90px"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="ip">IP</a-select-option>
          </a-select>
        </template>
      </div>
    </div>
    <a-table
      :columns="nodeTableColumns"
      :data-source="cluster.nodes || []"
      :pagination="false"
      :row-selection="{
        selectedRowKeys: cluster.selectedNodeKeys || [],
        preserveSelectedRowKeys: true,
        columnWidth: 40,
        onChange: (keys: unknown, rows: unknown[]) =>
          selectNodes(cluster, keys as number[], rows as import('@/types').Node[]),
      }"
      :custom-row="
        (record: import('@/types').Node) => ({
          onClick: () => {
            cluster.selectedNode = record
          },
        })
      "
      :loading="cluster.nodesLoading"
      :showSorterTooltip="false"
      :scroll="{ x: 1076 }"
      :table-layout="'fixed'"
      size="small"
      row-key="id"
      class="node-table grid-table"
      @change="
        (_pag: Record<string, unknown>, _filters: unknown, sorter: Record<string, unknown> | null) =>
          handleNodeSortChange(cluster, sorter)
      "
    >
      <template #emptyText>
        <EmptyState title="暂无节点" description="添加节点后可执行安装、启停与状态查询">
          <a-button size="small" type="primary" @click="openNodeForm(null)">添加节点</a-button>
        </EmptyState>
      </template>
      <template #headerCell="{ column, title }">
        <!-- 序号列：恒展示、不可拖拽（不进列配置） -->
        <span v-if="column.key === 'index'">{{ title }}</span>
        <span
          v-else
          class="th-resize-wrap"
          :class="nodeColumnWrapClass(column)"
          @mousedown="startColumnMove($event, column)"
        >
          <span>{{ title }}</span>
          <span class="col-resize-handle" @mousedown="startColumnResize($event, column)" />
        </span>
      </template>
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'index'">
          <span class="c-idx">{{ rowIndexLabel(cluster, index) }}</span>
        </template>
        <template v-if="column.key === 'edge_version'">
          {{ record.status_detail?.statistic?.edge_version || '-' }}
        </template>
        <template v-if="column.key === 'status'">
          <div class="node-status-cell">
            <!-- 状态格 = 两枚无圆点胶囊（central.html 第 323/333/343 行 .pub-cell > .ps-tag）：
                 ① 管理开关态（已启用/已禁用）② 运行态（在线/离线/未检测）。
                 与节点独立页 NodeList.vue 的单枚 .pill-run「运行中/已停止」刻意不同——
                 独立页设计 nodes.html 只有运行态一列，最大化面板设计 central.html 两枚并列。 -->
            <span
              v-if="record.status === 0"
              class="ps-tag ps-unpub"
              title="管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询"
              >已禁用</span
            >
            <span v-else class="ps-tag ps-pub" title="管理开关：已启用">已启用</span>
            <span v-if="nginxState(record) === 'running'" class="ps-tag ps-pub" title="运行态：在线（Edge 进程运行中）"
              >在线</span
            >
            <span
              v-else-if="nginxState(record) === 'stopped'"
              class="ps-tag ps-partial"
              title="运行态：离线（Edge 进程已停止）"
              >离线</span
            >
            <span v-else class="ps-tag ps-unpub" title="运行态：未检测">未检测</span>
            <!-- 检测时效（batch2 2.2 / D3）：无 last_execution 不渲染 -->
            <span v-if="record.status_detail?.last_execution" class="status-exec-time"
              >{{ formatRelativeTime(record.status_detail.last_execution) }}检测</span
            >
          </div>
        </template>
        <template v-if="column.key === 'actions'">
          <!-- 行内动作收敛（parity 批 B / 设计 .ops）：主行动「重载」+ ghost「状态」+ ⋯ 三栏菜单。
               配置机制保留：⋯ 内只渲染被勾选的动作（status 固定为 ghost、reload 固定为主行动） -->
          <div class="action-cell">
            <button type="button" class="op-pub" @click="handleNodeActionWithConfirm(cluster, record, 'reload')">
              重载
            </button>
            <button
              v-if="nodeActionsSelected.includes('status')"
              type="button"
              class="op-pub op-ghost"
              @click="handleNodeActionWithConfirm(cluster, record, 'status')"
            >
              状态
            </button>
            <a-dropdown v-if="hasNodeRowMenu" :trigger="['click']">
              <a-button type="text" size="small" class="action-trigger-btn" title="更多操作" aria-label="更多操作">
                <StrokeIcon name="dots" />
              </a-button>
              <template #overlay>
                <a-menu class="l5-action-menu">
                  <a-menu-item
                    v-for="btn in nodeMenuGroups.crud"
                    :key="btn.key"
                    @click="handleNodeActionWithConfirm(cluster, record, btn.key)"
                    >{{ btn.title }}</a-menu-item
                  >
                  <a-menu-divider v-if="nodeMenuGroups.danger.length" />
                  <a-menu-item
                    v-for="btn in nodeMenuGroups.danger"
                    :key="btn.key"
                    danger
                    @click="handleNodeActionWithConfirm(cluster, record, btn.key)"
                  >
                    <div class="menu-item-stack">
                      <span>{{ btn.title }}</span>
                      <small v-if="btn.desc">{{ btn.desc }}</small>
                    </div>
                  </a-menu-item>
                  <a-menu-divider v-if="nodeMenuGroups.action.length" />
                  <a-menu-item
                    v-for="btn in nodeMenuGroups.action"
                    :key="btn.key"
                    @click="handleNodeActionWithConfirm(cluster, record, btn.key)"
                    >{{ btn.title }}</a-menu-item
                  >
                  <template v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')">
                    <a-menu-divider />
                    <a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty(record)">
                      <div class="menu-item-stack">
                        <span>安装 OpenResty</span>
                        <small>选择安装包在节点上安装 OpenResty</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge(record)">
                      <div class="menu-item-stack">
                        <span>安装 Edge</span>
                        <small>在节点 edge_path 部署 Edge 程序</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleAssociateNewOpenresty(record)">
                      <div class="menu-item-stack">
                        <span>关联新 OpenResty</span>
                        <small>把本机 Edge 切换关联到新装的 OpenResty</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleEdgePackManagement(record)">
                      <div class="menu-item-stack">
                        <span>升级 Edge 小版本</span>
                        <small>版本包管理与 Edge 小版本升级</small>
                      </div>
                    </a-menu-item>
                  </template>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </template>
      </template>
    </a-table>

    <!-- 表外分页条（components/ListPager.vue）：a-table 分页关闭，服务端分页由本组件承担 -->
    <ListPager
      :page="cluster.nodesPagination?.page ?? 1"
      :page-size="cluster.nodesPagination?.pageSize ?? 20"
      :total="cluster.nodesPagination?.total ?? 0"
      unit="个节点"
      @change="onNodePageChange"
    />

    <!-- 单条新增/编辑：共享表单（B2b-1，与 B1 的 UpstreamFormModal 同构）。
         面板只有一个集群 → 传单元素清单并锁集群；提交/校验全在组件内，这里只管关闭 + 局部刷新。 -->
    <NodeFormModal
      :visible="nodeFormVisible"
      :editing-node="nodeFormRecord"
      :copying-node="nodeFormCopying"
      :clusters="formClusters"
      :default-cluster-id="props.cluster.id"
      lock-cluster
      @close="closeNodeForm"
      @saved="onNodeFormSaved"
    />

    <!-- 批量导入：共享弹窗（B2b-2，与节点管理页同一实现；本宿主只做开关 + 局部刷新） -->
    <NodeBatchImportModal
      :visible="batchImportVisible"
      :cluster-id="props.cluster.id"
      :cluster-name="props.cluster.display_name || props.cluster.name"
      lock-cluster
      @close="batchImportVisible = false"
      @saved="onBatchImportSaved"
    />

    <ConfigDiff v-model:visible="diffDrawerVisible" :cluster-id="diffClusterId" :initial-node-id="diffNodeId" />

    <NodeExecutionResultDrawer
      v-model:visible="execDrawerVisible"
      :title="execDrawerTitle"
      :progress="execProgress"
      :logs="execLogs"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      :elapsed="execElapsed"
      :installing="installInstalling"
      :stream-error="installError"
      :stream-status="installStatus"
      @cancel="handleCancelInstall"
    />

    <BatchActionProgressModal
      v-model:visible="batchProgressVisible"
      :title="batchProgressTitle"
      :items="batchProgressItems"
      :expanded-ip="batchProgressExpandedIp"
      @toggle-expand="batchProgressExpandedIp = batchProgressExpandedIp === $event ? null : $event"
    />

    <!-- 动作确认弹窗（batch3 5.1 / F3）：统一走共享 showDangerConfirm（useOverlayModal），无本页手写确认模板 -->

    <InstallOpenrestyDialog
      :visible="installDialogVisible"
      :node="installTargetNode"
      :cluster-id="installTargetNode?.cluster_id ?? 0"
      @confirm="onInstallConfirm"
      @close="closeInstallDialog"
    />

    <EdgePackManagementDialog
      v-model:visible="edgePackDialogVisible"
      :node="edgePackDialogNode"
      :cluster-id="edgePackDialogNode?.cluster_id ?? 0"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted, toValue } from 'vue'
import type { Cluster, Node } from '@/types'
import { formatRelativeTime } from '@/utils/format'
import ConfigDiff from '@/views/ConfigDiff.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import InstallOpenrestyDialog from '@/components/InstallOpenrestyDialog.vue'
import EdgePackManagementDialog from '@/components/EdgePackManagementDialog.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import NodeFormModal from '@/components/NodeFormModal.vue'
import NodeBatchImportModal from '@/components/NodeBatchImportModal.vue'
import BatchActionProgressModal from '@/components/BatchActionProgressModal.vue'
import api from '@/api'
import { buildNodeInstallCommand } from '@/utils/nodeInstallCommand'
import {
  useClusterNodes,
  allNodeColumns,
  allNodeActionButtons,
  nginxState,
  createCancelNodeInstallHandler,
} from '@/composables/useClusterNodes'
import { showDangerConfirm } from '@/composables/useOverlayModal'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { message } from 'ant-design-vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { useFeaturesStore } from '@/stores/features'
import SearchInput from '@/components/SearchInput.vue'
import ColumnConfigPopover from '@/components/ColumnConfigPopover.vue'
import ListPager from '@/components/ListPager.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import EmptyState from '@/components/EmptyState.vue'

const featuresStore = useFeaturesStore()

// 运行态判定已收敛到 useClusterNodes.nginxState（batch2 1.1 / D1：三元、不假绿）

const props = defineProps<{
  cluster: Cluster
}>()

// batch2 2.3 / D4：删除 emit('refresh') 接地——CentralList 的 @refresh="loadClusters" 是
// 禁用的全量刷新（重建 cluster 对象硬编码 activeTab:'nodes'，会踢回首签并卸载面板）。
// Tab 刷新一律走面板局部 loadNodes(cluster)。

// Wrap single cluster prop into a Ref<Cluster[]> for the composable
const clusters = computed<Cluster[]>(() => [props.cluster])

const {
  diffDrawerVisible,
  diffClusterId,
  diffNodeId,
  nodeColumnPopoverVisible,
  nodeColumnsSelected,
  nodeColumnWidths,
  setNodeColumnWidth,
  resetNodeColumnWidths,
  nodeColumnOrder,
  setNodeColumnOrder,
  orderedNodeColumns,
  nodeSearchVisible,
  nodeActionsSelected,
  visibleNodeColumns,
  handleNodeAction,
  handleNodeTableChange,
  loadNodes,
  selectNode,
  selectNodes,
  deleteNode,
  deleteNodes,
  batchNodeAction,
  batchNodeStatus,
  batchProgressVisible,
  batchProgressTitle,
  batchProgressItems,
  batchProgressExpandedIp,
  startNode,
  stopNode,
  queryNodeStatus,
  executeNodeAction,
  execDrawerVisible,
  execDrawerTitle,
  execProgress,
  execLogs,
  execResult,
  execHighlights,
  execStatistics,
  execElapsed,
} = useClusterNodes({
  clusters,
})

// ── 单条表单（B2b-1：表单/校验/提交已迁至 components/NodeFormModal.vue）──
// 面板只有当前集群：单元素清单（组件内 ClusterSelect 禁用，add 态仅一个可选项）。
// 新增/编辑/复制均以「编辑源记录 + copyingNode」入参，与 B1 上游面板同构。
const formClusters = computed(() => [
  { id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name },
])
const nodeFormVisible = ref(false)
const nodeFormRecord = ref<Node | null>(null)
const nodeFormCopying = ref(false)
// 批量导入（B2b-2：共享 NodeBatchImportModal，本宿主只持开关）
const batchImportVisible = ref(false)

function openNodeForm(record: Node | null, copy = false) {
  // 与批量导入弹窗互斥（两者各自独立弹窗，同一时刻只显示一个）
  batchImportVisible.value = false
  nodeFormRecord.value = record
  nodeFormCopying.value = copy && record != null
  nodeFormVisible.value = true
}

function handleEditSelectedNode() {
  const node = props.cluster.selectedNode
  if (!node) {
    message.warning('请先选择一个节点')
    return
  }
  openNodeForm(node)
}

function closeNodeForm() {
  nodeFormVisible.value = false
  nodeFormRecord.value = null
  nodeFormCopying.value = false
}

/** 保存成功（组件已 emit saved + close）：刷新该集群节点列表（面板局部刷新，不重建 cluster 对象） */
async function onNodeFormSaved() {
  closeNodeForm()
  await loadNodes(props.cluster)
}

/** 批量导入弹窗入口（共享 NodeBatchImportModal；与单条表单互斥） */
function openNodeImportModal() {
  nodeFormVisible.value = false
  batchImportVisible.value = true
}

/** 批量导入成功（组件已 emit saved）：局部刷新本集群节点列表（弹窗保持打开以查看逐条结果） */
async function onBatchImportSaved() {
  await loadNodes(props.cluster)
}

// ── 列拖拽手势（调宽 + 移动）共享 composable（cluster-tab-column-personalization 2.2）──
// 几何作用域由 composable 按拖拽起点所在的表解析：统一管理页同屏可展开多张卡片，
// 全文档选择器会跨表串扰（D2）。ip/actions 为扫描锚点，不参与移动。
const {
  wrapClass: nodeColumnWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => allNodeColumns,
  orderedKeys: () => orderedNodeColumns.value.map((c) => String(c.key)),
  getWidth: (key) => nodeColumnWidths.value[key],
  setColumnWidth: setNodeColumnWidth,
  setColumnOrder: setNodeColumnOrder,
  tableSelector: '.node-table',
  fixedKeys: ['ip', 'actions'],
})

function handleResetColumnWidths(): void {
  resetNodeColumnWidths()
  nodeColumnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

// ── 表格序号列 + 表外分页（central-management-parity 批次 A）─────────────
// 序号列恒展示、不进列配置勾选项（antd CheckboxGroup 会剔除选项外的已选值），
// 位于 row-selection 勾选列之后（勾选列由 a-table 自行渲染）。
const NODE_INDEX_COLUMN = { title: '#', key: 'index', width: 45, align: 'center' as const }

const nodeTableColumns = computed(() => [NODE_INDEX_COLUMN, ...toValue(visibleNodeColumns)])

/** 后端分页序号 = (page-1)*pageSize + 本页行号 + 1（#59 表格解剖） */
function rowIndexLabel(cluster: Cluster, index: number): number {
  const pag = cluster.nodesPagination
  return ((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1
}

/** ListPager 翻页：写回分页状态 → 清选择 → 复用既有加载函数 */
function onNodePageChange(page: number, pageSize: number): void {
  if (!props.cluster.nodesPagination) return
  props.cluster.nodesPagination.page = page
  props.cluster.nodesPagination.pageSize = pageSize
  props.cluster.selectedNodeKeys = []
  props.cluster.selectedNode = null
  loadNodes(props.cluster)
}

/**
 * 排序回调：`:pagination="false"` 下 antd 的 change 事件 pagination 恒为 `{}`，
 * 直接透传会把 page/pageSize 写成 undefined —— 这里钉住当前分页值，只让排序分支生效。
 */
function handleNodeSortChange(cluster: Cluster, sorter: Record<string, unknown> | null): void {
  const pag = cluster.nodesPagination
  handleNodeTableChange(cluster, { current: pag?.page || 1, pageSize: pag?.pageSize || 20 }, sorter)
}

// ── batch delete selection state ─────────────────────────────
const batchCount = computed(() => (props.cluster.selectedNodeKeys || []).length)
const singleOpEnabled = computed(
  () => batchCount.value <= 1 && (!!props.cluster.selectedNode || batchCount.value === 1),
)
const batchOpEnabled = computed(() => batchCount.value > 1)
const deleteCount = computed(() => (batchCount.value > 0 ? batchCount.value : props.cluster.selectedNode ? 1 : 0))
const deleteEnabled = computed(() => deleteCount.value > 0)

function handleDeleteClick() {
  if (batchCount.value > 0) {
    deleteNodes(props.cluster)
  } else {
    deleteNode(props.cluster)
  }
}

// ── ⋯ 行内动作菜单（设计 .l5-menu 三栏：CRUD → 危险 → 动作；#81） ──────────────
// 行内只有「重载」（主行动，非配置项）+「状态」（ghost，勾选 status 才显示）。
// 菜单 = 恒驻动作（编辑/复制/删除/数据库对比，无其它入口，必须常驻否则不可达）
//      + 被勾选的「启动/停止」（列配置「行动作按钮集」语义）+ 安装项（特性开关）。
// 这样既保留配置机制，也不让 复制/数据库对比 因未勾选而彻底失去入口。
const NODE_MENU_TOGGLEABLE_KEYS = ['start', 'stop']
const nodeMenuGroups = computed(() => {
  const selected = new Set(nodeActionsSelected.value)
  return {
    crud: allNodeActionButtons.filter(
      (b) => !b.danger && b.key !== 'status' && !NODE_MENU_TOGGLEABLE_KEYS.includes(b.key),
    ),
    danger: allNodeActionButtons.filter((b) => b.danger),
    action: allNodeActionButtons.filter((b) => NODE_MENU_TOGGLEABLE_KEYS.includes(b.key) && selected.has(b.key)),
  }
})
const hasNodeRowMenu = computed(
  () =>
    nodeMenuGroups.value.crud.length + nodeMenuGroups.value.danger.length + nodeMenuGroups.value.action.length > 0 ||
    featuresStore.has('install_openresty') ||
    featuresStore.has('install_edge'),
)

// ── Custom Confirm (matches NodeList.vue pattern) ──
function selectedNodeIps(): string[] {
  const keys = props.cluster.selectedNodeKeys || []
  return (props.cluster.nodes || []).filter((n) => keys.includes(n.id)).map((n) => n.ip)
}

function confirmTitle(count: number, ips: string[]): string {
  return count > 3
    ? `确认对选中的 ${count} 个节点执行操作？${ips.slice(0, 3).join('、')} 等 ${count} 条`
    : `确认对选中的 ${count} 个节点执行操作？${ips.join('、')}`
}

function handleNodeStart() {
  const node = props.cluster.selectedNode
  if (batchCount.value > 0) {
    const ips = selectedNodeIps()
    showDangerConfirm('确认批量启动节点', confirmTitle(batchCount.value, ips), `确认启动(${batchCount.value})`, () =>
      batchNodeAction(props.cluster, 'start', '启动'),
    )
    return
  }
  if (!node) return
  showDangerConfirm('确认启动节点', `即将对节点 ${node.ip} 执行"启动"操作，确认无误后继续。`, '确认启动', () =>
    executeNodeAction(node, 'start', '启动'),
  )
}

function handleNodeStop() {
  const node = props.cluster.selectedNode
  if (batchCount.value > 0) {
    const ips = selectedNodeIps()
    showDangerConfirm(
      '确认批量停止节点',
      `${confirmTitle(batchCount.value, ips)}。停止后所有选中节点上的流量将中断，请确认操作无误。`,
      `确认停止(${batchCount.value})`,
      () => batchNodeAction(props.cluster, 'stop', '停止'),
    )
    return
  }
  if (!node) return
  showDangerConfirm(
    '确认停止节点',
    `即将对节点 ${node.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    '确认停止',
    () => executeNodeAction(node, 'stop', '停止'),
  )
}

function handleNodeReload() {
  if (batchCount.value > 0) {
    const ips = selectedNodeIps()
    showDangerConfirm('确认批量重载节点', confirmTitle(batchCount.value, ips), `确认重载(${batchCount.value})`, () =>
      batchNodeAction(props.cluster, 'reload', 'reload'),
    )
    return
  }
  const node = props.cluster.selectedNode
  if (!node) return
  handleNodeActionWithConfirm(props.cluster, node, 'reload')
}

function handleNodeStatusQuery() {
  if (batchCount.value > 0) {
    const ips = selectedNodeIps()
    showDangerConfirm('确认批量状态查询', confirmTitle(batchCount.value, ips), `确认查询(${batchCount.value})`, () =>
      batchNodeStatus(props.cluster),
    )
    return
  }
  const node = props.cluster.selectedNode
  if (node) queryNodeStatus(node)
}

function handleNodeActionWithConfirm(cluster: Cluster, record: Node, btnKey: string) {
  // 编辑/复制由共享 NodeFormModal 承载（B2b-1），其余动作仍走 composable 单一实现
  if (btnKey === 'edit' || btnKey === 'copy') {
    openNodeForm(record, btnKey === 'copy')
    return
  }
  if (btnKey === 'start') {
    showDangerConfirm('确认启动节点', `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`, '确认启动', () =>
      executeNodeAction(record, 'start', '启动'),
    )
  } else if (btnKey === 'stop') {
    showDangerConfirm(
      '确认停止节点',
      `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
      '确认停止',
      () => executeNodeAction(record, 'stop', '停止'),
    )
  } else if (btnKey === 'reload') {
    showDangerConfirm(
      '确认重新加载节点',
      `即将对节点 ${record.ip} 执行"重载"操作，重新加载配置，确认继续？`,
      '确认重载',
      () => executeNodeAction(record, 'reload', 'reload'),
    )
  } else {
    handleNodeAction(cluster, record, btnKey)
  }
}

// ── Install OpenResty Dialog ─────────────────────────────────────
const installDialogVisible = ref(false)
const installTargetNode = ref<any>(null)

// ── Install OpenResty / Edge streaming ──────────────────────────────
const installStream = useInstallStream()
const cancelling = ref(false)
const execTargetNode = ref<any | null>(null)
const { installing: installInstalling, error: installError, status: installStatus } = installStream

let _installTimer: ReturnType<typeof setInterval> | null = null
function clearInstallTimer() {
  if (_installTimer) {
    clearInterval(_installTimer)
    _installTimer = null
  }
}

// batch3 1.1 / D1：命令构建收敛到 utils/nodeInstallCommand 共享纯函数
// （原本地实现仍输出批 1 已清理的硬编码绝对路径与硬编码账号，属活缺陷，已修复）

/** target 由行内 ⋯ 菜单传入具体节点；工具条入口沿用当前选中节点 */
function handleInstallOpenresty(target?: Node) {
  const node = target ?? props.cluster.selectedNode
  if (!node) return
  installTargetNode.value = node
  installDialogVisible.value = true
}

function closeInstallDialog() {
  installDialogVisible.value = false
}

function onInstallConfirm(payload: { node: any; clusterId: number; openrestyFile: string }) {
  installDialogVisible.value = false
  const node = payload.node
  execTargetNode.value = node
  const prefix = node.openresty_path
  execDrawerVisible.value = true
  execDrawerTitle.value = `安装 OpenResty - ${node.ip}`
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  // batch2 5.3 / D8：计时器只负责已耗时；安装流保留服务端真实百分比（不再 200s 外推）
  execElapsed.value = 0
  clearInstallTimer()
  _installTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
  }, 1000)

  installStream.start(
    `/clusters/${node.cluster_id}/nodes/${node.id}/install-openresty`,
    { prefix, openresty_file: payload.openrestyFile },
    {
      onLine: (line: string) => {
        execLogs.value = [...execLogs.value, line]
      },
      onProgress: (percent: number) => {
        if (percent > execProgress.percent) execProgress.percent = percent
      },
      onComplete: (rc: number, _status: string) => {
        clearInstallTimer()
        execProgress.status = rc === 0 ? 'success' : 'exception'
        execProgress.percent = 100
        execProgress.indeterminate = false
        const prevCmd = execResult.value?.command || ''
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
      },
      onError: () => {
        clearInstallTimer()
      },
    },
  )
}

function handleInstallEdge(target?: Node) {
  const node = target ?? props.cluster.selectedNode
  if (!node) return
  showDangerConfirm(
    '\u786e\u8ba4\u5b89\u88c5 Edge',
    `\u5373\u5c06\u5728\u8282\u70b9 ${node.ip} \u4e0a\u5b89\u88c5 Edge\uff08${node.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = node
      const installPrefix = node.openresty_path || node.edge_path
      const pendingCommand = buildNodeInstallCommand(node, 'install_edge', { prefix: installPrefix || '' })
      execDrawerVisible.value = true
      execDrawerTitle.value = `\u5b89\u88c5 Edge - ${node.ip}`
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
      // batch2 5.3 / D8：计时器只负责已耗时；安装流保留服务端真实百分比（不再 200s 外推）
      execElapsed.value = 0
      clearInstallTimer()
      _installTimer = setInterval(() => {
        execElapsed.value = (execElapsed.value ?? 0) + 1
      }, 1000)

      installStream.start(
        `/clusters/${node.cluster_id}/nodes/${node.id}/install-edge`,
        { prefix: installPrefix },
        {
          onLine: (line: string) => {
            execLogs.value = [...execLogs.value, line]
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            clearInstallTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            execProgress.indeterminate = false
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: () => {
            clearInstallTimer()
          },
        },
      )
    },
  )
}

// batch3 1.2 / D2：取消安装收敛到共享工厂（差异裁决见工厂注释：确认走 showDangerConfirm、失败提取 getApiErrorMessage）
const handleCancelInstall = createCancelNodeInstallHandler({
  execTargetNode,
  cancelling,
  execLogs,
  execProgress,
  execResult,
  installStream,
})

// ── 关联新 OpenResty ──

function handleAssociateNewOpenresty(target?: Node) {
  const node = target ?? props.cluster.selectedNode
  if (!node) return
  const prefix = node.openresty_path || ''
  showDangerConfirm(
    '关联新 OpenResty',
    `即将把节点 ${node.ip} 的 Edge（${node.edge_path}）关联到新 OpenResty（${prefix}），确认开始？`,
    '确认关联',
    async () => {
      execTargetNode.value = node
      execDrawerVisible.value = true
      execDrawerTitle.value = `关联新 OpenResty - ${node.ip}`
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      // batch2 5.3 / D8：动作流（关联新 OpenResty）起始形态为不确定态
      execProgress.indeterminate = true
      execResult.value = { stdout: '', stderr: '', command: '', rc: null }
      execElapsed.value = 0
      clearInstallTimer()
      _installTimer = setInterval(() => {
        execElapsed.value = (execElapsed.value ?? 0) + 1
      }, 1000)

      installStream.start(
        `/clusters/${node.cluster_id}/nodes/${node.id}/associate-new-openresty`,
        {},
        {
          onLine: (line: string) => {
            execLogs.value = [...execLogs.value, line]
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            clearInstallTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            execProgress.indeterminate = false
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: () => {
            clearInstallTimer()
            execProgress.indeterminate = false
          },
        },
      )
    },
  )
}

// ── 升级 Edge 小版本 ──

const edgePackDialogVisible = ref(false)
const edgePackDialogNode = ref<any>(null)

function handleEdgePackManagement(target?: Node) {
  edgePackDialogNode.value = target ?? props.cluster.selectedNode
  edgePackDialogVisible.value = true
}

function streamEdgeAction(node: any, title: string, url: string, body: Record<string, any>) {
  execTargetNode.value = node
  execDrawerVisible.value = true
  execDrawerTitle.value = title
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  // batch2 5.3 / D8：动作流（添加版本包/切换版本）起始形态为不确定态；计时器只负责已耗时
  execProgress.indeterminate = true
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  execElapsed.value = 0
  clearInstallTimer()
  _installTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
  }, 1000)

  installStream.start(url, body, {
    onLine: (line: string) => {
      execLogs.value = [...execLogs.value, line]
    },
    onProgress: (percent: number) => {
      if (percent > execProgress.percent) execProgress.percent = percent
    },
    onComplete: (rc: number, _status: string) => {
      clearInstallTimer()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      execProgress.indeterminate = false
      const prevCmd = execResult.value?.command || ''
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
    },
    onError: () => {
      clearInstallTimer()
      execProgress.indeterminate = false
    },
  })
}

function onEdgePackAdd(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.node) return
  streamEdgeAction(
    detail.node,
    `添加版本包 - ${detail.node.ip}`,
    `/clusters/${detail.clusterId}/nodes/${detail.node.id}/edge-pack-add`,
    { pack_file: detail.packFile },
  )
}

function onEdgePackRebase(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.node) return
  streamEdgeAction(
    detail.node,
    `切换版本 - ${detail.node.ip}`,
    `/clusters/${detail.clusterId}/nodes/${detail.node.id}/edge-pack-rebase`,
    { version: detail.version },
  )
}

onMounted(() => {
  window.addEventListener('edge-pack-add', onEdgePackAdd)
  window.addEventListener('edge-pack-rebase', onEdgePackRebase)
})

onUnmounted(() => {
  // 离开页面时停掉安装进度定时器（范式：RelayGateways.vue），避免后台残留
  clearInstallTimer()
  window.removeEventListener('edge-pack-add', onEdgePackAdd)
  window.removeEventListener('edge-pack-rebase', onEdgePackRebase)
})
</script>

<style scoped>
.tab-content {
  min-height: 100px;
}

/* 状态单元格：运行态/配置态徽章并排 + 检测时效弱化文字（batch2 1.2/1.3/2.2）
   gap 6 = 设计 .pub-cell 值（parity max-r2 批次 C） */
.node-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.status-exec-time {
  font-size: 12px;
  color: var(--muted);
}

.node-tab {
  width: 100%;
  padding: 0;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}

.node-table {
  margin-top: 8px;
}
</style>
