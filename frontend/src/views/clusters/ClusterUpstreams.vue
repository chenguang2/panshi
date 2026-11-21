<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddUpstreamModal(cluster)">
        <StrokeIcon name="plus" :size="13" /> 添加上游
      </a-button>
      <!-- 批量删除：行内动作收敛到 ⋯ 菜单后，多选删除的唯一入口（与节点 Tab 同款形态） -->
      <a-button size="small" danger :disabled="!deleteEnabled" @click="handleDeleteClick"
        >删除上游{{ deleteCount > 0 ? `(${deleteCount})` : '' }}</a-button
      >

      <div class="toolbar-right">
        <ColumnConfigPopover
          v-model:open="upstreamColumnPopoverVisible"
          :all-columns="allUpstreamColumns"
          v-model:columns="upstreamColumnsSelected"
          :all-actions="allUpstreamActionButtons"
          v-model:actions="upstreamActionsSelected"
          v-model:search="upstreamSearchVisible"
          width-resettable
          @reset-widths="handleResetUpstreamResetWidths"
        />
        <template v-if="upstreamSearchVisible">
          <SearchInput
            v-model="cluster.upstreamsSearch"
            placeholder="搜索上游"
            :width="150"
            size="small"
            @search="
              () => {
                cluster.upstreamsPagination!.page = 1
                cluster.selectedUpstreamKeys = []
                cluster.selectedUpstream = null
                loadUpstreams(cluster)
              }
            "
          />
          <a-select
            v-model:value="cluster.upstreamsSearchField"
            placeholder="字段"
            style="width: 90px"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
          </a-select>
        </template>
      </div>
    </div>
    <a-table
      :columns="upstreamTableColumns"
      :data-source="cluster.upstreams || []"
      :pagination="false"
      :loading="cluster.upstreamsLoading"
      :row-selection="{
        selectedRowKeys: cluster.selectedUpstreamKeys || [],
        preserveSelectedRowKeys: true,
        columnWidth: 40,
        onChange: (keys: any, rows: any) => selectUpstreams(cluster, keys, rows),
      }"
      :custom-row="
        (record: any) => ({
          onClick: () => {
            cluster.selectedUpstream = record
          },
        })
      "
      :row-class-name="upstreamRowClassName"
      :showSorterTooltip="false"
      :scroll="{ x: 1054 }"
      :table-layout="'fixed'"
      size="small"
      row-key="id"
      class="node-table upstream-table grid-table"
      @change="(_pag: any, _filters: any, sorter: any) => handleUpstreamSortChange(cluster, sorter)"
    >
      <template #emptyText>
        <div class="empty-guide">
          <p style="margin: 0 0 8px">暂无上游 — 添加上游，定义后端服务的负载均衡目标</p>
          <a-button size="small" type="primary" @click="showAddUpstreamModal(cluster)">添加上游</a-button>
        </div>
      </template>
      <template #headerCell="{ column, title }">
        <!-- 序号列：恒展示、不可拖拽（不进列配置） -->
        <span v-if="column.key === 'index'">{{ title }}</span>
        <span
          v-else
          class="th-resize-wrap"
          :class="upstreamColumnWrapClass(column)"
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
        <template v-if="column.key === 'targets'">
          <div v-if="record.targets && record.targets.length > 0" class="target-list">
            <span v-for="t in previewTargets(record)" :key="t.target" class="target-tag">
              {{ t.target }} <span class="weight">({{ t.weight }})</span>
            </span>
            <span v-if="record.targets.length > 2" class="target-more">+{{ record.targets.length - 2 }}</span>
          </div>
          <span v-else class="target-empty">—</span>
        </template>
        <!-- 发布状态（publish-diff-preview）：覆盖 composable 的 customRender，加差异预览入口 -->
        <template v-else-if="column.key === 'publish_status'">
          <span class="status-cell-flex">
            <PublishStatusTag
              :version="record.current_version"
              :published-at="record.published_at"
              :pending="record.pending_publish === true"
              :last-publish-status="record.last_publish_status ?? null"
            />
            <PublishDiffButton
              :pending="record.pending_publish === true"
              :last-publish-status="record.last_publish_status ?? null"
              @click="openPublishPreview(record)"
            />
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <!-- 行内动作收敛（parity 批 B / 设计 .ops）：主行动「发布」+ ⋯ 三栏菜单 -->
          <div class="action-cell">
            <button
              v-if="upstreamActionsSelected.includes('publish')"
              type="button"
              class="op-pub"
              @click="handleUpstreamAction(cluster, record, 'publish')"
            >
              发布
            </button>
            <a-dropdown v-if="upstreamMenuGroups.all.length > 0" :trigger="['click']">
              <a-button type="text" size="small" class="action-trigger-btn" title="更多操作" aria-label="更多操作">
                <StrokeIcon name="dots" />
              </a-button>
              <template #overlay>
                <a-menu class="l5-action-menu">
                  <a-menu-item
                    v-for="btn in upstreamMenuGroups.crud"
                    :key="btn.key"
                    @click="handleUpstreamAction(cluster, record, btn.key)"
                    >{{ btn.title }}</a-menu-item
                  >
                  <a-menu-divider v-if="upstreamMenuGroups.danger.length" />
                  <a-menu-item
                    v-for="btn in upstreamMenuGroups.danger"
                    :key="btn.key"
                    danger
                    @click="handleUpstreamAction(cluster, record, btn.key)"
                  >
                    <div class="menu-item-stack">
                      <span>{{ btn.title }}</span>
                      <small>{{ btn.desc }}</small>
                    </div>
                  </a-menu-item>
                  <a-menu-divider v-if="upstreamMenuGroups.action.length" />
                  <a-menu-item
                    v-for="btn in upstreamMenuGroups.action"
                    :key="btn.key"
                    @click="handleUpstreamAction(cluster, record, btn.key)"
                  >
                    <div class="menu-item-stack">
                      <span>{{ btn.title }}</span>
                      <small>{{ btn.desc }}</small>
                    </div>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </template>
      </template>
    </a-table>

    <!-- 表外分页条（components/ListPager.vue）：a-table 分页关闭，服务端分页由本组件承担 -->
    <ListPager
      :page="cluster.upstreamsPagination?.page ?? 1"
      :page-size="cluster.upstreamsPagination?.pageSize ?? 20"
      :total="cluster.upstreamsPagination?.total ?? 0"
      unit="个上游"
      @change="onUpstreamPageChange"
    />

    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: upstreamModalVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width: 750px">
          <div class="modal-header">
            <h2>{{ copyingUpstream ? '复制上游' : editingUpstream ? '编辑上游' : '添加上游' }}</h2>
            <button class="modal-close" @click="closeUpstreamModal">&times;</button>
          </div>
          <div class="modal-body">
            <a-tabs v-model:activeKey="upstreamModalActiveTab">
              <a-tab-pane key="basic" tab="基础配置">
                <a-form
                  ref="upstreamFormRef"
                  :model="upstreamForm"
                  :label-col="{ span: 6 }"
                  :wrapper-col="{ span: 16 }"
                >
                  <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入上游名称' }]">
                    <a-input v-model:value="upstreamForm.name" placeholder="请输入上游名称" />
                  </a-form-item>
                  <a-form-item
                    label="负载均衡"
                    name="load_balance"
                    :rules="[{ required: true, message: '请选择负载均衡' }]"
                  >
                    <a-select v-model:value="upstreamForm.load_balance">
                      <a-select-option value="weighted_roundrobin">加权轮询</a-select-option>
                      <a-select-option value="chash">一致性哈希</a-select-option>
                      <a-select-option value="ewma">延迟最小</a-select-option>
                      <a-select-option value="least_conn">最少连接</a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item
                    v-if="upstreamForm.load_balance === 'chash'"
                    label="哈希位置"
                    name="hash_on"
                    :rules="[{ required: true, message: '请选择哈希位置' }]"
                  >
                    <a-select v-model:value="upstreamForm.hash_on">
                      <a-select-option value="header">HTTP请求头</a-select-option>
                      <a-select-option value="cookie">Cookie</a-select-option>
                      <a-select-option value="vars">内置变量</a-select-option>
                      <a-select-option value="vars_combinations">自定义变量</a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item
                    v-if="upstreamForm.load_balance === 'chash'"
                    label="Key"
                    name="key"
                    :rules="[{ required: true, message: '请输入哈希 Key' }]"
                    extra="按哈希位置填写：header 填请求头名（如 X-User-Id），cookie 填 Cookie 名"
                  >
                    <a-input v-model:value="upstreamForm.key" placeholder="请输入哈希 Key" />
                  </a-form-item>
                  <a-form-item label="描述" name="description">
                    <a-textarea v-model:value="upstreamForm.description" :rows="2" />
                  </a-form-item>
                  <a-form-item label="节点列表" :rules="[{ required: true, message: '请至少添加一个节点' }]">
                    <a-table
                      :columns="targetColumns"
                      :data-source="upstreamForm.targets"
                      :pagination="false"
                      size="small"
                      row-key="key"
                    >
                      <template #bodyCell="{ column, record, index }">
                        <template v-if="column.key === 'host'">
                          <a-input v-model:value="record.host" placeholder="主机地址（IP 或域名）" />
                          <div v-if="targetValidation[index]?.host" class="ant-form-item-explain-error">
                            {{ targetValidation[index].host }}
                          </div>
                        </template>
                        <template v-else-if="column.key === 'port'">
                          <a-input-number
                            v-model:value="record.port"
                            :min="1"
                            :max="65535"
                            style="width: 100%"
                            placeholder="端口"
                          />
                          <div v-if="targetValidation[index]?.port" class="ant-form-item-explain-error">
                            {{ targetValidation[index].port }}
                          </div>
                        </template>
                        <template v-else-if="column.key === 'weight'">
                          <a-input-number
                            v-model:value="record.weight"
                            :min="1"
                            :max="100"
                            style="width: 100%"
                            placeholder="权重"
                          />
                          <div v-if="targetValidation[index]?.weight" class="ant-form-item-explain-error">
                            {{ targetValidation[index].weight }}
                          </div>
                        </template>
                        <template v-else-if="column.key === 'action'">
                          <a-button size="small" danger @click="removeUpstreamTarget(index)">删除</a-button>
                        </template>
                      </template>
                    </a-table>
                    <a-button
                      type="dashed"
                      size="small"
                      style="width: 100%; margin-top: 8px"
                      @click="addUpstreamTarget"
                    >
                      <PlusOutlined /> 添加节点
                    </a-button>
                  </a-form-item>
                </a-form>
              </a-tab-pane>

              <a-tab-pane key="advanced" tab="高级配置">
                <div class="advanced-sections">
                  <!-- 健康检查 -->
                  <div class="advanced-section">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleChecks" />
                      <span>健康检查</span>
                    </label>
                    <HealthCheckForm
                      v-model:checks="upstreamForm.checks"
                      v-model:enabled="toggleChecks"
                      v-model:modelMode="checksMode"
                    />
                    <div v-if="formErrors.checks" style="color: var(--danger); font-size: 12px; margin-top: 6px">
                      {{ formErrors.checks }}
                    </div>
                  </div>

                  <!-- 超时配置 -->
                  <div class="advanced-section" @input.capture="onSectionInput">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleTimeout" />
                      <span>超时配置（秒）</span>
                    </label>
                    <div style="display: flex; gap: 8px">
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">连接</div>
                        <a-input-number
                          v-model:value="upstreamForm.timeout.connect"
                          :min="0"
                          placeholder="如 6"
                          style="width: 100%"
                          :disabled="!toggleTimeout"
                        />
                      </div>
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">发送</div>
                        <a-input-number
                          v-model:value="upstreamForm.timeout.send"
                          :min="0"
                          placeholder="如 6"
                          style="width: 100%"
                          :disabled="!toggleTimeout"
                        />
                      </div>
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">读取</div>
                        <a-input-number
                          v-model:value="upstreamForm.timeout.read"
                          :min="0"
                          placeholder="如 6"
                          style="width: 100%"
                          :disabled="!toggleTimeout"
                        />
                      </div>
                    </div>
                    <div style="color: #999; font-size: 11px; margin-top: 2px">
                      建立连接 / 发送请求 / 等待响应的最长等待时间
                    </div>
                    <div v-if="formErrors.timeout" style="color: var(--danger); font-size: 12px; margin-top: 6px">
                      {{ formErrors.timeout }}
                    </div>
                  </div>

                  <!-- 连接池 -->
                  <div class="advanced-section" @input.capture="onSectionInput">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="togglePool" />
                      <span>连接池</span>
                    </label>
                    <div style="display: flex; gap: 8px">
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">大小</div>
                        <a-input-number
                          v-model:value="upstreamForm.keepalive_pool.size"
                          :min="1"
                          placeholder="size"
                          style="width: 100%"
                          :disabled="!togglePool"
                        />
                      </div>
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">空闲超时(秒)</div>
                        <a-input-number
                          v-model:value="upstreamForm.keepalive_pool.idle_timeout"
                          :min="0"
                          placeholder="idle_timeout"
                          style="width: 100%"
                          :disabled="!togglePool"
                        />
                      </div>
                      <div style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">最大请求数</div>
                        <a-input-number
                          v-model:value="upstreamForm.keepalive_pool.requests"
                          :min="1"
                          placeholder="requests"
                          style="width: 100%"
                          :disabled="!togglePool"
                        />
                      </div>
                    </div>
                    <div
                      v-if="formErrors.keepalive_pool"
                      style="color: var(--danger); font-size: 12px; margin-top: 6px"
                    >
                      {{ formErrors.keepalive_pool }}
                    </div>
                  </div>

                  <!-- 重试次数 -->
                  <div class="advanced-section">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleRetries" />
                      <span>重试次数</span>
                    </label>
                    <div :style="{ opacity: toggleRetries ? 1 : 0.45 }">
                      <div class="radio-group">
                        <label class="radio-label"
                          ><input type="radio" value="auto" v-model="retriesRadio" :disabled="!toggleRetries" /><span
                            >自动（使用可用节点数）</span
                          ></label
                        >
                        <label class="radio-label"
                          ><input type="radio" value="custom" v-model="retriesRadio" :disabled="!toggleRetries" /><span
                            >指定重试次数</span
                          ></label
                        >
                        <template v-if="retriesRadio === 'custom'">
                          <a-input-number
                            v-model:value="upstreamForm.retriesInput"
                            :min="0"
                            placeholder="次数"
                            style="width: 120px; margin-left: 24px"
                            :disabled="!toggleRetries"
                          />
                        </template>
                        <label class="radio-label"
                          ><input
                            type="radio"
                            value="disabled"
                            v-model="retriesRadio"
                            :disabled="!toggleRetries"
                          /><span>禁用重试</span></label
                        >
                      </div>
                      <div v-if="formErrors.retries" style="color: var(--danger); font-size: 12px; margin-top: 4px">
                        {{ formErrors.retries }}
                      </div>
                    </div>
                  </div>

                  <!-- 重试超时 -->
                  <div class="advanced-section" @input.capture="onSectionInput">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleRetryTimeout" />
                      <span>重试超时（秒）</span>
                    </label>
                    <a-input-number
                      v-model:value="upstreamForm.retry_timeout"
                      :min="0"
                      placeholder="秒"
                      style="width: 200px"
                      :disabled="!toggleRetryTimeout"
                    />
                    <div v-if="formErrors.retry_timeout" style="color: var(--danger); font-size: 12px; margin-top: 4px">
                      {{ formErrors.retry_timeout }}
                    </div>
                    <div style="color: #999; font-size: 11px; margin-top: 2px">0 = 不限制重试时间</div>
                  </div>

                  <!-- Host 策略 -->
                  <div class="advanced-section">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleHost" />
                      <span>Host 策略</span>
                    </label>
                    <div style="display: flex; gap: 8px">
                      <div style="flex: 1; max-width: 260px">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">Host 策略</div>
                        <a-select v-model:value="upstreamForm.pass_host" :disabled="!toggleHost">
                          <a-select-option value="pass">pass（透传客户端Host）</a-select-option>
                          <a-select-option value="node">node（使用节点Host）</a-select-option>
                          <a-select-option value="rewrite">rewrite（自定义Host）</a-select-option>
                        </a-select>
                      </div>
                      <div v-if="upstreamForm.pass_host === 'rewrite'" style="flex: 1">
                        <div style="margin-bottom: 2px; color: #666; font-size: 12px">上游 Host</div>
                        <a-input
                          v-model:value="upstreamForm.upstream_host"
                          placeholder="指定上游请求的Host"
                          :disabled="!toggleHost"
                        />
                      </div>
                    </div>
                    <div v-if="formErrors.pass_host" style="color: var(--danger); font-size: 12px; margin-top: 6px">
                      {{ formErrors.pass_host }}
                    </div>
                  </div>

                  <!-- 通信协议 -->
                  <div class="advanced-section">
                    <label class="checkbox-label section-toggle">
                      <input type="checkbox" v-model="toggleScheme" />
                      <span>通信协议</span>
                    </label>
                    <a-select v-model:value="upstreamForm.scheme" style="width: 200px" :disabled="!toggleScheme">
                      <a-select-option value="http">http</a-select-option>
                      <a-select-option value="https">https</a-select-option>
                      <a-select-option value="tcp">tcp</a-select-option>
                      <a-select-option value="udp">udp</a-select-option>
                    </a-select>
                  </div>
                </div>
              </a-tab-pane>
            </a-tabs>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeUpstreamModal">取消</button>
            <button class="btn btn-primary" @click="handleUpstreamSubmit">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      :can-publish="true"
      @published="versionModalOnPublished"
      @publish-requested="publishRestoredUpstream"
    />

    <!-- 发布差异预览（publish-diff-preview）：自持拉取；「去发布」接既有发布流程 -->
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="props.cluster.id"
      :resource-type="'upstream'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toValue } from 'vue'
import type { Cluster, Upstream } from '@/types'
import { PlusOutlined, WarningOutlined } from '@ant-design/icons-vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import HealthCheckForm from '@/components/HealthCheckForm.vue'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { message } from 'ant-design-vue'
import ColumnConfigPopover from '@/components/ColumnConfigPopover.vue'
import ListPager from '@/components/ListPager.vue'
import SearchInput from '@/components/SearchInput.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}>()

// Version modal state — defined internally so the composable has full mutable access.
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const {
  upstreamModalVisible,
  upstreamModalActiveTab,
  editingUpstream,
  copyingUpstream,
  upstreamForm,
  upstreamFormRef,
  targetValidation,
  formErrors,
  checksMode,
  allUpstreamColumns,
  upstreamColumnPopoverVisible,
  upstreamColumnsSelected,
  upstreamSearchVisible,
  allUpstreamActionButtons,
  upstreamActionsSelected,
  visibleUpstreamColumns,
  upstreamColumnWidths,
  setUpstreamColumnWidth,
  resetUpstreamColumnWidths,
  setUpstreamColumnOrder,
  orderedUpstreamColumns,
  loadUpstreams,
  handleUpstreamTableChange,
  selectUpstream,
  selectUpstreams,
  showAddUpstreamModal,
  handleUpstreamSubmit,
  closeUpstreamModal,
  deleteUpstream,
  deleteUpstreams,
  publishUpstreamByRecord,
  addUpstreamTarget,
  removeUpstreamTarget,
  handleUpstreamAction,
  toggleChecks,
  toggleTimeout,
  togglePool,
  toggleRetries,
  toggleRetryTimeout,
  toggleHost,
  toggleScheme,
  retriesRadio,
} = useClusterUpstreams({
  clusters: computed(() => props.clusters),
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal: props.openPublishModal,
})

// ── 列拖拽手势共享 composable（cluster-tab-column-personalization 3.2）──
// 几何按拖拽起点所在表解析（D2）：统一管理页同屏可并存多张卡片；name/actions 为锚点不参与移动。
const {
  wrapClass: upstreamColumnWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => allUpstreamColumns,
  orderedKeys: () => orderedUpstreamColumns.value.map((c) => String(c.key)),
  getWidth: (key) => upstreamColumnWidths.value[key],
  setColumnWidth: setUpstreamColumnWidth,
  setColumnOrder: setUpstreamColumnOrder,
  tableSelector: '.upstream-table',
  fixedKeys: ['name', 'actions'],
})

function handleResetUpstreamResetWidths(): void {
  resetUpstreamColumnWidths()
  upstreamColumnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

// ── batch delete selection state（行内动作收敛到 ⋯ 菜单后，批量删除回到工具条） ─────
const batchCount = computed(() => (props.cluster.selectedUpstreamKeys || []).length)
const deleteCount = computed(() => (batchCount.value > 0 ? batchCount.value : props.cluster.selectedUpstream ? 1 : 0))
const deleteEnabled = computed(() => deleteCount.value > 0)

function handleDeleteClick() {
  if (batchCount.value > 0) {
    deleteUpstreams(props.cluster)
  } else {
    deleteUpstream(props.cluster)
  }
}

// ── ⋯ 动作菜单（设计 .l5-menu 三栏：CRUD → 危险 → 动作；#81） ──────────────
// 每项仍受列配置「行动作按钮集」勾选态控制：未勾选的动作不渲染（不改变原有配置语义）
const upstreamMenuGroups = computed(() => {
  const selected = new Set(upstreamActionsSelected.value)
  const crud = [
    { key: 'copy', title: '复制', desc: '' },
    { key: 'edit', title: '编辑', desc: '' },
  ].filter((b) => selected.has(b.key))
  const danger = [{ key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）' }].filter(
    (b) => selected.has(b.key),
  )
  const action = [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }].filter((b) => selected.has(b.key))
  return { crud, danger, action, all: [...crud, ...danger, ...action] }
})

// ── 表格序号列 + 表外分页（central-management-parity 批次 A）─────────────
// 序号列恒展示、不进列配置勾选项（antd CheckboxGroup 会剔除选项外的已选值），
// 位于 row-selection 勾选列之后（勾选列由 a-table 自行渲染）。
const UPSTREAM_INDEX_COLUMN = { title: '#', key: 'index', width: 45, align: 'center' as const }

const upstreamTableColumns = computed(() => [UPSTREAM_INDEX_COLUMN, ...toValue(visibleUpstreamColumns)])

/** 后端分页序号 = (page-1)*pageSize + 本页行号 + 1（#59 表格解剖） */
function rowIndexLabel(cluster: Cluster, index: number): number {
  const pag = cluster.upstreamsPagination
  return ((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1
}

/** ListPager 翻页：写回分页状态 → 清选择 → 复用既有加载函数 */
function onUpstreamPageChange(page: number, pageSize: number): void {
  if (!props.cluster.upstreamsPagination) return
  props.cluster.upstreamsPagination.page = page
  props.cluster.upstreamsPagination.pageSize = pageSize
  props.cluster.selectedUpstreamKeys = []
  props.cluster.selectedUpstream = null
  loadUpstreams(props.cluster)
}

/**
 * 排序回调：`:pagination="false"` 下 antd 的 change 事件 pagination 恒为 `{}`，
 * 直接透传会把 page/pageSize 写成 undefined —— 这里钉住当前分页值，只让排序分支生效。
 */
function handleUpstreamSortChange(cluster: Cluster, sorter: Record<string, unknown> | null): void {
  const pag = cluster.upstreamsPagination
  handleUpstreamTableChange(cluster, { current: pag?.page || 1, pageSize: pag?.pageSize || 20 }, sorter)
}

// 发布差异预览（publish-diff-preview）：预览弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<Upstream | null>(null)

function openPublishPreview(record: Upstream) {
  previewRecord.value = record
  previewVisible.value = true
}

function onPreviewPublish() {
  const record = previewRecord.value
  previewVisible.value = false
  if (record) publishUpstreamByRecord(props.cluster, record)
}

// 选中行高亮：跟随 selectedUpstream，无论来源是行点选还是勾选（4.1/D8）
const upstreamRowClassName = (record: Upstream): string =>
  props.cluster.selectedUpstream?.id === record.id ? 'upstream-row-selected' : ''

// 目标节点列：默认展示前 2 个 + +N 折叠（4.2，对齐全局页 target-tag 形态）
const previewTargets = (record: Upstream) => (record.targets || []).slice(0, 2)

// 版本管理「立即发布恢复的配置」（1.3/组3 A2）：恢复动作针对当前选中的上游；
// publishUpstreamByRecord 返回后重开版本弹窗——重开触发组件既有 open watch 重载版本列表并
// 复位出口条（链路为 promise 单出口，取消时同样回到版本弹窗，恢复本身已落库不丢失）
const publishRestoredUpstream = async () => {
  const selected = props.cluster.selectedUpstream
  if (!selected) return
  versionModalVisible.value = false
  await publishUpstreamByRecord(props.cluster, selected)
  versionModalVisible.value = true
}

// Catch native input events from antdv InputNumber to force model update on clear.
// 超时三项占位统一为「如 6」（4.5），无法再用 placeholder 区分——带标签的 flex 字段
// 经 .ant-input-number 外层找到标签 div 按标签文案识别；「秒」「次数」仍按 placeholder。
const onSectionInput = (e: Event) => {
  const el = e.target as HTMLInputElement
  if (el.tagName !== 'INPUT' || el.value !== '') return
  const wrapper = el.closest('.ant-input-number') ?? el
  const fieldLabel = wrapper.parentElement?.querySelector(':scope > div')?.textContent?.trim()
  switch (fieldLabel) {
    case '连接':
      upstreamForm.timeout.connect = undefined
      return
    case '发送':
      upstreamForm.timeout.send = undefined
      return
    case '读取':
      upstreamForm.timeout.read = undefined
      return
    case '大小':
      upstreamForm.keepalive_pool.size = undefined
      return
    case '空闲超时(秒)':
      upstreamForm.keepalive_pool.idle_timeout = undefined
      return
    case '最大请求数':
      upstreamForm.keepalive_pool.requests = undefined
      return
  }
  switch (el.placeholder) {
    case '秒':
      upstreamForm.retry_timeout = undefined
      break
    case '次数':
      upstreamForm.retriesInput = undefined
      break
  }
}

const targetColumns = [
  { title: '主机/域名', key: 'host', width: 200 },
  { title: '端口', key: 'port', width: 120 },
  { title: '权重', key: 'weight', width: 100 },
  { title: '操作', key: 'action', width: 80 },
]

const versionModalOnPublished = async () => {
  if (versionModalType.value === 'upstream') {
    await loadUpstreams(props.cluster)
  }
}
</script>

<style scoped>
.tab-content {
  min-height: 100px;
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

/* ── 选中行高亮（4.1）：selectedUpstream 来源为行点选或勾选均生效 ── */
.node-table :deep(tr.upstream-row-selected > td) {
  background: oklch(56% 0.16 210 / 10%) !important;
}

/* ── 目标节点列（4.2）：对齐全局上游列表 target-tag 形态 ── */
.target-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.target-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.target-tag .weight {
  color: var(--muted);
  font-size: 11px;
}
.target-more {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
}
.target-empty {
  color: var(--muted);
  font-size: 12px;
}

/* ── Advanced sections ── */
.advanced-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.advanced-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--surface);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.section-toggle {
  margin-bottom: 10px;
  font-weight: 600;
}
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.radio-label input[type='radio'] {
  accent-color: var(--accent);
}
</style>
