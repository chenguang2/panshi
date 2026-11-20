<template>
  <div class="cl-page">
    <PageHeader title="统一管理" description="以集群为单位，统一管理该集群下的资源，实现统一监控与运维">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-secondary" @click="openBackupDownloadTopbar">备份下载</button>
        <button class="btn btn-secondary" @click="openBackupImport">从备份导入</button>
        <button class="btn btn-primary" @click="showAddModal">+ 新建集群</button>
      </template>
    </PageHeader>

    <ClusterBackupDialog
      :visible="backupDialogVisible"
      :mode="backupDialogMode"
      :cluster="backupTargetCluster"
      :clusters="clusters"
      @imported="onBackupImported"
      @close="onBackupDialogClose"
    />

    <!-- 卡片页面板（central-management-parity，设计页 central.html 状态一）：工具条 / 状态行 / 网格同框 -->
    <div v-if="!maximizedCluster" class="l5-card cm-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="filteredClusters.length"
        count-unit="个集群"
        :show-count="false"
        :refreshing="loading"
        @refresh="loadClusters"
      >
        <template #filters>
          <SearchInput v-model="filterText" placeholder="搜索集群名称或显示名..." :width="150" />
          <select
            v-model="groupFilter"
            :title="groupFilter.startsWith('__') ? '' : groupFilter"
            class="l5-select"
            style="width: 104px"
          >
            <option value="__all__">全部分组</option>
            <option value="__ung__">未分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
          </select>
        </template>
        <template #mode-extra>
          <button
            v-if="cardMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="card-fold-all"
            :title="pageHasFolded ? '展开全部分组' : '收起全部分组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <!-- 状态 chips（#85①）：启用状态 = 带计数 chips 单一形态，替代旧状态下拉 -->
      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips" role="group" aria-label="按启用状态筛选">
          <button
            v-for="t in statusTabs"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="statusFilter = t.key"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <div v-if="filteredClusters.length === 0 && !loading" class="empty-state">
        <!-- 空状态两分支（cluster-ux-close-loop B6.4）：从未创建 vs 筛选无结果 -->
        <a-empty :description="hasActiveFilters ? '没有符合筛选条件的集群' : '还没有集群'" />
        <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearFilters">清除筛选</button>
        <button v-else class="btn btn-primary" @click="showAddModal">新建集群</button>
      </div>
      <div v-else class="cluster-grid card-grid" :class="[`mode-${cardMode}`]">
        <template v-for="g in renderGroups" :key="g.clusterId">
          <ClusterBand
            v-if="cardMode === 'group'"
            :name="g.clusterName || '未分组'"
            :group="g.groupName"
            :count-label="countLabelOf(g.count)"
            :secondary="secondaryOf(g.rows)"
            :hue-class="g.hueClass"
            :folded="isFolded(g.clusterId)"
            @toggle="toggleFold(g.clusterId)"
          />
          <div v-for="cluster in g.rows" v-show="cardMode !== 'group' || groupVisible(g.clusterId)" :key="cluster.id">
            <ClusterCard
              :cluster="cluster"
              :route-badge="routeBadge(cluster)"
              :stat-click="(key: string) => openStatTab(cluster, key)"
            >
              <template #topbar-extra>
                <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" />
                    <line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
                    <line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
                    <line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
                    <line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
                  </svg>
                  <span>最大化</span>
                </div>
              </template>
              <template #actions>
                <button class="btn btn-secondary btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
                <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
                <button class="btn btn-ghost btn-sm" @click.stop="openDrift(cluster)">漂移检测</button>
                <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
                <a-dropdown :trigger="['click']">
                  <button class="btn btn-ghost btn-sm" @click.stop>更多 ▾</button>
                  <template #overlay>
                    <a-menu @click="onCardMenuClick($event, cluster)">
                      <a-menu-item key="backup">备份下载</a-menu-item>
                      <a-menu-item key="export">导出 Excel</a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
                <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click.stop="deleteCluster(cluster)">
                  删除
                </button>
              </template>
            </ClusterCard>
          </div>
        </template>
      </div>
    </div>

    <!-- 最大化面板（central.html 状态二）：同屏单集群；mini-bar 原地切换保留当前 Tab；✕ 收起返回网格 -->
    <div
      v-else-if="maximizedCluster"
      class="max-panel"
      :class="clusterHueClass(maximizedCluster.id)"
      :data-cluster-id="maximizedCluster.id"
    >
      <div class="cluster-mini-bar">
        <div class="mini-scroll">
          <div
            v-for="c in filteredClusters"
            :key="c.id"
            class="mini-item"
            :class="{ active: maximizedClusterId === c.id }"
            @click="switchMaximizedCluster(c.id)"
          >
            <span class="status-dot" :class="c.status === 1 ? 'green' : 'red'"></span>
            <span class="mini-name">{{ c.display_name || c.name }}</span>
            <span v-if="c.display_name" class="mini-hint">{{ c.name }}</span>
          </div>
        </div>
        <button class="restore-btn" @click="restoreMaximize">退出最大化</button>
      </div>
      <div class="max-name-row">
        <span class="cname">{{ maximizedCluster.display_name || maximizedCluster.name }}</span>
        <span v-if="maximizedCluster.display_name" class="chint">({{ maximizedCluster.name }})</span>
        <span v-if="maximizedRouteBadge" class="lp-tag cl-route-badge" :class="maximizedRouteBadge.cls">{{
          maximizedRouteBadge.label
        }}</span>
        <div class="cl-card-actions">
          <button class="btn btn-secondary btn-sm" @click.stop="viewClusterDetail(maximizedCluster)">详情</button>
          <button class="btn btn-ghost btn-sm" @click.stop="testCluster(maximizedCluster)">连接测试</button>
          <button class="btn btn-ghost btn-sm" @click.stop="editCluster(maximizedCluster)">编辑</button>
          <button class="btn btn-ghost btn-sm" @click.stop="exportCluster(maximizedCluster)">导出 Excel</button>
          <button class="btn btn-ghost btn-sm" @click.stop="openBackupDownload(maximizedCluster)">备份下载</button>
          <button
            class="btn btn-ghost btn-sm"
            style="color: var(--danger)"
            @click.stop="deleteCluster(maximizedCluster)"
          >
            删除
          </button>
        </div>
      </div>
      <div class="dtabs">
        <span
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'nodes' }"
          @click="switchTab(maximizedCluster, 'nodes')"
          >集群节点
          <span class="db">{{ maximizedCluster.healthy_node_count }}/{{ maximizedCluster.node_count }}</span></span
        >
        <span
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'upstreams' }"
          @click="switchTab(maximizedCluster, 'upstreams')"
          >上游 <span class="db">{{ maximizedCluster.upstream_count }}</span></span
        >
        <span
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'routes' }"
          @click="switchTab(maximizedCluster, 'routes')"
          >路由 <span class="db">{{ maximizedCluster.route_count }}</span></span
        >
        <span
          v-if="authStore.hasPermission('plugin_groups')"
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'pluginConfigs' }"
          @click="switchTab(maximizedCluster, 'pluginConfigs')"
          >插件组 <span class="db">{{ maximizedCluster.plugin_config_count }}</span></span
        >
        <span
          v-if="authStore.hasPermission('plugin_metadata')"
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'globalPlugins' }"
          @click="switchTab(maximizedCluster, 'globalPlugins')"
          >插件元数据 <span class="db">{{ maximizedCluster.plugin_metadata_count }}</span></span
        >
        <span
          v-if="authStore.hasPermission('global_rules')"
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'globalRules' }"
          @click="switchTab(maximizedCluster, 'globalRules')"
          >全局规则 <span class="db">{{ maximizedCluster.global_rule_count }}</span></span
        >
        <span
          class="dt"
          :class="{ active: maximizedCluster.activeTab === 'staticResources' }"
          @click="switchTab(maximizedCluster, 'staticResources')"
          >静态资源 <span class="db">{{ maximizedCluster.static_resource_count }}</span></span
        >
      </div>
      <div class="dbody">
        <ClusterUpstreams
          v-if="maximizedCluster.activeTab === 'upstreams'"
          :cluster="maximizedCluster"
          :clusters="clusters"
          :open-publish-modal="openPublishModal"
          @refresh="loadClusters"
        />
        <ClusterRoutes
          v-else-if="maximizedCluster.activeTab === 'routes'"
          :cluster="maximizedCluster"
          :clusters="clusters"
          :open-publish-modal="openPublishModal"
          :show-delete-confirm="showDeleteConfirm"
          :load-plugin-configs="loadPluginConfigs"
          @refresh="loadClusters"
        />
        <ClusterPluginConfigs
          v-else-if="maximizedCluster.activeTab === 'pluginConfigs'"
          :cluster="maximizedCluster"
          :clusters="clusters"
          :open-publish-modal="openPublishModal"
          :available-plugins="availablePlugins"
          :load-available-plugins="loadAvailablePlugins"
          :loading="loading"
          @refresh="loadClusters"
        />
        <ClusterGlobalRules
          v-else-if="maximizedCluster.activeTab === 'globalRules'"
          :cluster="maximizedCluster"
          :clusters="clusters"
          :open-publish-modal="openPublishModal"
          :available-plugins="availablePlugins"
          :load-available-plugins="loadAvailablePlugins"
          :loading="loading"
          @refresh="loadClusters"
        />
        <ClusterStaticResources
          v-else-if="maximizedCluster.activeTab === 'staticResources'"
          :cluster="maximizedCluster"
          :clusters="clusters"
          :open-publish-modal="openPublishModal"
          :load-routes="loadRoutes"
          :loading="loading"
          @refresh="loadClusters"
        />
        <div v-else-if="maximizedCluster.activeTab === 'globalPlugins'" class="tab-content">
          <PluginMetadata :cluster-id="maximizedCluster.id" :nodes="maximizedCluster.nodes" />
        </div>
        <ClusterNodes v-else :cluster="maximizedCluster" @refresh="loadClusters" />
      </div>
    </div>

    <ClusterFormModal
      :visible="modalVisible"
      :editing-cluster="editingCluster"
      :group-options="groupOptions"
      @close="closeEditModal"
      @saved="onClusterSaved"
    />

    <!-- Node Form Modal -->
    <div class="modal-overlay" :style="{ display: nodeModalVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingNode ? '编辑节点' : '添加节点' }}</h2>
          <button class="modal-close" @click="nodeModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <a-form ref="nodeFormRef" :model="nodeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="IP" name="ip" :rules="[{ required: true, validator: validateIP, trigger: 'blur' }]">
              <a-input v-model:value="nodeForm.ip" placeholder="请输入IP地址" />
            </a-form-item>
            <a-form-item
              label="服务端口"
              name="service_port"
              :rules="[{ required: true, type: 'number', message: '请输入服务端口' }]"
            >
              <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item
              label="管理端口"
              name="management_port"
              :rules="[{ required: true, type: 'number', message: '请输入管理端口' }]"
            >
              <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item
              label="Edge路径"
              name="edge_path"
              :rules="[
                { required: true, message: '请输入Edge路径' },
                { pattern: /^\//, message: '必须以 / 开头' },
                { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' },
                { max: 255, message: '最多255个字符' },
              ]"
            >
              <a-input v-model:value="nodeForm.edge_path" placeholder="运行时路径，如 /edge/node1" />
            </a-form-item>
            <a-form-item
              label="安装路径"
              name="openresty_path"
              :rules="[
                { pattern: /^\//, message: '必须以 / 开头' },
                { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' },
                { max: 255, message: '最多255个字符' },
              ]"
            >
              <a-input v-model:value="nodeForm.openresty_path" placeholder="留空则与Edge路径相同" />
            </a-form-item>
            <a-form-item
              label="状态"
              name="status"
              :rules="[{ required: true, message: '请选择状态' }]"
              extra="禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询"
            >
              <a-select v-model:value="nodeForm.status">
                <a-select-option :value="1">启用</a-select-option>
                <a-select-option :value="0">禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="nodeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleNodeSubmit">{{ editingNode ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>

    <ConfigDiff v-model:visible="diffDrawerVisible" :cluster-id="diffClusterId" :initial-node-id="diffNodeId" />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      :title="publishModalTitle"
      :cluster-id="publishModalClusterId"
      :current-version="publishModalCurrentVersion"
      :resource-summary="publishModalResourceSummary"
      :overwrite-warning="publishModalOverwriteWarning"
      :preselected-node-ids="publishModalPreselectedNodeIds"
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />

    <!-- Cluster Detail Modal -->
    <!-- 集群详情弹窗：共享组件唯一实现（cluster-ux-close-loop 3.6） -->
    <ClusterDetailModal :cluster="detailCluster" :visible="detailVisible" @close="detailVisible = false" />

    <!-- 漂移检测结果抽屉（config-drift-detection，与集群管理同款入口/抽屉） -->
    <ClusterDriftDrawer
      v-model:open="driftVisible"
      :cluster-id="driftCluster?.id ?? null"
      :cluster-name="driftCluster?.name"
    />

    <!-- Test Connection Modal -->
    <div class="modal-overlay" :style="{ display: testVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>测试连接</h2>
          <button class="modal-close" @click="resetTest">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="!testRunning && testLogs.length === 0">
            <div style="margin-bottom: 12px; font-size: 13px; color: var(--muted)">
              将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）。结果为管理面连通性（在线/离线），不改变节点运行态（运行中/已停止）：
            </div>
            <div v-if="testNodes.length > 0" class="test-nodes-list">
              <div v-for="n in testNodes" :key="n.id" class="test-node-row">
                <span class="node-addr">{{ n.ip }}:{{ n.management_port }}</span>
                <span class="badge" :class="n.status === 1 ? 'badge-success' : 'badge-neutral'">{{
                  n.status === 1 ? '在线' : '离线'
                }}</span>
              </div>
            </div>
            <div v-else style="text-align: center; padding: 20px 0; color: var(--muted)">该集群没有节点</div>
          </div>
          <div v-else>
            <div class="test-progress">
              <div v-for="(log, i) in testLogs" :key="i" class="test-log-row" :class="log.status">
                <span v-if="log.status === 'pending'" class="log-spinner">⏳</span>
                <span v-else-if="log.status === 'success'" class="log-icon">✓</span>
                <span v-else-if="log.status === 'error'" class="log-icon log-error">✗</span>
                <span class="log-msg">{{ log.msg }}</span>
                <button
                  v-if="log.status === 'error' && log.whitelist && canPushGatewayConfig"
                  class="test-action-link"
                  @click="goRelayGateways"
                >
                  去下发网关配置
                </button>
              </div>
            </div>
            <div v-if="!testRunning" class="test-status-hint">测试结果将更新节点的在线状态标记</div>
          </div>
        </div>
        <div class="modal-footer">
          <template v-if="!testRunning && testLogs.length === 0">
            <button class="btn btn-secondary" @click="resetTest">取消</button>
            <button class="btn btn-primary" :disabled="testNodes.length === 0" @click="runTest">开始测试</button>
          </template>
          <button v-else class="btn btn-secondary" @click="resetTest">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, watchEffect, onMounted, h, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  showDeleteConfirm,
  executeDeleteWithProgress,
  routeLabel,
  deleteClusterWithConfirm,
  fetchAllClusterNodes,
  exportClusterExcel,
} from '@/composables/useClusterUtils'
import api from '@/api'
import ClusterDetailModal from '@/components/ClusterDetailModal.vue'
import ClusterDriftDrawer from '@/components/ClusterDriftDrawer.vue'
import { useClusterRouteBadge } from '@/composables/useClusterRouteBadge'
import { formatDateTime } from '@/utils/format'
import type { Cluster, Upstream, Plugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'
import PluginMetadata from '@/components/PluginMetadata.vue'
import ClusterFormModal from '@/components/ClusterFormModal.vue'
import ClusterCard from '@/components/ClusterCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import ClusterBackupDialog from '@/components/ClusterBackupDialog.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import type { PublishModalOptions } from '@/composables/useClusterResourceCore'
import ConfigDiff from '@/views/ConfigDiff.vue'
import { useClusterNodes, allNodeColumns, allNodeActionButtons } from '@/composables/useClusterNodes'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'
import { useClusterRoutes } from '@/composables/useClusterRoutes'
import { useClusterPluginConfigs } from '@/composables/useClusterPluginConfigs'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import ClusterNodes from '@/views/clusters/ClusterNodes.vue'
import ClusterUpstreams from '@/views/clusters/ClusterUpstreams.vue'
import ClusterRoutes from '@/views/clusters/ClusterRoutes.vue'
import ClusterPluginConfigs from '@/views/clusters/ClusterPluginConfigs.vue'
import ClusterGlobalRules from '@/views/clusters/ClusterGlobalRules.vue'
import ClusterStaticResources from '@/views/clusters/ClusterStaticResources.vue'
import SearchInput from '@/components/SearchInput.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import { clusterHueClass } from '@/utils/clusterHue'

const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const filterText = ref('')
const statusFilter = ref<string>('all')
// 批 7：分组筛选（与集群管理对齐；groupOptions 复用新建/编辑弹窗的既有 computed）
const groupFilter = ref('__all__')

/** 筛选是否有生效条件（空状态两分支判定，cluster-ux-close-loop B6.4） */
const hasActiveFilters = computed(
  () => filterText.value.trim() !== '' || statusFilter.value !== 'all' || groupFilter.value !== '__all__',
)

function clearFilters() {
  filterText.value = ''
  statusFilter.value = 'all'
  groupFilter.value = '__all__'
}

// ── 经中继 / 直连 徽章 ──
// 唯一实现在 useClusterRouteBadge composable（cluster-ux-close-loop 3.5）：
// 中继关闭 / 区域数据缺失 / 未绑区域 → null（不渲染徽章，直连是缺省态）。
const { routeBadge } = useClusterRouteBadge(clusters)

// PublishConfirmModal state
const publishModalVisible = ref(false)
const publishModalTitle = ref('')
const publishModalClusterId = ref(0)
// M5：发布确认弹窗「将创建新版本 v(N+1)」说明（opt-in 资源经第三参传入；其余资源 undefined 不显示）
const publishModalCurrentVersion = ref<number | null>(null)
// static-resources-ux-close-loop 9.1/9.2：资源摘要行 + 覆盖预警（静态资源域传入；其余域为空不显示）
const publishModalResourceSummary = ref('')
const publishModalOverwriteWarning = ref('')
const publishModalPreselectedNodeIds = ref<number[]>([])
let publishModalResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(title: string, clusterId: number, opts?: PublishModalOptions): Promise<number[]> {
  publishModalTitle.value = title
  publishModalClusterId.value = clusterId
  publishModalCurrentVersion.value = opts?.currentVersion ?? null
  publishModalResourceSummary.value = opts?.resourceSummary ?? ''
  publishModalOverwriteWarning.value = opts?.overwriteWarning ?? ''
  publishModalPreselectedNodeIds.value = opts?.preselectedNodeIds ?? []
  publishModalVisible.value = true
  return new Promise((resolve) => {
    publishModalResolve = resolve
  })
}

function handlePublishConfirm(nodeIds: number[]) {
  publishModalVisible.value = false
  publishModalResolve?.(nodeIds)
  publishModalResolve = null
}

function handlePublishCancel() {
  publishModalVisible.value = false
  publishModalResolve?.([])
  publishModalResolve = null
}

const maximizedClusterId = ref<number | null>(null)

/** 当前最大化集群（两态模型：网格 ⇄ 最大化；从全量列表解析——筛选变化不使面板悬空） */
const maximizedCluster = computed(() => clusters.value.find((c) => c.id === maximizedClusterId.value) ?? null)

/** 最大化面板中继徽章（页面 routeBadge 单点的只读镜像） */
const maximizedRouteBadge = computed(() => (maximizedCluster.value ? routeBadge(maximizedCluster.value) : null))

function maximizeCluster(cluster: Cluster) {
  // 保留旧行为：最大化即折叠全部分组（收起返回网格时紧凑）
  collapseAllGroups()
  cluster.activeTab = cluster.activeTab || 'nodes'
  maximizedClusterId.value = cluster.id
}

function restoreMaximize() {
  maximizedClusterId.value = null
}

function switchMaximizedCluster(clusterId: number) {
  const cluster = clusters.value.find((c) => c.id === clusterId)
  if (!cluster) return
  // 设计基线（central.html 状态二）：点其他集群 = 原地切换、保留当前 Tab——
  // 把当前活动 Tab 带到目标集群并触发按需加载（旧实现切新集群会回落节点 Tab）
  const curTab = maximizedCluster.value?.activeTab
  if (curTab) cluster.activeTab = curTab
  maximizeCluster(cluster)
  if (curTab) handleTabClick(cluster, curTab)
}

const closeEditModal = () => {
  modalVisible.value = false
  editingCluster.value = null
}

const onClusterSaved = () => {
  modalVisible.value = false
  editingCluster.value = null
  loadClusters()
}

function switchTab(cluster: Cluster, key: string) {
  cluster.activeTab = key
  handleTabClick(cluster, key)
}

// ── 统计格点击接管（方案 A）：统计格直切本页集群多 Tab 资源浏览器，不跳全局列表页 ──

/** 统计格 key（ClusterCard 契约）→ 本页 Tab key：仅「插件元数据」两者命名不同（cell=pluginMetadata / Tab=globalPlugins），标签文案一致 */
const STAT_TAB_KEYS: Record<string, string> = {
  nodes: 'nodes',
  upstreams: 'upstreams',
  routes: 'routes',
  pluginConfigs: 'pluginConfigs',
  globalRules: 'globalRules',
  pluginMetadata: 'globalPlugins',
  staticResources: 'staticResources',
}

/** 打开该集群的多 Tab 资源浏览器（最大化）并直切对应 Tab；未知 key 兜底节点 Tab */
function openStatTab(cluster: Cluster, key: string) {
  maximizeCluster(cluster)
  switchTab(cluster, STAT_TAB_KEYS[key] || 'nodes')
}

const handleTabClick = async (cluster: Cluster, key: string) => {
  if (key === 'upstreams') {
    await loadUpstreams(cluster)
  } else if (key === 'routes') {
    await loadRoutes(cluster)
  } else if (key === 'nodes') {
    await loadNodes(cluster)
  } else if (key === 'pluginConfigs') {
    await loadPluginConfigs(cluster)
  } else if (key === 'globalRules') {
    await loadGlobalRules(cluster)
  } else if (key === 'staticResources') {
    await loadStaticResources(cluster)
  }
}

const filteredClusters = computed(() => {
  return clusters.value.filter((c: Cluster) => {
    const text = filterText.value.trim().toLowerCase()
    if (text) {
      const matchName = (c.display_name || c.name).toLowerCase().includes(text)
      const matchKey = c.name.toLowerCase().includes(text)
      if (!matchName && !matchKey) return false
    }
    // 批 7：分组筛选（与集群管理同款三分支语义；与状态/搜索叠加而非短路）
    if (groupFilter.value === '__ung__') {
      if (c.group_name) return false
    } else if (groupFilter.value !== '__all__') {
      if (c.group_name !== groupFilter.value) return false
    }
    if (statusFilter.value === 'enabled') return c.status === 1
    if (statusFilter.value === 'disabled') return c.status !== 1
    return true
  })
})

// ── 网格态分组 / 平铺（useCardClusterGrouping 共享组合式，#87/#88；旧自有分组态已退场）──
// 状态 chips（#85①）：启用位筛选单形；计数前端聚合（全量 ≤PAGE_SIZE_CARD_GRID）
const statusTabs = computed(() => [
  { key: 'all', label: '全部', count: filteredClusters.value.length },
  { key: 'enabled', label: '已启用', count: filteredClusters.value.filter((c) => c.status === 1).length },
  { key: 'disabled', label: '已禁用', count: filteredClusters.value.filter((c) => c.status !== 1).length },
])

/** 组名稳定序（未分组置顶 + 字母序）：供分堆伪 id 与 band 色相 */
const groupOrderNames = computed(() => {
  const names = new Set(filteredClusters.value.map((c) => c.group_name || ''))
  return Array.from(names).sort((a, b) => {
    if (!a) return -1
    if (!b) return 1
    return a.localeCompare(b, 'zh')
  })
})

const groupIdOf = (name: string): number => {
  const idx = groupOrderNames.value.indexOf(name)
  return idx >= 0 ? idx + 1 : 999
}

const {
  mode: cardMode,
  groups: cardGroups,
  countLabel: countLabelOf,
  secondaryOf,
  isFolded,
  toggleFold,
  pageHasFolded,
  toggleFoldAll,
  groupVisible,
  collapseAll: collapseAllGroups,
} = useCardClusterGrouping<Cluster>({
  rows: () => filteredClusters.value,
  unit: '个集群',
  // 分堆键 = 组伪 id（未分组置顶 + 字母序，band 色相随之；同集群管理 D2 口径）
  clusterIdOf: (c) => groupIdOf(c.group_name || ''),
  clusterNameOf: (c) => c.group_name || '未分组',
  groupNameOf: () => '',
  secondary: (rows) => {
    const nodes = rows.reduce((acc, c) => acc + (c.node_count || 0), 0)
    const routes = rows.reduce((acc, c) => acc + (c.route_count || 0), 0)
    return `节点 ${nodes} · 路由 ${routes}`
  },
})

/** 平铺 = 全量收进单伪组（band 不渲染，卡片本体即集群身份） */
const renderGroups = computed(() =>
  cardMode.value === 'group'
    ? cardGroups.value
    : [
        {
          clusterId: -1,
          clusterName: '',
          groupName: '',
          hueClass: 'cluster-c1',
          rows: filteredClusters.value,
          count: filteredClusters.value.length,
        },
      ],
)

// ── 页头补充维度徽标（#86②：总数归 chips「全部 N」，页头只放补充维度）──
const headerStatItems = computed(() => [
  { value: clusters.value.length, label: '集群' },
  { value: clusters.value.reduce((acc, c) => acc + (c.node_count || 0), 0), label: '节点' },
])

const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: PAGE_SIZE_CARD_GRID, total: 0 })
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const isAdmin = () => authStore.user?.role === 'admin'

const groupOptions = computed(() => {
  const groups = new Set<string>()
  for (const c of clusters.value) {
    if (c.group_name) groups.add(c.group_name)
  }
  return Array.from(groups).sort()
})

// ── Shared state for composables ──
const availablePlugins = ref<Plugin[]>([])

const loadAvailablePlugins = async () => {
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

// Version modal state bag for composables using VersionModalState interface
const versionModal = {
  type: versionModalType,
  visible: versionModalVisible,
  resourceId: versionModalResourceId,
  clusterId: versionModalClusterId,
  resourceName: versionModalResourceName,
  edgeUuid: versionModalEdgeUuid,
}

// Forward-ref pattern: loadClusters is defined after composable calls,
// but useClusterNodes needs an onRefresh callback that calls it.
let loadClustersFn: (() => Promise<void>) | null = null
const onRefresh = () => {
  loadClustersFn?.()
}

// ── Composables ──
const {
  nodeModalVisible,
  editingNode,
  nodeFormRef,
  nodeForm,
  diffDrawerVisible,
  diffClusterId,
  diffNodeId,
  nodeColumnPopoverVisible,
  nodeColumnsSelected,
  nodeSearchVisible,
  nodeActionsSelected,
  moreNodeActions,
  visibleNodeColumns,
  validateIP,
  getNodeActionButtonTitle,
  handleNodeAction,
  handleNodeTableChange,
  loadNodes,
  selectNode,
  showAddNodeModal,
  editNode,
  handleNodeSubmit,
  deleteNode,
  startNode,
  stopNode,
  queryNodeStatus,
} = useClusterNodes({
  clusters,
  onRefresh,
})

const { loadUpstreams } = useClusterUpstreams({
  clusters,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal,
})

const { loadPluginConfigs } = useClusterPluginConfigs({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

// Shared currentClusterId for route composable + inline helpers
const currentClusterId = ref<number | null>(null)

// showDeleteConfirm 引用（route composable 懒读取，直接绑定导入的共享函数）
let _showDeleteConfirmRoute: (opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
}) => void = showDeleteConfirm

const { loadRoutes } = useClusterRoutes({
  clusters,
  currentClusterId,
  openPublishModal,
  showDeleteConfirm: _showDeleteConfirmRoute,
  loadPluginConfigs,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
})

const { loadGlobalRules } = useClusterGlobalRules({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

const { loadStaticResources } = useClusterStaticResources({
  clusters,
  versionModal,
  openPublishModal,
  loadRoutes,
})

// 列表刷新时按 id 保留的面板运行态字段（central-management-ux-review-fixes 批 3 P2-5：
// 刷新不重置 Tab/子表数据/选择态——#203 陷阱的全局版兜底；服务端字段以新响应为准）
const CLUSTER_RUNTIME_KEYS = [
  'activeTab',
  'nodes',
  'nodesLoading',
  'nodesPagination',
  'nodesSearch',
  'nodesSearchField',
  'nodesSortBy',
  'nodesSortOrder',
  'upstreams',
  'upstreamsLoading',
  'upstreamsPagination',
  'upstreamsSearch',
  'upstreamsSearchField',
  'upstreamsSortBy',
  'upstreamsSortOrder',
  'routes',
  'routesLoading',
  'routesPagination',
  'routesSearch',
  'routesSearchField',
  'routesSortBy',
  'routesSortOrder',
  'selectedNode',
  'selectedNodeKeys',
  'selectedUpstream',
  'selectedRoute',
  'selectedRouteKeys',
  'plugin_configs',
  'selectedPluginConfig',
  'global_rules',
  'selectedGlobalRule',
] as const

function freshClusterRuntime(): Record<string, unknown> {
  return {
    activeTab: 'nodes',
    nodes: [],
    nodesLoading: false,
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    nodesSearch: '',
    nodesSearchField: '',
    nodesSortBy: '',
    nodesSortOrder: 'asc' as 'asc' | 'desc',
    upstreams: null,
    upstreamsLoading: false,
    upstreamsPagination: { total: 0, page: 1, pageSize: 20 },
    upstreamsSearch: '',
    upstreamsSearchField: '',
    upstreamsSortBy: '',
    upstreamsSortOrder: 'asc' as 'asc' | 'desc',
    routes: null,
    routesLoading: false,
    routesPagination: { total: 0, page: 1, pageSize: 20 },
    routesSearch: '',
    routesSearchField: '',
    routesSortBy: '',
    routesSortOrder: 'asc' as 'asc' | 'desc',
    selectedNode: null,
    selectedNodeKeys: [],
    selectedUpstream: null,
    selectedRoute: null,
    selectedRouteKeys: [],
    plugin_configs: [],
    selectedPluginConfig: null,
    global_rules: [],
    selectedGlobalRule: null,
  }
}

const loadClusters = async () => {
  loading.value = true
  try {
    const endpoint = isAdmin() ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: pagination.current, page_size: pagination.pageSize } })
    const prevById = new Map(clusters.value.map((c) => [c.id, c]))
    clusters.value = res.data.items.map((c: Cluster) => {
      const prev = prevById.get(c.id)
      const runtime: Record<string, unknown> = {}
      if (prev) {
        for (const k of CLUSTER_RUNTIME_KEYS) runtime[k] = (prev as Record<string, unknown>)[k]
      } else {
        Object.assign(runtime, freshClusterRuntime())
      }
      return { ...c, ...runtime } as Cluster
    })
    pagination.total = res.data.total
    // 卡片节点区渲染需要节点数据（保持挂载加载）；上游延迟到首次切上游 Tab
    // （handleTabClick 按需加载）——挂载请求数从 1+N(节点)+N(上游) 降为 1+N(节点)
    for (const cluster of clusters.value) {
      void loadNodes(cluster)
    }
  } catch (error) {
    message.error('加载集群列表失败')
  } finally {
    loading.value = false
  }
}

// Wire loadClusters for onRefresh callback (used by useClusterNodes)
loadClustersFn = loadClusters

const showAddModal = () => {
  editingCluster.value = null
  modalVisible.value = true
}

const editCluster = (cluster: Cluster) => {
  editingCluster.value = cluster
  modalVisible.value = true
}

// ── Cluster detail modal ──
const detailVisible = ref(false)
const detailCluster = ref<Cluster | null>(null)

// ── 漂移检测（config-drift-detection）：与集群管理同款入口，拉取/复检由抽屉自持 ──
const driftVisible = ref(false)
const driftCluster = ref<Cluster | null>(null)

function openDrift(c: Cluster) {
  driftCluster.value = c
  driftVisible.value = true
}

function viewClusterDetail(cluster: Cluster) {
  detailCluster.value = cluster
  detailVisible.value = true
}

// ── Test connection ──
const testVisible = ref(false)
const testRunning = ref(false)
const testNodes = ref<{ id: number; ip: string; service_port: number; management_port: number; status: number }[]>([])
const testLogs = ref<{ status: 'pending' | 'success' | 'error'; msg: string; whitelist?: boolean }[]>([])

/** 白名单 403 快捷动作仅对具备 relay_gateway 权限的用户渲染（与侧边栏菜单权限键同源） */
const canPushGatewayConfig = computed(() => authStore.hasPermission('relay_gateway'))
const testNavRouter = useRouter()

function goRelayGateways() {
  resetTest()
  void testNavRouter.push('/relay-gateways')
}

/** POST /clusters/{id}/test 的逐节点结果 */
interface ConnectionTestResult {
  node_id: number
  ip: string
  port: number
  ok: boolean
  msg?: string
  version?: string
  /** 节点执行路径（后端提供；缺失时不显示标签） */
  route?: 'relay' | 'direct'
  /** 经中继时的网关地址 */
  relay_via?: string
}
let testingCluster: Cluster | null = null

function resetTest() {
  testVisible.value = false
  testRunning.value = false
  testNodes.value = []
  testLogs.value = []
  testingCluster = null
}

async function testCluster(cluster: Cluster) {
  testingCluster = cluster
  testLogs.value = []
  testRunning.value = false
  try {
    // 全量拉取统一走共享工具（route-management-ux-batch1 组2）：分页循环取全，
    // >500 节点集群的连接测试清单不再被单页 500 静默截断；失败维持既有降级（空清单）
    const items = await fetchAllClusterNodes<{
      id: number
      ip: string
      service_port: number
      management_port: number
      status: number
    }>(cluster.id)
    testNodes.value = items.map((n) => ({
      id: n.id,
      ip: n.ip,
      service_port: n.service_port,
      management_port: n.management_port,
      status: n.status,
    }))
  } catch {
    testNodes.value = []
  }
  testVisible.value = true
}

async function runTest() {
  if (!testingCluster) return
  testRunning.value = true
  testLogs.value = []
  const nodeIds = testNodes.value.map((n) => n.id)
  if (nodeIds.length === 0) {
    testLogs.value.push({ status: 'error', msg: '没有节点可测试' })
    testRunning.value = false
    return
  }
  const startTime = Date.now()
  for (const n of testNodes.value) {
    testLogs.value.push({ status: 'pending', msg: `${n.ip}:${n.management_port} 测试中...` })
  }
  try {
    const res = await api.post(`/clusters/${testingCluster.id}/test`, { node_ids: nodeIds })
    const results: ConnectionTestResult[] = res.data.results || []
    let successCount = 0
    let failCount = 0
    for (const r of results) {
      const idx = testNodes.value.findIndex((n) => n.id === r.node_id)
      if (idx >= 0) {
        const label = `${r.ip}:${r.port}`
        const rl = routeLabel(r.route)
        const routeSuffix = rl ? `（${rl}）` : ''
        if (r.ok) {
          successCount++
          testLogs.value[idx] = { status: 'success', msg: `${label} 连接成功${routeSuffix}` }
        } else {
          failCount++
          testLogs.value[idx] = {
            status: 'error',
            msg: `${label} 连接失败 — ${r.msg}${routeSuffix}`,
            whitelist: !!(r.msg && r.msg.includes('白名单')),
          }
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const failNote =
      failCount > 0 ? ` ⚠ 存在 ${failCount} 个失败节点，请检查失败原因（白名单 403 需先下发网关配置）` : ''
    testLogs.value.push({
      status: failCount > 0 ? 'error' : 'success',
      msg: `测试完成 — 共 ${results.length} 个节点，成功 ${successCount}，失败 ${failCount}，耗时 ${elapsed}s${failNote}`,
    })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } }; message?: string }
    for (let i = 0; i < testLogs.value.length; i++) {
      if (testLogs.value[i].status === 'pending') {
        const n = testNodes.value[i]
        testLogs.value[i] = {
          status: 'error',
          msg: `${n.ip}:${n.management_port} 测试异常 — ${err.response?.data?.detail || err.message}`,
        }
      }
    }
    const elapsedErr = ((Date.now() - startTime) / 1000).toFixed(1)
    testLogs.value.push({ status: 'error', msg: `测试异常终止，耗时 ${elapsedErr}s` })
  }
  testRunning.value = false
  await loadClusters()
}

const deleteCluster = (cluster: Cluster) => {
  void deleteClusterWithConfirm(cluster, { refreshFn: () => loadClusters() })
}

// ── Cluster JSON backup / restore ──
const backupDialogVisible = ref(false)
const backupDialogMode = ref<'download' | 'import'>('download')
const backupTargetCluster = ref<Cluster | null>(null)
/** 导入完成闭环（cluster-ux-close-loop B5）：导入发生后关闭弹窗即刷新列表，新集群即时可见 */
const backupImported = ref(false)

function onBackupImported() {
  backupImported.value = true
}

function onBackupDialogClose() {
  backupDialogVisible.value = false
  if (backupImported.value) {
    backupImported.value = false
    void loadClusters()
  }
}

function openBackupDownload(cluster: Cluster) {
  backupTargetCluster.value = cluster
  backupDialogMode.value = 'download'
  backupDialogVisible.value = true
}

/** 顶栏下载入口（批5 两页顶栏对齐）：null 目标 = 弹窗内下拉选集群（B6.6） */
function openBackupDownloadTopbar() {
  backupTargetCluster.value = null
  backupDialogMode.value = 'download'
  backupDialogVisible.value = true
}

/** 卡片「更多」菜单（P2-1：备份下载/导出 Excel 网格直达）；a-menu 载荷提取为函数（约定 #25） */
function onCardMenuClick(e: unknown, cluster: Cluster) {
  const key = String((e as { key: string | number }).key)
  onCardMoreAction(key, cluster)
}

function onCardMoreAction(key: string, cluster: Cluster) {
  if (key === 'backup') openBackupDownload(cluster)
  else if (key === 'export') void exportCluster(cluster)
}

function openBackupImport() {
  backupTargetCluster.value = null
  backupDialogMode.value = 'import'
  backupDialogVisible.value = true
}

// ── Export cluster data to Excel ──
const exportingClusters = ref<Set<number>>(new Set())

async function exportCluster(cluster: Cluster) {
  if (exportingClusters.value.has(cluster.id)) return
  exportingClusters.value.add(cluster.id)
  try {
    // 单一实现在 useClusterUtils.exportClusterExcel（P2-1/P2-8 两页共用）
    await exportClusterExcel(cluster.id, cluster.name)
  } finally {
    exportingClusters.value.delete(cluster.id)
  }
}

// Wire showDeleteConfirm for route composable (must be after showDeleteConfirm definition)
const centralRoute = useRoute()

onMounted(async () => {
  await loadClusters()
  const editId = centralRoute.query.editClusterId
  if (editId) {
    const id = parseInt(editId as string, 10)
    if (!isNaN(id)) {
      const found = clusters.value.find((c) => c.id === id)
      if (found) {
        await nextTick()
        editCluster(found)
      }
    }
  }
})
</script>

<style scoped>
.cl-page {
  min-height: calc(100vh - 56px - 40px);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.green {
  background: var(--success);
  box-shadow: 0 0 6px color-mix(in srgb, var(--success) 50%, transparent);
}
.status-dot.red {
  background: var(--danger);
  box-shadow: 0 0 6px color-mix(in srgb, var(--danger) 50%, transparent);
}

.maximize-btn-sm {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--muted);
  transition: all 0.15s;
  flex-shrink: 0;
  white-space: nowrap;
}
.maximize-btn-sm:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.scell {
  text-align: center;
  padding: 5px 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.scell:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.scell:hover .snum {
  color: var(--accent);
}

.cluster-grid {
  /* 网格布局/断点已上移共享 .card-grid（style.css 卡片一致性单点）；本页保留弹层堆叠特有声明 */
  position: relative;
  z-index: 1;
}

/* ── 卡片解剖样式（卡片容器/头部/统计条/节点区等）已收敛至
   components/ClusterCard.vue（档位 C 统一实现），本页仅保留页面专属规则 ── */
/* .cl-card-actions：展开区名称行（expanded-name-row）复用该布局类 */
.cl-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}

/* Expanded area action buttons */
.cactions {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
}
.cname {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg);
}
.chint {
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
  flex-shrink: 0;
}

/* 最大化面板名称行（central.html 状态二基线）：3px 集群色相竖条贴名左，cname 16/700、chint mono */
/* 最大化面板容器（central.html .max-panel）：集群色相经 cluster-cN 的 --cc 注入 */
.max-panel {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 24px;
}

.max-name-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px 19px;
  border-bottom: 1px solid var(--border);
}
.max-name-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--cc, var(--accent));
}
.max-name-row .cname {
  font-size: 16px;
  font-weight: 700;
  color: var(--fg);
}
.max-name-row .chint {
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--muted);
}
.max-name-row .cl-card-actions {
  margin-left: auto;
  margin-top: 0;
  padding: 0;
  border-top: none;
}
.max-name-row .btn {
  height: 28px;
}

.dtabs {
  display: flex;
  gap: 4px;
  background: transparent;
  border-bottom: 1px solid var(--border);
  padding: 8px 16px 0;
  overflow-x: auto;
}
.dt {
  padding: 7px 14px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
  border-radius: 8px 8px 0 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  position: relative;
  user-select: none;
}
.dt:hover {
  color: var(--accent);
  background: var(--accent-bg);
  border-color: var(--accent);
}
.dt.active {
  color: var(--accent);
  background: var(--bg);
  border-color: var(--border);
  border-bottom: 1px solid var(--bg);
  margin-bottom: -1px;
  font-weight: 500;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
  z-index: 1;
}
.dt.active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 0 0 2px 2px;
}
.db {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
  background: var(--bg);
  color: var(--muted);
}
.dt.active .db {
  background: var(--accent-bg);
  color: var(--accent);
}
.dbody {
  padding: 16px;
  min-height: 100px;
}

.node-tab {
  width: 100%;
}
.tab-content {
  min-height: 100px;
}
.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.node-table {
  margin-top: 8px;
}

.empty-state {
  padding: 48px 0;
  text-align: center;
  position: relative;
  z-index: 1;
}

.click-zone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 6px;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  transition: all 0.2s;
  user-select: none;
}
.click-zone:hover {
  background: var(--bg);
  border-color: var(--accent);
  color: var(--accent);
}
.click-zone.on {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
}

.cluster-desc {
  color: var(--muted);
  font-size: 13px;
  margin: 0;
}
.no-desc {
  color: var(--muted);
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

/* 表头：保留品牌色底 + 主色下框（页面标识，沿用 --p-* 令牌），其余机械属性对齐列表页契约 */
:deep(.node-table) .ant-table-thead > tr > th {
  background: var(--accent-bg) !important;
  border-bottom: 2px solid var(--accent) !important;
  color: var(--fg) !important;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 8px;
  white-space: nowrap;
}
:deep(.node-table) .ant-table-thead > tr > th::before {
  display: none !important;
}
:deep(.node-table) .ant-table-tbody > tr > td {
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted);
  font-size: 13px;
  padding: 12px 8px;
  white-space: nowrap;
}
:deep(.node-table) .ant-table-tbody > tr:last-child > td {
  border-bottom: none !important;
}
:deep(.node-table) .ant-table-tbody > tr:hover > td {
  background: var(--bg) !important;
}
:deep(.node-table) .ant-empty-description {
  color: var(--muted) !important;
}
:deep(.node-table) .ant-tag {
  border: none;
  font-weight: 500;
  border-radius: var(--radius-sm);
}
:deep(.node-table) .ant-badge-status-text {
  color: var(--muted);
}

:deep(.node-table) .ant-table-tbody .ant-btn {
  background: var(--bg) !important;
  border: 1px solid var(--border) !important;
  color: var(--muted) !important;
  border-radius: var(--radius-sm);
  height: 26px;
  font-size: 12px;
  padding: 0 8px;
}
:deep(.node-table) .ant-table-tbody .ant-btn:hover {
  background: var(--accent-bg) !important;
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}
:deep(.node-table) .ant-table-tbody .ant-btn-dangerous {
  color: var(--danger) !important;
}

:deep(.node-table) .ant-pagination .ant-pagination-item {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-sm);
}
:deep(.node-table) .ant-pagination .ant-pagination-item a {
  color: var(--muted) !important;
}
:deep(.node-table) .ant-pagination .ant-pagination-item-active {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
}
:deep(.node-table) .ant-pagination .ant-pagination-item-active a {
  color: #fff !important;
}
:deep(.node-table) .ant-pagination .ant-pagination-prev button,
:deep(.node-table) .ant-pagination .ant-pagination-next button {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--muted) !important;
}
:deep(.node-table) .ant-pagination .ant-pagination-disabled button {
  opacity: 0.3 !important;
}
:deep(.node-table) .ant-pagination-options .ant-select-selector {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--muted) !important;
}
:deep(.node-table) .ant-pagination-total-text {
  color: var(--muted) !important;
}

:deep(.dbody) .ant-input-affix-wrapper {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 6px;
}
:deep(.dbody) .ant-input-affix-wrapper .ant-input {
  background: transparent !important;
  border: none !important;
  color: var(--fg) !important;
}
:deep(.dbody) .ant-input-affix-wrapper .ant-input::placeholder {
  color: var(--muted) !important;
}
:deep(.dbody) .ant-input-search-button {
  background: var(--accent) !important;
  border: none !important;
  color: #fff !important;
  border-radius: 0 6px 6px 0 !important;
}
:deep(.dbody) .ant-select-selector {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--fg) !important;
  border-radius: 6px !important;
}
:deep(.dbody) .ant-select-selection-placeholder {
  color: var(--muted) !important;
}
:deep(.dbody) .ant-select-arrow {
  color: var(--muted) !important;
}

/* ── Tab content: unify all Ant Design buttons with .btn style ── */
:deep(.dbody) .ant-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 3px 10px !important;
  border-radius: var(--radius-md) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  border: 1px solid var(--border) !important;
  background: transparent !important;
  color: var(--muted) !important;
  transition: all 0.15s !important;
  white-space: nowrap !important;
  line-height: 1.4 !important;
  height: auto !important;
}
:deep(.dbody) .ant-btn:hover {
  background: var(--bg) !important;
  color: var(--fg) !important;
}
:deep(.dbody) .ant-btn-primary {
  background: var(--accent) !important;
  color: #fff !important;
  border-color: var(--accent) !important;
}
:deep(.dbody) .ant-btn-primary:hover {
  background: oklch(50% 0.16 210) !important;
  border-color: oklch(50% 0.16 210) !important;
}
:deep(.dbody) .ant-btn-dangerous {
  color: var(--danger) !important;
  border-color: var(--border) !important;
}
:deep(.dbody) .ant-btn-dangerous:hover {
  color: var(--danger) !important;
  border-color: var(--danger) !important;
  background: oklch(55% 0.18 28 / 8%) !important;
}
:deep(.dbody) .ant-btn:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}
:deep(.dbody) .ant-divider-vertical {
  border-color: var(--border) !important;
}

:deep(.ant-popover-inner) {
  background: var(--bg) !important;
  border: 1px solid var(--border) !important;
}
:deep(.ant-popover-title) {
  color: var(--fg) !important;
  border-bottom: 1px solid var(--border) !important;
}
:deep(.ant-popover-inner-content) {
  color: var(--muted) !important;
}
:deep(.ant-checkbox-wrapper) {
  color: var(--muted) !important;
}

/* ── Maximized mode: mini-bar ── */
.cluster-mini-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 1;
}

.mini-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 2px 0;
}

.mini-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-md);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
  border: 1px solid transparent;
  background: var(--bg);
  color: var(--muted);
  user-select: none;
}
.mini-item:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent);
}
.mini-item.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-weight: 500;
}
.mini-item .status-dot {
  width: 7px;
  height: 7px;
}
.mini-name {
  font-weight: 500;
}
.mini-hint {
  font-size: 11px;
  opacity: 0.6;
}

.restore-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.restore-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-bg);
}

/* ── Maximize / Restore button ── */
.maximize-btn.restore {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Card maximized ── */
/* ── Test connection ── */
.test-nodes-list {
  max-height: 320px;
  overflow-y: auto;
}
.test-node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
}
.test-node-row:last-child {
  border-bottom: none;
}
.node-addr {
  font-family: monospace;
  font-size: 14px;
  color: var(--fg);
}
.test-progress {
  max-height: 400px;
  overflow-y: auto;
}
.test-log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.test-log-row:last-child {
  border-bottom: none;
}
.test-log-row.success {
  color: var(--success);
}
.test-log-row.error {
  color: var(--danger);
}
.test-action-link {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}
.test-status-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.log-msg {
  font-family: monospace;
  font-size: 12px;
  color: var(--fg);
}

@media (max-width: 1200px) {
  .cluster-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 768px) {
  .cluster-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style></style>
