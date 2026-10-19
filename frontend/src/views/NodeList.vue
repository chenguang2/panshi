<template>
  <div class="node-list">
    <PageHeader title="节点管理" description="管理 Edge 网关节点，监控运行状态并执行操作">
      <template #actions>
        <button class="btn btn-primary" @click="openAddModal">+ 添加节点</button>
      </template>
    </PageHeader>

    <div class="node-filter-bar">
      <div v-if="nodeSearchVisible" class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索 IP..." class="form-input" @input="onSearchInput" />
        <span class="search-icon"><SearchOutlined /></span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px" @change="onFilterChange">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select v-model="statusFilter" class="form-input" style="width: 130px" @change="onFilterChange">
        <option value="">全部状态</option>
        <option value="running">运行中</option>
        <option value="stopped">已停止</option>
        <option value="unchecked">未检测</option>
      </select>
      <span v-if="statusFilter" class="text-muted text-sm">筛出 {{ displayedNodes.length }} 个</span>
      <a-popover v-model:open="nodeColumnPopoverVisible" trigger="click" placement="bottomLeft">
        <template #content>
          <div style="min-width: 400px">
            <div style="font-weight: 500; margin-bottom: 8px">列选择</div>
            <a-checkbox-group v-model:value="nodeColumnsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px">
                <div v-for="col in columns" :key="col.key" style="margin-bottom: 4px">
                  <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0" />
            <div style="font-weight: 500; margin-bottom: 8px">操作按钮</div>
            <a-checkbox-group v-model:value="nodeActionsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px">
                <div v-for="btn in inlineNodeActionOptions" :key="btn.key" style="margin-bottom: 4px">
                  <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0" />
            <div style="font-weight: 500; margin-bottom: 8px">搜索</div>
            <a-checkbox v-model:checked="nodeSearchVisible">显示搜索框</a-checkbox>
          </div>
        </template>
        <button class="btn btn-secondary btn-sm">列配置</button>
      </a-popover>
      <button class="btn btn-secondary btn-sm refresh-btn" @click="loadNodes"><ReloadOutlined /> 刷新</button>
    </div>

    <!-- 批量工具栏（batch3 2.1 / D5）：动作集与 Tab 默认一致，跨集群节点勾选后按集群分组执行 -->
    <div class="node-batch-bar">
      <span class="batch-count">已选 {{ selectedNodeKeys.length }} 项</span>
      <button class="btn btn-ghost btn-sm" :disabled="!selectedNodeKeys.length" @click="handleBatchStart">
        <PlayCircleOutlined /> 批量启动
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="!selectedNodeKeys.length" @click="handleBatchStop">
        <PauseCircleOutlined /> 批量停止
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="!selectedNodeKeys.length" @click="handleBatchReload">
        <ReloadOutlined /> 批量reload
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="!selectedNodeKeys.length" @click="handleBatchStatus">
        批量状态查询
      </button>
      <span class="batch-bar-spacer"></span>
      <button class="btn btn-secondary btn-sm" @click="openBatchImport">批量导入</button>
    </div>

    <div class="table-container">
      <a-table
        :data-source="displayedNodes"
        :columns="visibleNodeColumns"
        :row-key="(record: any) => record.id"
        :row-selection="rowSelection"
        :pagination="paginationProps({ page, pageSize, total: totalCount }, '个节点')"
        :loading="loading"
        size="middle"
        class="node-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
          </template>
          <template v-if="column.key === 'ip'">
            <span class="text-mono">{{ record.ip }}</span>
          </template>

          <template v-if="column.key === 'service_port'">
            <span class="text-mono text-sm">{{ record.service_port }}</span>
          </template>

          <template v-if="column.key === 'management_port'">
            <span class="text-mono text-sm">{{ record.management_port }}</span>
          </template>

          <template v-if="column.key === 'edge_path'">
            <span class="text-sm">{{ record.edge_path || '-' }}</span>
          </template>

          <template v-if="column.key === 'openresty_path'">
            <span class="text-sm">{{ record.openresty_path || '（同 Edge 安装路径）' }}</span>
          </template>

          <template v-if="column.key === 'status'">
            <div class="node-status-cell">
              <!-- 配置态徽章（管理开关，中性灰，batch2 1.3）：与运行态徽章并排，两维度互不替代 -->
              <BadgeStatus v-if="record.status === 0" text="已禁用" status="neutral" />
              <!-- 运行态三态徽章（batch2 1.2 / D1-D2）：运行中/已停止/未检测互斥，不假绿 -->
              <BadgeStatus v-if="nginxState(record) === 'running'" text="运行中" status="online" />
              <BadgeStatus v-else-if="nginxState(record) === 'stopped'" text="已停止" status="offline" />
              <BadgeStatus v-else text="未检测" status="neutral" />
              <!-- 检测时效（batch2 2.2 / D3）：无 last_execution 不渲染 -->
              <span v-if="record.status_detail?.last_execution" class="status-exec-time"
                >{{ formatRelativeTime(record.status_detail.last_execution) }}检测</span
              >
            </div>
          </template>

          <template v-if="column.key === 'edge_version'">
            <span class="text-mono text-sm">{{ record.status_detail?.statistic?.edge_version || '-' }}</span>
          </template>

          <template v-if="column.key === 'actions'">
            <div class="node-actions-wrap">
              <!-- 动作钮集（batch3 4.1 / D8）：共享 allNodeActionButtons 配置化（行内勾选 start/stop/status） -->
              <template v-for="btnKey in rowActionKeys" :key="btnKey">
                <button class="btn btn-ghost btn-sm" @click="handleConfiguredAction(record, btnKey)">
                  <PlayCircleOutlined v-if="btnKey === 'start'" />
                  <PauseCircleOutlined v-else-if="btnKey === 'stop'" />
                  {{ getActionButtonTitle(btnKey) }}
                </button>
              </template>
              <button class="btn btn-ghost btn-sm" @click="handleReload(record)"><ReloadOutlined /> reload</button>
              <a-dropdown :trigger="['click']">
                <a-button type="text" size="small" class="action-trigger-btn"><MoreOutlined /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="viewDetail(record)">详情</a-menu-item>
                    <a-menu-item
                      v-for="btn in unselectedSharedActions"
                      :key="btn.key"
                      @click="handleConfiguredAction(record, btn.key)"
                    >
                      {{ btn.title }}
                    </a-menu-item>
                    <a-menu-divider
                      v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')"
                    />
                    <a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty(record)"
                      >安装 OpenResty</a-menu-item
                    >
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge(record)"
                      >安装 Edge</a-menu-item
                    >
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleAssociateNewOpenresty(record)"
                      >关联新OpenResty</a-menu-item
                    >
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleEdgePackManagement(record)"
                      >升级Edge小版本</a-menu-item
                    >
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="empty-state">
            <div class="empty-state-icon">◎</div>
            <p>暂无节点</p>
          </div>
        </template>
      </a-table>
    </div>

    <!-- Add / Edit Node Modal -->
    <div class="modal-overlay" :style="{ display: formModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ editingNode ? '编辑节点' : '添加节点' }}</h2>
          <button class="modal-close" @click="closeFormModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select
                v-model="formData.cluster_id"
                class="form-input"
                :class="{ 'has-error': formErrors.cluster_id }"
                :disabled="!!editingNode"
              >
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <span class="form-error" v-if="formErrors.cluster_id">{{ formErrors.cluster_id }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">IP 地址 <span class="required">*</span></label>
              <input
                v-model="formData.ip"
                type="text"
                class="form-input"
                :class="{ 'has-error': formErrors.ip }"
                placeholder="10.0.0.1"
              />
              <span class="form-error" v-if="formErrors.ip">{{ formErrors.ip }}</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">服务端口 <span class="required">*</span></label>
              <input
                v-model.number="formData.service_port"
                type="number"
                class="form-input"
                :class="{ 'has-error': formErrors.service_port }"
                min="1"
                max="65535"
              />
              <span class="form-error" v-if="formErrors.service_port">{{ formErrors.service_port }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">管理端口 <span class="required">*</span></label>
              <input
                v-model.number="formData.management_port"
                type="number"
                class="form-input"
                :class="{ 'has-error': formErrors.management_port }"
                min="1"
                max="65535"
              />
              <span class="form-error" v-if="formErrors.management_port">{{ formErrors.management_port }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">SSH端口</label>
              <input
                v-model.number="formData.ssh_port"
                type="number"
                class="form-input"
                min="1"
                max="65535"
                placeholder="默认 22"
              />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">OpenResty 安装路径 <span class="required">*</span></label>
            <input
              v-model="formData.openresty_path"
              type="text"
              class="form-input"
              :class="{ 'has-error': formErrors.openresty_path }"
              placeholder="/usr/local/nginx"
            />
            <span class="form-error" v-if="formErrors.openresty_path">{{ formErrors.openresty_path }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">Edge 安装路径 <span class="required">*</span></label>
            <input
              v-model="formData.edge_path"
              type="text"
              class="form-input"
              :class="{ 'has-error': formErrors.edge_path }"
              placeholder="/usr/local/edge"
            />
            <span class="form-error" v-if="formErrors.edge_path">{{ formErrors.edge_path }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">状态</label>
            <select class="form-input" v-model="formData.statusCheck">
              <option :value="true">启用</option>
              <option :value="false">禁用</option>
            </select>
            <div class="form-hint">
              禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeFormModal">取消</button>
          <button class="btn btn-primary" @click="handleFormSubmit" :disabled="formSubmitting">
            {{ formSubmitting ? '提交中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div class="modal-overlay" :style="{ display: detailModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ detailTitle }}</h2>
          <button class="modal-close" @click="detailModalVisible = false">&times;</button>
        </div>
        <div class="modal-body" v-if="detailNode">
          <div class="node-detail-grid">
            <div class="nd-label">IP 地址</div>
            <div class="nd-value">{{ detailNode.ip }}</div>
            <div class="nd-label">所属集群</div>
            <div class="nd-value">{{ detailNode.cluster_name || '-' }}</div>
            <div class="nd-label">服务端口</div>
            <div class="nd-value">{{ detailNode.service_port }}</div>
            <div class="nd-label">管理端口</div>
            <div class="nd-value">{{ detailNode.management_port }}</div>
            <div class="nd-label">Edge 安装路径</div>
            <div class="nd-value">{{ detailNode.edge_path }}</div>
            <div class="nd-label">OpenResty 安装路径</div>
            <div class="nd-value">{{ detailNode.openresty_path || '（同 Edge 安装路径）' }}</div>
            <div class="nd-label">节点状态</div>
            <div class="nd-value">
              <div class="node-status-cell">
                <BadgeStatus v-if="detailNode.status === 0" text="已禁用" status="neutral" />
                <BadgeStatus v-if="nginxState(detailNode) === 'running'" text="运行中" status="online" />
                <BadgeStatus v-else-if="nginxState(detailNode) === 'stopped'" text="已停止" status="offline" />
                <BadgeStatus v-else text="未检测" status="neutral" />
                <span v-if="detailNode.status_detail?.last_execution" class="status-exec-time"
                  >{{ formatRelativeTime(detailNode.status_detail.last_execution) }}检测</span
                >
              </div>
            </div>
            <div class="nd-label">管理开关</div>
            <div class="nd-value">{{ detailNode.status === 1 ? '启用' : '禁用' }}</div>
            <div class="nd-label">创建时间</div>
            <div class="nd-value">{{ formatDate(detailNode.created_at) }}</div>
          </div>
          <div v-if="clusterStats" class="node-stats">
            <div class="node-stats-label">所在集群统计（集群级）</div>
            <div class="node-stats-grid">
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.routes || 0 }}</div>
                <div class="ns-label">路由</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.upstreams || 0 }}</div>
                <div class="ns-label">上游</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.plugin_configs || 0 }}</div>
                <div class="ns-label">插件组</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.global_rules || 0 }}</div>
                <div class="ns-label">全局规则</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.plugin_metadata || 0 }}</div>
                <div class="ns-label">插件元数据</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.static_resources || 0 }}</div>
                <div class="ns-label">静态资源</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="detailModalVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Config Diff Drawer -->
    <ConfigDiff v-model:visible="diffDrawerVisible" :cluster-id="diffClusterId" :initial-node-id="diffNodeId" />

    <!-- Execution Result Drawer -->
    <NodeExecutionResultDrawer
      :visible="execDrawerVisible"
      :title="execDrawerTitle"
      :mode="execDrawerMode"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      :installing="installInstalling"
      :stream-error="installError"
      :stream-status="installStatus"
      @update:visible="execDrawerVisible = $event"
      @cancel="handleCancelInstall"
    />

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

    <!-- 批量动作进度弹窗（batch3 1.4 / D4：与 Tab 渲染同一组件、状态来自共享工厂） -->
    <BatchActionProgressModal
      v-model:visible="batchProgressVisible"
      :title="batchProgressTitle"
      :items="batchProgressItems"
      :expanded-ip="batchProgressExpandedIp"
      @toggle-expand="
        (ip: string) => {
          batchProgressExpandedIp = batchProgressExpandedIp === ip ? null : ip
        }
      "
    />

    <!-- 批量导入弹窗（batch3 3.2 / D7：粘贴/CSV 双 tab，与 Tab 同一 parse/validate/submit 机制） -->
    <div class="modal-overlay" :style="{ display: importModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>批量导入节点</h2>
          <button class="modal-close" @click="closeImportModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">所属集群</label>
            <!-- #204：占位 option value="" ↔ 模型初值/重置 importClusterId='' 精确匹配 -->
            <select v-model="importClusterId" class="form-input">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
          </div>
          <div class="import-toolbar">
            <button
              class="btn btn-sm"
              :class="importTab === 'text' ? 'btn-primary' : 'btn-secondary'"
              @click="importTab = 'text'"
            >
              粘贴 IP 列表
            </button>
            <button
              class="btn btn-sm"
              :class="importTab === 'csv' ? 'btn-primary' : 'btn-secondary'"
              @click="importTab = 'csv'"
            >
              CSV 上传
            </button>
          </div>
          <div v-if="importTab === 'text'" class="import-pane">
            <textarea
              v-model="importText"
              class="form-input import-textarea"
              rows="5"
              placeholder="每行一个 IP，支持 # 注释"
            ></textarea>
            <button class="btn btn-secondary btn-sm" @click="parseImportText">解析</button>
          </div>
          <div v-else class="import-pane">
            <input type="file" accept=".csv" @change="onImportCsvChange" style="font-size: 12px" />
            <button class="btn btn-secondary btn-sm" @click="downloadImportTemplate">下载模板</button>
          </div>
          <div v-if="importRows.length" class="import-preview">
            <div class="text-sm text-muted">
              共 {{ importRows.length }} 行，有效 {{ importValidCount }} 行（默认值：服务端口
              {{ importDefaults.service_port }}、管理端口 {{ importDefaults.management_port }}、Edge 路径
              {{ importDefaults.edge_path }}）
            </div>
            <table class="import-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>服务端口</th>
                  <th>管理端口</th>
                  <th>Edge 路径</th>
                  <th>原因</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in importRows" :key="idx" :class="{ 'import-row-invalid': importRowError(row) }">
                  <td class="text-mono">{{ row.ip }}</td>
                  <td>{{ row.service_port }}</td>
                  <td>{{ row.management_port }}</td>
                  <td>{{ row.edge_path }}</td>
                  <td class="import-error-cell">{{ importRowError(row) || '' }}</td>
                  <td><button class="btn btn-ghost btn-sm" @click="importRows.splice(idx, 1)">移除</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeImportModal">取消</button>
          <button class="btn btn-primary" :disabled="importSubmitDisabled" @click="submitImport">
            提交（{{ importValidCount }}）
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatDateTime as formatDate, formatRelativeTime } from '@/utils/format'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import { showDangerConfirm } from '@/composables/useOverlayModal'
import { PAGE_SIZE_TABLE, PAGE_SIZE_DROPDOWN } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import BatchActionProgressModal from '@/components/BatchActionProgressModal.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import InstallOpenrestyDialog from '@/components/InstallOpenrestyDialog.vue'
import EdgePackManagementDialog from '@/components/EdgePackManagementDialog.vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { paginationProps } from '@/composables/usePagination'
import { useColumnConfig } from '@/composables/useColumnConfig'
import { useFeaturesStore } from '@/stores/features'
import { listNodes, createNode, updateNode } from '@/api/nodes'
import {
  nginxState,
  createCancelNodeInstallHandler,
  submitNodeBatchImport,
  allNodeActionButtons,
  type NodeImportRow,
} from '@/composables/useClusterNodes'
import { showNodeDeleteConfirm, executeDeleteWithProgress, showBatchStatusModal } from '@/composables/useClusterUtils'
import {
  runClusterGroupedBatchAction,
  runBatchNodeStatus,
  formatClusterBatchSummary,
  createBatchProgressState,
  warnNoNodesSelected,
  type BatchProgressState,
} from '@/composables/useBatchNodeAction'
import { parseIpList, parseNodeCsv, buildNodeCsvTemplate, validateNodeImportRow } from '@/utils/nodeImport'
import { getApiErrorMessage } from '@/utils/error'
import { buildNodeInstallCommand } from '@/utils/nodeInstallCommand'
import { isStructuredSseEvent } from '@/utils/sse'
import {
  SearchOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  MoreOutlined,
} from '@ant-design/icons-vue'

import { useRoute } from 'vue-router'

const route = useRoute()
const featuresStore = useFeaturesStore()

// ── State ──
const loading = ref(false)
const nodes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string>('')
const groupFilter = ref('__all__')
const statusFilter = ref('')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  onFilterChange()
}

const displayedNodes = computed(() => {
  let list = nodes.value
  if (statusFilter.value) {
    // 运行态三元过滤（batch2 3.1 / D5）：按 nginxState 判定，不按管理开关字段
    list = list.filter((n) => nginxState(n) === statusFilter.value)
  }
  return list
})

let _elapsedTimer: ReturnType<typeof setInterval> | null = null

// Form modal
const formModalVisible = ref(false)
const editingNode = ref<any | null>(null)
const formSubmitting = ref(false)
const formData = reactive({
  cluster_id: '' as number | string,
  ip: '',
  service_port: 80,
  management_port: 9180,
  ssh_port: 22,
  edge_path: '',
  openresty_path: '',
  statusCheck: true,
})
const formErrors = reactive<Record<string, string>>({})
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// Detail modal
const detailModalVisible = ref(false)
const detailNode = ref<any | null>(null)
const clusterStats = ref<any | null>(null)
const detailTitle = computed(() => (detailNode.value ? `节点详情 — ${detailNode.value.ip}` : '节点详情'))

// Execution drawer
const execDrawerVisible = ref(false)
const execDrawerTitle = ref('')
/** 结果抽屉摘要形态（batch1 3.2 / design D5）：install=安装摘要、action=动作摘要（无 nginx 进程卡）、
 *  auto=按标题回退（安装 → 安装摘要，其余 → nginx 操作摘要，兼容启动/停止/reload）。 */
const execDrawerMode = ref<'install' | 'action' | 'auto'>('auto')
// batch2 5.2 / D8：indeterminate 为动作流起始形态（首个服务端 percent 事件或终态自动退出）
const execProgress = reactive({
  percent: 0,
  status: 'active' as 'active' | 'success' | 'exception',
  indeterminate: false,
})
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
const execHighlights = ref<string[]>([])
const execStatistics = ref<Record<string, string> | null>(null)
const execTargetNode = ref<any | null>(null)
const cancelling = ref(false)

// ── 批量动作（batch3 2.1-2.3 / D5：共享进度状态 + 集群分组执行）──
const batchProgress: BatchProgressState = createBatchProgressState()
const {
  visible: batchProgressVisible,
  title: batchProgressTitle,
  items: batchProgressItems,
  expandedIp: batchProgressExpandedIp,
} = batchProgress
const selectedNodeKeys = ref<number[]>([])
const rowSelection = computed(() => ({
  selectedRowKeys: selectedNodeKeys.value,
  onChange: (keys: number[]) => {
    selectedNodeKeys.value = keys
  },
}))
const batchSelectedNodes = computed(() => nodes.value.filter((n) => selectedNodeKeys.value.includes(n.id)))

function clearBatchSelection() {
  selectedNodeKeys.value = []
}

function groupNodesByCluster(list: Array<{ id: number; ip: string; cluster_id: number; cluster_name?: string }>) {
  const groups = new Map<number, { clusterId: number; clusterName: string; nodes: Array<{ id: number; ip: string }> }>()
  for (const n of list) {
    const g = groups.get(n.cluster_id)
    const node = { id: n.id, ip: n.ip }
    if (g) g.nodes.push(node)
    else
      groups.set(n.cluster_id, {
        clusterId: n.cluster_id,
        clusterName: n.cluster_name || `集群 ${n.cluster_id}`,
        nodes: [node],
      })
  }
  return Array.from(groups.values())
}

async function executeBatchAction(
  list: Array<{ id: number; ip: string; cluster_id: number; cluster_name?: string }>,
  action: 'start' | 'stop' | 'reload',
  label: string,
) {
  // F1：动作类按 cluster_id 分组逐集群调批量端点；集群级失败不中断整体（F4）
  const summary = await runClusterGroupedBatchAction(groupNodesByCluster(list), action, label, {
    progress: batchProgress,
  })
  message.info(formatClusterBatchSummary(summary))
  clearBatchSelection()
  await loadNodes()
}

function confirmBatchAction(action: 'start' | 'stop' | 'reload', label: string) {
  const list = batchSelectedNodes.value
  if (list.length === 0) {
    warnNoNodesSelected()
    return
  }
  showDangerConfirm(
    `确认批量${label}节点`,
    `将对 ${list.length} 个节点执行 ${label} 操作，涉及 ${groupNodesByCluster(list).length} 个集群。确认？`,
    `确认${label}`,
    () => executeBatchAction(list, action, label),
  )
}

function handleBatchStart() {
  confirmBatchAction('start', '启动')
}
function handleBatchStop() {
  confirmBatchAction('stop', '停止')
}
function handleBatchReload() {
  confirmBatchAction('reload', 'reload')
}

// F1：批量状态查询不走批量端点，逐节点 statistic（与 Tab batchNodeStatus 同款路径）
async function handleBatchStatus() {
  const list = batchSelectedNodes.value
  if (list.length === 0) {
    warnNoNodesSelected('查询')
    return
  }
  const rows = await runBatchNodeStatus(list, { progress: batchProgress })
  showBatchStatusModal('批量状态查询', rows)
  clearBatchSelection()
  await loadNodes()
}

// ── 复制节点（batch3 3.1 / D6：预填行配置、IP 清空、清 formErrors）──
function handleCopy(record: any) {
  editingNode.value = null
  formData.cluster_id = record.cluster_id
  formData.ip = ''
  formData.service_port = record.service_port
  formData.management_port = record.management_port
  formData.ssh_port = record.ssh_port ?? 22
  formData.edge_path = record.edge_path || ''
  formData.openresty_path = record.openresty_path || ''
  formData.statusCheck = record.status === 1
  resetFormErrors()
  formModalVisible.value = true
}

// ── 批量导入弹窗（batch3 3.2 / D7：与 Tab 同一 parse/validate/submit 机制）──
const importModalVisible = ref(false)
const importClusterId = ref<number | string>('')
const importTab = ref<'text' | 'csv'>('text')
const importText = ref('')
const importRows = ref<NodeImportRow[]>([])
const importDefaults = reactive({
  service_port: 80,
  management_port: 9180,
  status: 1,
  edge_path: '/edge',
  openresty_path: '/usr/local/nginx',
})
const importCluster = computed(() => clusters.value.find((c) => c.id === Number(importClusterId.value)))
const importValidCount = computed(() => importRows.value.filter((r) => !validateNodeImportRow(r)).length)
const importSubmitDisabled = computed(() => !importClusterId.value || importValidCount.value === 0)

function openBatchImport() {
  importClusterId.value = ''
  importTab.value = 'text'
  importText.value = ''
  importRows.value = []
  importModalVisible.value = true
}

function closeImportModal() {
  importModalVisible.value = false
}

function parseImportText() {
  const parsed = parseIpList(importText.value)
  // 透传 parse 层有效性判定（验收缺陷修复）：非法行 valid=false + error 进预览原因列，
  // importValidCount 不计无效行，submitNodeBatchImport 按 valid 过滤（非法 IP 不入提交体）
  importRows.value = parsed.map((row) => ({
    ip: row.ip,
    service_port: importDefaults.service_port,
    management_port: importDefaults.management_port,
    edge_path: importDefaults.edge_path,
    openresty_path: importDefaults.openresty_path,
    status: importDefaults.status,
    valid: row.valid,
    error: row.error,
  }))
}

function onImportCsvChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const rows = parseNodeCsv(String(reader.result || ''))
    importRows.value = rows.map((r) => ({
      ip: r.ip,
      service_port: r.service_port,
      management_port: r.management_port,
      edge_path: r.edge_path || importDefaults.edge_path,
      openresty_path: r.openresty_path || importDefaults.openresty_path,
      status: r.status,
      valid: r.valid,
      error: r.error,
    }))
  }
  reader.readAsText(file)
  input.value = ''
}

function downloadImportTemplate() {
  const blob = new Blob([buildNodeCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'node-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function importRowError(row: NodeImportRow): string | undefined {
  return validateNodeImportRow(row)
}

async function submitImport() {
  if (!importCluster.value || importSubmitDisabled.value) return
  const ok = await submitNodeBatchImport(importCluster.value, importRows.value)
  if (!ok) return
  importModalVisible.value = false
  importRows.value = []
  importText.value = ''
  await loadNodes()
}

// batch3 1.3 / D3：危险红确认上移为 useOverlayModal 具名导出，本视图改直接引用（原本地包装已删）。
// 危险色语义：动作确认按钮一律危险红；onOk 为 Promise 期间由 okLoading 展示「处理中…」并禁用。

// Config diff drawer
const diffDrawerVisible = ref(false)
const diffClusterId = ref(0)
const diffNodeId = ref(0)

// batch2 3.2 / D6：移除全部列客户端排序——当前页字符串比较序是错的（IP 数值序被打乱），
// 后端 GET /nodes 已全量数值 IP 排序；≤100 节点规模下当前页排序无价值且误导。不做表头排序 UI 替代。
const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: 'IP', dataIndex: 'ip', key: 'ip' },
  { title: '所属集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '服务端口', key: 'service_port' },
  { title: '管理端口', key: 'management_port' },
  { title: 'Edge 安装路径', key: 'edge_path' },
  { title: 'OpenResty 安装路径', key: 'openresty_path' },
  { title: '状态', key: 'status' },
  { title: 'Edge 版本', key: 'edge_version' },
  { title: '操作', key: 'actions', width: 320 },
]

// ── 列/按钮/搜索个性化（batch3 4.1 / D8）──
// 独立 storage key「node_standalone」，与 Tab 的 useColumnConfig('node') 互不影响。
// 行内可调动作 = start/stop/status（reload 为本页特有动作，固定展示）；
// 编辑/复制/删除/数据库对比 恒驻「更多」菜单（D6），不作为 popover 勾选项。
const NODE_ROW_ACTION_KEYS = ['start', 'stop', 'status']
const {
  popoverVisible: nodeColumnPopoverVisible,
  columnsSelected: nodeColumnsSelected,
  searchVisible: nodeSearchVisible,
  actionsSelected: nodeActionsSelected,
} = useColumnConfig({
  key: 'node_standalone',
  defaultColumns: columns.map((c) => c.key),
  defaultActions: [...NODE_ROW_ACTION_KEYS],
  defaultSearchVisible: true,
})
const inlineNodeActionOptions = allNodeActionButtons.filter((b) => NODE_ROW_ACTION_KEYS.includes(b.key))
const visibleNodeColumns = computed(() => {
  const selected = new Set(nodeColumnsSelected.value)
  return columns.filter((c) => selected.has(c.key))
})
// 行内常驻动作 = 勾选的 start/stop/status 子集
const rowActionKeys = computed(() => NODE_ROW_ACTION_KEYS.filter((k) => nodeActionsSelected.value.includes(k)))
// 更多菜单 = 恒驻四钮 + 未勾选的行内动作（非行内钮不受勾选态影响，防止残留配置吞菜单项）
const unselectedSharedActions = computed(() =>
  allNodeActionButtons.filter(
    (b) => !NODE_ROW_ACTION_KEYS.includes(b.key) || !nodeActionsSelected.value.includes(b.key),
  ),
)
function getActionButtonTitle(key: string) {
  return allNodeActionButtons.find((b) => b.key === key)?.title ?? key
}
function handleConfiguredAction(record: any, key: string) {
  switch (key) {
    case 'edit':
      handleEdit(record)
      break
    case 'copy':
      handleCopy(record)
      break
    case 'delete':
      handleDelete(record)
      break
    case 'start':
      handleStart(record)
      break
    case 'stop':
      handleStop(record)
      break
    case 'status':
      handleStatus(record)
      break
    case 'diff':
      handleDiff(record)
      break
  }
}

// ── Data Loading ──

async function loadNodes() {
  loading.value = true
  try {
    const hasStatus = !!statusFilter.value
    const loadAll = hasStatus // 仅 statusFilter 触发客户端过滤，group 过滤走服务端
    const res = await listNodes({
      groupName: groupFilter.value,
      page: loadAll ? 1 : page.value,
      pageSize: loadAll ? PAGE_SIZE_DROPDOWN : pageSize.value,
      search: searchText.value || undefined,
      clusterId: clusterFilter.value ? Number(clusterFilter.value) : undefined,
      status: undefined, // 全部通过 nginxRunning() 客户端过滤
    })
    nodes.value = res.data.items || []
    totalCount.value = loadAll ? nodes.value.length : res.data.total || 0
  } catch (error: unknown) {
    message.error('加载节点列表失败: ' + getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch {
    // 筛选下拉静默为空会误导用户以为没有集群，至少给出一次提示
    message.warning('集群列表加载失败')
  }
}

async function loadClusterStats(clusterId: number) {
  try {
    const res = await api.get(`/clusters/${clusterId}/stats`)
    clusterStats.value = res.data
  } catch {
    clusterStats.value = null
  }
}

// ── Filter / Search / Pagination ──

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  loadNodes()
}

function onFilterChange() {
  page.value = 1
  loadNodes()
}

function onSearchInput() {
  onDebouncedSearch(() => {
    page.value = 1
    loadNodes()
  })
}

// ── Form Modal ──

/** 重置全部校验错误（遍历所有 key，避免逐字段列举遗漏——batch1 2.1） */
function resetFormErrors() {
  for (const key of Object.keys(formErrors)) delete formErrors[key]
}

function openAddModal() {
  editingNode.value = null
  formData.cluster_id = ''
  formData.ip = ''
  formData.service_port = 80
  formData.management_port = 9180
  formData.ssh_port = 22
  formData.edge_path = ''
  formData.openresty_path = ''
  formData.statusCheck = true
  resetFormErrors()
  formModalVisible.value = true
}

function handleEdit(record: any) {
  editingNode.value = record
  formData.cluster_id = record.cluster_id
  formData.ip = record.ip
  formData.service_port = record.service_port
  formData.management_port = record.management_port
  formData.ssh_port = record.ssh_port ?? 22
  formData.edge_path = record.edge_path || ''
  formData.openresty_path = record.openresty_path || ''
  formData.statusCheck = record.status === 1
  resetFormErrors()
  formModalVisible.value = true
}

function closeFormModal() {
  formModalVisible.value = false
  editingNode.value = null
}

async function handleFormSubmit() {
  resetFormErrors()
  let valid = true
  if (!formData.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    valid = false
  }
  if (!formData.ip) {
    formErrors.ip = '请输入 IP 地址'
    valid = false
  } else if (!IP_PATTERN.test(formData.ip)) {
    formErrors.ip = 'IP 地址格式不正确'
    valid = false
  }
  if (!formData.service_port || formData.service_port < 1 || formData.service_port > 65535) {
    formErrors.service_port = '请输入有效的端口号 (1-65535)'
    valid = false
  }
  if (!formData.management_port || formData.management_port < 1 || formData.management_port > 65535) {
    formErrors.management_port = '请输入有效的端口号 (1-65535)'
    valid = false
  }
  if (!formData.edge_path) {
    formErrors.edge_path = '请输入 Edge 安装路径'
    valid = false
  } else if (!formData.edge_path.startsWith('/')) {
    formErrors.edge_path = '路径必须以 / 开头'
    valid = false
  } else if (formData.edge_path.endsWith('/')) {
    formErrors.edge_path = '路径末尾不能为 /'
    valid = false
  }
  if (!formData.openresty_path) {
    formErrors.openresty_path = '请输入 OpenResty 安装路径'
    valid = false
  } else if (!formData.openresty_path.startsWith('/')) {
    formErrors.openresty_path = '路径必须以 / 开头'
    valid = false
  } else if (formData.openresty_path.endsWith('/')) {
    formErrors.openresty_path = '路径末尾不能为 /'
    valid = false
  }
  if (!valid) return

  formSubmitting.value = true
  try {
    const payload = {
      ip: formData.ip,
      service_port: formData.service_port,
      management_port: formData.management_port,
      ssh_port: formData.ssh_port,
      edge_path: formData.edge_path,
      openresty_path: formData.openresty_path || undefined,
      status: formData.statusCheck ? 1 : 0,
    }

    if (editingNode.value) {
      await updateNode(editingNode.value.cluster_id, editingNode.value.id, payload)
      message.success('节点已更新')
    } else {
      await createNode(Number(formData.cluster_id), payload)
      message.success('节点已添加')
    }
    formModalVisible.value = false
    loadNodes()
  } catch (error: unknown) {
    message.error(getApiErrorMessage(error))
  } finally {
    formSubmitting.value = false
  }
}

// ── Detail ──

function viewDetail(record: any) {
  detailNode.value = record
  detailModalVisible.value = true
  clusterStats.value = null
  if (record.cluster_id) {
    loadClusterStats(record.cluster_id)
  }
}

// ── Node Actions ──

// batch2 5.2 / D8：计时器只负责已耗时展示，不再外推假百分比（不确定态由 Drawer 渲染）
function startElapsedTimer() {
  execElapsed.value = 0
  if (_elapsedTimer) clearInterval(_elapsedTimer)
  _elapsedTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
  }, 1000)
}

function stopElapsedTimer() {
  if (_elapsedTimer) {
    clearInterval(_elapsedTimer)
    _elapsedTimer = null
  }
}

async function executeAction(record: any, action: string, actionLabel: string) {
  execDrawerTitle.value = `节点 ${actionLabel}`
  execDrawerMode.value = 'auto'
  execProgress.percent = 0
  execProgress.status = 'active'
  execProgress.indeterminate = true
  execLogs.value = []
  stopElapsedTimer()
  execElapsed.value = null
  execResult.value = null
  execHighlights.value = []
  execStatistics.value = null
  execDrawerVisible.value = true

  // Build pending command for display even on failure
  const nginxCmdMap: Record<string, string> = {
    start: 'nginx_start',
    stop: 'nginx_stop',
    reload: 'nginx_reload',
    status: 'edge_statistic',
  }
  const nginxCmd = nginxCmdMap[action] || action
  const tag = nginxCmd === 'edge_statistic' ? 'edge_statistic' : 'nginx_cmd_run'
  const ev = JSON.stringify({ prefix: record.edge_path || '', ports: String(record.management_port), ips: record.ip })
  const pendingCommand = `ansible-playbook -i inventory -e @env/extravars -e '${ev}' --tags ${tag} edge.yml`

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  // Set command immediately so command tab shows it from the start
  execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
  addLog(`开始对节点 ${record.ip} 执行 ${actionLabel} 操作...`)
  startElapsedTimer()

  try {
    let res
    if (action === 'start') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/start`)
    } else if (action === 'stop') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/stop`)
    } else if (action === 'reload') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/reload`)
    } else if (action === 'status') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/statistic`, {
        ports: String(record.management_port),
      })
    }

    const data = res?.data || {}
    stopElapsedTimer()
    execProgress.percent = 100
    execProgress.indeterminate = false
    const finalCommand = data.command || pendingCommand

    addLog(`返回码 (rc): ${data.rc}`)
    if (finalCommand) {
      addLog('')
      addLog(`--- 执行命令 ---`)
      addLog(finalCommand)
    }
    if (data.stdout) {
      addLog('')
      addLog('--- 输出 (stdout) ---')
      addLog(data.stdout)
    }
    if (data.stderr) {
      addLog('')
      addLog('--- 错误输出 (stderr) ---')
      addLog(data.stderr)
    }
    addLog('')
    if (data.rc === 0) {
      execProgress.status = 'success'
      addLog(`✅ 节点 ${actionLabel} 成功`)
    } else {
      execProgress.status = 'exception'
      addLog(`❌ 节点 ${actionLabel} 失败`)
    }

    execHighlights.value = []
    execStatistics.value = data.statistic ? { ...data.statistic } : null
    execResult.value = { stdout: data.stdout || '', stderr: data.stderr || '', command: finalCommand, rc: data.rc }
    loadNodes()
  } catch (error: unknown) {
    stopElapsedTimer()
    execProgress.status = 'exception'
    execProgress.percent = 100
    execProgress.indeterminate = false
    const errMsg = getApiErrorMessage(error)
    addLog(`❌ 操作失败: ${errMsg}`)
    execHighlights.value = []
    execStatistics.value = null
    execResult.value = { stdout: '', stderr: errMsg, command: pendingCommand, rc: -1 }
  }
}

function handleStart(record: any) {
  showDangerConfirm(
    '确认启动节点',
    `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`,
    '确认启动',
    async () => {
      await executeAction(record, 'start', '启动')
    },
  )
}

function handleStop(record: any) {
  showDangerConfirm(
    '确认停止节点',
    `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    '确认停止',
    async () => {
      await executeAction(record, 'stop', '停止')
    },
  )
}

function handleReload(record: any) {
  showDangerConfirm(
    '确认重新加载节点',
    `即将对节点 ${record.ip} 执行"reload"操作，重新加载配置，确认继续？`,
    '确认reload',
    async () => {
      await executeAction(record, 'reload', 'reload')
    },
  )
}

function handleStatus(record: any) {
  executeAction(record, 'status', '状态查询')
}

// ── Install OpenResty Dialog ─────────────────────────────────────
const installDialogVisible = ref(false)
const installTargetNode = ref<any>(null)

// ── Install OpenResty / Edge (streaming) ──────────────────────────
const installStream = useInstallStream()
const { installing: installInstalling, error: installError, status: installStatus } = installStream

/** 消费侧过滤（batch1 3.1 / design D4）：结构化 SSE 事件（可 JSON.parse 且含 type 字段）
 *  不再以裸 JSON 行混入执行日志展示，业务分支（onProgress/onComplete）照常处理；
 *  useInstallStream 转发契约不动。 */
function appendStreamLine(line: string) {
  if (isStructuredSseEvent(line)) return
  execLogs.value = [...execLogs.value, line]
}

// batch3 1.1 / D1：命令构建收敛到 utils/nodeInstallCommand 共享纯函数（本视图原实现即基线形态），
// 调用点直引 buildNodeInstallCommand，不再保留本地包装。

function handleInstallOpenresty(record: any) {
  installTargetNode.value = record
  installDialogVisible.value = true
}

function closeInstallDialog() {
  installDialogVisible.value = false
}

function onInstallConfirm(payload: { node: any; clusterId: number; openrestyFile: string }) {
  installDialogVisible.value = false
  const record = payload.node
  execTargetNode.value = record
  execDrawerTitle.value = `安装 OpenResty - ${record.ip}`
  execDrawerMode.value = 'install'
  execDrawerVisible.value = true
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'

  const prefix = record.openresty_path
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(
    `/clusters/${record.cluster_id}/nodes/${record.id}/install-openresty`,
    { prefix, openresty_file: payload.openrestyFile },
    {
      onLine: (line: string) => {
        appendStreamLine(line)
      },
      onProgress: (percent: number) => {
        if (percent > execProgress.percent) execProgress.percent = percent
      },
      onComplete: (rc: number, _status: string) => {
        stopElapsedTimer()
        execProgress.status = rc === 0 ? 'success' : 'exception'
        execProgress.percent = 100
        const prevCmd = execResult.value?.command || ''
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
      },
      onError: (err: string) => {
        execLogs.value = [...execLogs.value, `❌ ${err}`]
      },
    },
  )
}

function handleInstallEdge(record: any) {
  showDangerConfirm(
    '\u786e\u8ba4\u5b89\u88c5 Edge',
    `\u5373\u5c06\u5728\u8282\u70b9 ${record.ip} \u4e0a\u5b89\u88c5 Edge\uff08${record.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `\u5b89\u88c5 Edge - ${record.ip}`
      execDrawerMode.value = 'install'
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      const prefix = record.openresty_path || record.edge_path
      const pendingCommand = buildNodeInstallCommand(record, 'install_edge', { prefix })
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/install-edge`,
        { prefix },
        {
          onLine: (line: string) => {
            appendStreamLine(line)
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

function handleAssociateNewOpenresty(record: any) {
  const prefix = record.openresty_path || ''
  showDangerConfirm(
    '关联新OpenResty',
    `即将把节点 ${record.ip} 的 Edge（${record.edge_path}）关联到新 OpenResty（${prefix}），确认开始？`,
    '确认关联',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `关联新OpenResty - ${record.ip}`
      execDrawerMode.value = 'action'
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      execProgress.indeterminate = true
      const pendingCommand = `manager upgrade ${record.edge_path}`
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/associate-new-openresty`,
        {},
        {
          onLine: (line: string) => {
            appendStreamLine(line)
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            execProgress.indeterminate = false
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

const edgePackDialogVisible = ref(false)
const edgePackDialogNode = ref<any>(null)

function handleEdgePackManagement(record: any) {
  edgePackDialogNode.value = record
  edgePackDialogVisible.value = true
}

// batch3 1.2 / D2：取消安装收敛到共享工厂（确认机制 showDangerConfirm、失败提取 getApiErrorMessage）
const handleCancelInstall = createCancelNodeInstallHandler({
  execTargetNode,
  cancelling,
  execLogs,
  execProgress,
  execResult,
  installStream,
})

// ── Delete ──

function handleDelete(record: any) {
  // 删除流程统一（batch1 1.3 / 约定 #25 三层制）：节点专用确认变体 + 共享进度删除。
  // 固定语义 delete_db=true / delete_edge=false（D2：节点机上的进程不联动删除，
  // 后端 delete_edge skipped 语义保留）。
  showNodeDeleteConfirm({
    ip: record.ip,
    onOk: async (_deleteDb: boolean, _deleteEdge: boolean, _nodeIds: number[]) => {
      await executeDeleteWithProgress({
        title: `删除节点: ${record.ip}`,
        apiEndpoint: `/clusters/${record.cluster_id}/nodes/${record.id}`,
        cluster: { id: record.cluster_id },
        deleteDb: true,
        deleteEdge: false,
        nodeIds: [],
        refreshFn: loadNodes,
      })
    },
  })
}

// ── Diff ──

function handleDiff(record: any) {
  diffClusterId.value = record.cluster_id
  diffNodeId.value = record.id
  diffDrawerVisible.value = true
}

// ── Utils ──

// 运行态判定已收敛到 useClusterNodes.nginxState（batch2 1.1 / D1：三元、不假绿）

// ── Lifecycle ──

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadNodes()

  window.addEventListener('edge-pack-add', onEdgePackAdd)
  window.addEventListener('edge-pack-rebase', onEdgePackRebase)
})

onUnmounted(() => {
  cancelSearch()
  // 离开页面时停掉执行耗时定时器（范式：RelayGateways.vue），避免后台残留
  stopElapsedTimer()
  window.removeEventListener('edge-pack-add', onEdgePackAdd)
  window.removeEventListener('edge-pack-rebase', onEdgePackRebase)
})

function streamEdgeAction(record: any, title: string, url: string, body: Record<string, any>) {
  execTargetNode.value = record
  execDrawerTitle.value = title
  execDrawerMode.value = 'action'
  execDrawerVisible.value = true
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execProgress.indeterminate = true
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(url, body, {
    onLine: (line: string) => {
      appendStreamLine(line)
    },
    onProgress: (percent: number) => {
      if (percent > execProgress.percent) execProgress.percent = percent
    },
    onComplete: (rc: number, _status: string) => {
      stopElapsedTimer()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      execProgress.indeterminate = false
      const prevCmd = execResult.value?.command || ''
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
    },
    onError: (err: string) => {
      execLogs.value = [...execLogs.value, `\u274c ${err}`]
      stopElapsedTimer()
      execProgress.percent = 100
      execProgress.status = 'exception'
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
</script>

<style scoped>
/* 批量工具栏（batch3 2.1） */
.node-batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.node-batch-bar .batch-count {
  color: var(--muted);
  font-size: 13px;
  margin-right: 4px;
}
.node-batch-bar .batch-bar-spacer {
  flex: 1;
}
/* 批量导入弹窗（batch3 3.2） */
.import-toolbar {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.import-pane {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.import-textarea {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
}
.import-preview {
  margin-top: 10px;
}
.import-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  font-size: 12px;
}
.import-table th,
.import-table td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
}
.import-row-invalid td {
  background: rgba(255, 77, 79, 0.08);
}
.import-error-cell {
  color: var(--danger);
}

.node-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.text-mono {
  font-family: var(--font-mono);
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

.node-actions-wrap {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

.empty-state {
  text-align: center;
  color: var(--muted);
}
.empty-state-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-wide {
  max-width: 700px;
}

.form-row {
  display: flex;
  gap: 16px;
}
.form-group {
  flex: 1;
  margin-bottom: 16px;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}
.required {
  color: var(--danger);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

/* 状态单元格：运行态/配置态徽章并排 + 检测时效弱化文字（batch2 1.2/1.3/2.2） */
.node-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.status-exec-time {
  font-size: 12px;
  color: var(--muted);
}

/* Detail */
.node-detail-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 6px 16px;
  font-size: 13px;
  margin-bottom: 16px;
}
.node-detail-grid .nd-label {
  color: var(--muted);
  font-weight: 500;
}
.node-detail-grid .nd-value {
  font-family: var(--font-mono);
  word-break: break-all;
}
.node-stats {
  margin-bottom: 8px;
}
.node-stats-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.node-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.node-stat-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
  text-align: center;
}
.node-stat-card .ns-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}
.node-stat-card .ns-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}
</style>
