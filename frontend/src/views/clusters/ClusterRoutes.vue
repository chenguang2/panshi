<template>
  <div class="tab-content">
    <!-- Toolbar -->
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddRouteModal(cluster)">添加路由</a-button>
      <a-button size="small" @click="copyRoute(cluster)" :disabled="!cluster.selectedRoute">复制路由</a-button>
      <a-button size="small" @click="editRoute(cluster)" :disabled="!cluster.selectedRoute">编辑路由</a-button>
      <a-button size="small" danger :disabled="!cluster.selectedRoute" @click="deleteRoute(cluster)">删除路由</a-button>
      <a-divider type="vertical" />
      <a-button size="small" @click="publishRoute(cluster)" :disabled="!cluster.selectedRoute">发布</a-button>
      <a-button size="small" @click="openRouteVersionManagement(cluster)" :disabled="!cluster.selectedRoute">版本管理</a-button>
      <a-divider type="vertical" />
      <a-popover v-model:open="routeColumnPopoverVisible" trigger="click" placement="bottomRight">
        <template #title>选择显示列</template>
        <template #content>
          <a-checkbox-group v-model:value="routeColumnsSelected">
            <div v-for="col in allRouteColumns" :key="col.key" style="min-width: 120px; margin-bottom: 8px;">
              <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
            </div>
          </a-checkbox-group>
          <a-divider style="margin: 12px 0;" />
          <div style="font-weight: 500; margin-bottom: 8px;">操作按钮</div>
          <a-checkbox-group v-model:value="routeActionsSelected">
            <div v-for="btn in allActionButtons" :key="btn.key" style="min-width: 120px; margin-bottom: 8px;">
              <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
            </div>
          </a-checkbox-group>
          <a-divider style="margin: 12px 0;" />
          <div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
          <a-checkbox v-model:checked="routeSearchVisible">显示搜索框</a-checkbox>
        </template>
        <a-button size="small">列配置</a-button>
      </a-popover>

      <div class="toolbar-right">
        <template v-if="routeSearchVisible">
          <a-input-search
            v-model:value="cluster.routesSearch"
            placeholder="搜索路由"
            style="width: 150px;"
            @search="() => { cluster.routesPagination!.page = 1; loadRoutes(cluster) }"
            allow-clear
            size="small"
          />
          <a-select
            v-model:value="cluster.routesSearchField"
            placeholder="字段"
            style="width: 90px;"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
            <a-select-option value="uri">URI</a-select-option>
          </a-select>
        </template>
      </div>
    </div>

    <!-- Route table -->
    <a-table
      :columns="visibleRouteColumns"
      :data-source="cluster.routes || []"
      :pagination="{
        current: cluster.routesPagination?.page,
        pageSize: cluster.routesPagination?.pageSize,
        total: cluster.routesPagination?.total,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50', '100'],
        showQuickJumper: true
      }"
      :loading="cluster.routesLoading"
      :row-selection="{ selectedRowKeys: cluster.selectedRoute ? [cluster.selectedRoute.id] : [], onChange: (_keys: any, rows: any) => selectRoute(cluster, rows[rows.length - 1]) }"
      :showSorterTooltip="false"
      size="small"
      row-key="id"
      class="node-table"
      @change="(pag: any, _filters: any, sorter: any) => handleRouteTableChange(cluster, pag, sorter)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'upstream_id'">
          {{ getUpstreamName(cluster, record.upstream_id) }}
        </template>
        <template v-if="column.key === 'advanced_match_enabled'">
          <a-tag :color="record.advanced_match_enabled ? 'green' : 'default'">
            {{ record.advanced_match_enabled ? '是' : '否' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'status'">
          <BadgeStatus :text="record.status === 1 ? '正常' : '禁用'" :status="record.status === 1 ? 'online' : 'offline'" />
        </template>
        <template v-if="column.key === 'actions'">
          <template v-for="btnKey in routeActionsSelected" :key="btnKey">
            <a-divider type="vertical" v-if="btnKey === 'publish'" />
            <a-button size="small" @click="handleRouteAction(cluster, record, btnKey)">
              {{ getActionButtonTitle(btnKey) }}
            </a-button>
          </template>
        </template>
      </template>
    </a-table>

    <!-- Route add/edit modal -->
    <div class="modal-overlay" :style="{ display: routeModalVisible ? 'flex' : 'none' }" @click.self="routeModalVisible = false">
      <div class="modal" style="max-width:800px;">
        <div class="modal-header">
          <h2>{{ copyingRoute ? '复制路由' : (editingRoute ? '编辑路由' : '添加路由') }}</h2>
          <button class="modal-close" @click="routeModalVisible = false">&times;</button>
        </div>
        <div class="modal-body" style="min-height:420px;">
          <a-tabs v-model:activeKey="routeModalActiveTab" :lazy="true">
            <!-- Basic config tab -->
            <a-tab-pane key="basic" tab="基础配置">
              <a-form ref="routeFormRef" :model="routeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
                <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入路由名称' }]">
                  <a-input v-model:value="routeForm.name" placeholder="请输入路由名称" />
                </a-form-item>
                <a-form-item label="URI" name="uri" :rules="[{ required: true, message: '请输入URI' }]">
                  <a-input v-model:value="routeForm.uri" placeholder="如: /api/*" />
                </a-form-item>
                <a-form-item label="请求方法" name="methods" :rules="[{ required: true, message: '请选择请求方法' }]">
                  <a-select v-model:value="routeForm.methods" mode="multiple" placeholder="可选多个方法" style="width: 300px">
                    <a-select-option value="GET">GET</a-select-option>
                    <a-select-option value="POST">POST</a-select-option>
                    <a-select-option value="PUT">PUT</a-select-option>
                    <a-select-option value="DELETE">DELETE</a-select-option>
                    <a-select-option value="PATCH">PATCH</a-select-option>
                    <a-select-option value="HEAD">HEAD</a-select-option>
                  <a-select-option value="OPTIONS">OPTIONS</a-select-option>
                  <a-select-option value="CONNECT">CONNECT</a-select-option>
                  <a-select-option value="TRACE">TRACE</a-select-option>
                </a-select>
                <a style="margin-left:8px;font-size:12px;cursor:pointer;white-space:nowrap" @click="toggleAllMethods">
                  {{ allMethodsSelected ? '取消全选' : '全选' }}
                </a>
                </a-form-item>
                <a-form-item label="上游" name="upstream_id" :rules="[{ required: true, message: '请选择上游' }]">
                  <a-select v-model:value="routeForm.upstream_id" placeholder="请选择上游" allow-clear>
                    <a-select-option v-for="u in getClusterUpstreams()" :key="u.id" :value="u.id">{{ u.name }}</a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item label="优先级" name="priority" :rules="[{ required: true, message: '请输入优先级' }]">
                  <a-input-number v-model:value="routeForm.priority" :min="0" style="width: 100%" />
                </a-form-item>
                <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
                  <a-select v-model:value="routeForm.status">
                    <a-select-option :value="1">正常</a-select-option>
                    <a-select-option :value="0">禁用</a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item label="描述" name="description">
                  <a-textarea v-model:value="routeForm.description" :rows="2" />
                </a-form-item>
                <a-form-item label="高级匹配" name="advancedMatch">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <label class="toggle"><input type="checkbox" :checked="routeForm.advancedMatchEnabled" @change="routeForm.advancedMatchEnabled = !routeForm.advancedMatchEnabled" /><span class="toggle-slider"></span></label>
                    <span style="color:#999;font-size:12px;">开启后在"高级匹配"页配置请求条件</span>
                  </div>
                </a-form-item>
              </a-form>
            </a-tab-pane>

            <!-- Advanced match tab -->
            <a-tab-pane key="advanced" tab="高级匹配">
              <div v-if="routeForm.advancedMatchEnabled" class="advanced-tab">
                <RouteAdvancedMatch
                  :enabled="routeForm.advancedMatchEnabled"
                  :model-value="{ vars: routeForm.advancedMatch.vars }"
                  @update:model-value="(val: { vars?: [string, string, string][] }) => { routeForm.advancedMatch.vars = val.vars || []; }"
                />
              </div>
              <div v-else class="advanced-disabled-hint">
                <WarningOutlined style="color: #faad14; margin-right: 8px;" />
                高级匹配未启用，请在"基础配置"中开启
              </div>
            </a-tab-pane>

            <!-- Plugin management tab -->
            <a-tab-pane key="plugins" tab="插件管理">
              <PluginSelector
                v-model="routeForm.plugins"
                :plugins="availablePlugins"
                :upstreams="upstreamOptions"
              />
            </a-tab-pane>

            <!-- Plugin groups tab (permission gated) -->
            <a-tab-pane v-if="hasPluginGroupsPermission()" key="pluginGroups" tab="插件组">
              <div v-if="clusterPluginGroups.length === 0" class="pg-empty">
                暂无插件组，请在"插件组"Tab 中创建
              </div>
              <div v-else>
                <div class="pg-desc">勾选要关联到此路由的插件组，插件配置将合并到路由中</div>
                <div class="pg-list">
                  <div
                    v-for="pg in clusterPluginGroups"
                    :key="pg.id"
                    class="plugin-config-card"
                    :class="{ selected: isPluginGroupSelected(pg.edge_uuid || '') }"
                    @click="togglePluginGroup(pg)"
                  >
                    <div class="pg-item-header">
                      <a-checkbox :checked="isPluginGroupSelected(pg.edge_uuid || '')" @click.stop="togglePluginGroup(pg)" />
                      <strong class="pg-item-name">{{ pg.name }}</strong>
                      <span class="pg-item-version">v{{ pg.current_version || 0 }}</span>
                    </div>
                    <div class="pg-item-plugins">
                      <a-tag
                        v-for="(pcfg, pname) in pg.plugins"
                        :key="pname"
                        color="var(--accent)"
                        style="font-size: 11px; cursor: pointer;"
                        @click.stop="viewPluginConfigDetail(pg, pname as string, pcfg)"
                      >
                        {{ pname }}
                      </a-tag>
                    </div>
                    <div v-if="pg.description" class="pg-item-desc">{{ pg.description }}</div>
                  </div>
                </div>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="routeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleRouteSubmit">{{ copyingRoute ? '复制' : (editingRoute ? '保存' : '创建') }}</button>
        </div>
      </div>
    </div>

    <!-- Version management modal -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      @published="onVersionPublished"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, type Ref } from 'vue'
import { WarningOutlined } from '@ant-design/icons-vue'
import type { Cluster, Plugin } from '@/types'
import { useClusterRoutes } from '@/composables/useClusterRoutes'
import BadgeStatus from '@/components/BadgeStatus.vue'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PluginMetadata from '@/components/PluginMetadata.vue'
import PluginSelector from '@/components/PluginSelector.vue'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  showDeleteConfirm: (opts: {
    title: string
    apiEndpoint: string
    onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
    showResourceStats?: boolean
    stats?: Record<string, number>
    nodes?: { id: number; ip: string; management_port: number }[]
  }) => void
  loadPluginConfigs: (cluster: Cluster) => Promise<void>
  availablePlugins?: Plugin[]
  loadAvailablePlugins?: () => Promise<void>
}>()

// ── Internal refs for composable deps ───────────────────────────────
const currentClusterId = ref<number | null>(null) as Ref<number | null>
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('route')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

// ── Composable ──────────────────────────────────────────────────────
const {
  routeModalVisible,
  routeModalActiveTab,
  editingRoute,
  copyingRoute,
  routeForm,
  routeFormRef,
  allRouteColumns,
  routeColumnPopoverVisible,
  routeColumnsSelected,
  routeSearchVisible,
  routeActionsSelected,
  visibleRouteColumns,
  allActionButtons,
  availablePlugins,
  clusterPluginGroups,
  allMethodsSelected,
  toggleAllMethods,
  isPluginGroupSelected,
  togglePluginGroup,
  viewPluginConfigDetail,
  getClusterUpstreams,
  getUpstreamName,
  getActionButtonTitle,
  handleRouteAction,
  selectRoute,
  loadRoutes,
  handleRouteTableChange,
  showAddRouteModal,
  editRoute,
  copyRoute,
  handleRouteSubmit,
  deleteRoute,
  publishRoute,
  openRouteVersionManagement,
  hasPluginGroupsPermission,
} = useClusterRoutes({
  clusters: computed(() => props.clusters),
  currentClusterId,
  openPublishModal: props.openPublishModal,
  showDeleteConfirm: props.showDeleteConfirm,
  loadPluginConfigs: props.loadPluginConfigs,
  availablePlugins: props.availablePlugins as any,
  loadAvailablePlugins: props.loadAvailablePlugins as any,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
})

// ── Upstream options for traffic_split plugin dropdown ────────────
const upstreamOptions = computed(() => {
  const upstreams = getClusterUpstreams()
  return upstreams.map(u => ({ label: u.name, value: u.edge_uuid || String(u.id) }))
})

// ── Version published callback ──────────────────────────────────────
function onVersionPublished() {
  loadRoutes(props.cluster)
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

.advanced-tab {
  min-height: 100px;
}

.advanced-disabled-hint {
  padding: 40px 0;
  text-align: center;
  color: rgba(255,255,255,0.35);
}

.plugin-config-card {
  transition: all 0.2s;
}

.plugin-config-card:hover {
  border-color: var(--accent) !important;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
}

.plugin-config-card.selected {
  border-color: var(--accent) !important;
  background: oklch(56% 0.16 210 / 10%) !important;
}

/* Plugin group tab inside route modal */
.pg-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--muted);
}
.pg-desc {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--muted);
}
.pg-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.plugin-config-card {
  width: 280px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg);
}
.plugin-config-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.pg-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.pg-item-name {
  font-size: 13px;
  color: var(--fg);
}
.pg-item-version {
  font-size: 11px;
  color: var(--muted);
}
.pg-item-plugins {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.pg-item-desc {
  font-size: 11px;
  color: var(--muted);
}
</style>
