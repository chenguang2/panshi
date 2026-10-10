<template>
  <div class="cl-page">
    <PageHeader title="统一管理" description="以集群为单位，统一管理该集群下的资源，实现统一监控与运维">
      <template #actions>
        <button class="btn btn-secondary" @click="openBackupImport">从备份恢复</button>
        <button class="btn btn-primary" @click="showAddModal">+ 新建集群</button>
      </template>
    </PageHeader>

    <ClusterBackupDialog
      :visible="backupDialogVisible"
      :mode="backupDialogMode"
      :cluster="backupTargetCluster"
      @imported="onBackupImported"
      @close="onBackupDialogClose"
    />

    <div class="cl-header-actions">
      <div class="search-input-wrap">
        <input v-model="filterText" type="text" placeholder="搜索集群名称或显示名..." class="form-input" />
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="statusFilter" class="form-input" style="width: 110px; flex-shrink: 0">
        <option value="all">全部状态</option>
        <option value="enabled">已启用</option>
        <option value="disabled">已禁用</option>
      </select>
      <span class="text-sm text-muted">共 {{ filteredClusters.length }} 个集群</span>
      <button
        v-if="groupedClusters.some((g) => expandedGroups[g.name || '__ungrouped__'] === false)"
        class="btn btn-secondary btn-sm"
        @click="expandAll"
      >
        全部展开
      </button>
      <button
        v-if="groupedClusters.some((g) => expandedGroups[g.name || '__ungrouped__'] !== false)"
        class="btn btn-secondary btn-sm"
        @click="collapseAll"
      >
        全部收起
      </button>
    </div>

    <!-- Mini-bar: compact cluster bar when in maximized mode -->
    <div v-if="maximizedClusterId" class="cluster-mini-bar">
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

    <!-- 分组集群列表 + 展开区 -->
    <!-- 最大化时隐藏分组列表（v-if 提升到 template 上，避免 v-for 同元素优先级歧义） -->
    <template v-if="!maximizedClusterId">
      <div v-for="group in groupedClusters" :key="group.name || '__ungrouped'" class="cluster-group">
        <div class="group-inner">
          <div v-if="group.name" class="group-head">
            <div class="group-header" @click="toggleGroup(group.name)">
              <CaretDownOutlined v-if="expandedGroups[group.name] !== false" class="group-toggle" />
              <CaretRightOutlined v-else class="group-toggle" />
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">(共{{ group.clusters.length }}个)</span>
              <div class="cluster-names">
                <span
                  v-for="c in group.clusters"
                  :key="c.id"
                  class="cluster-name-item"
                  :title="c.display_name || c.name"
                  @click.stop="maximizeCluster(c)"
                >
                  <span class="status-dot-sm" :class="c.status === 1 ? 'green' : 'red'"></span>
                  {{ c.display_name || c.name }}
                </span>
              </div>
              <a-button size="small" class="expand-group-btn" @click.stop="toggleGroup(group.name)">
                {{ expandedGroups[group.name] !== false ? '收起' : '展开' }}
              </a-button>
            </div>
            <div v-if="expandedGroups[group.name] !== false" class="group-body">
              <TransitionGroup name="grid" tag="div" class="cluster-grid">
                <ClusterCard
                  v-for="cluster in group.clusters"
                  :key="cluster.id"
                  :cluster="cluster"
                  :route-badge="routeBadge(cluster)"
                  :stat-click="(key: string) => openStatTab(cluster, key)"
                >
                  <template #topbar>
                    <span>{{ cluster.group_name || '未分组' }}</span>
                    <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" />
                        <line
                          x1="4.5"
                          y1="1.5"
                          x2="4.5"
                          y2="12.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="9.5"
                          y1="1.5"
                          x2="9.5"
                          y2="12.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="1.5"
                          y1="4.5"
                          x2="12.5"
                          y2="4.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="1.5"
                          y1="9.5"
                          x2="12.5"
                          y2="9.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                      </svg>
                      <span>最大化</span>
                    </div>
                  </template>
                  <template #actions>
                    <button class="btn btn-secondary btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
                    <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
                    <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
                    <button
                      class="btn btn-ghost btn-sm"
                      style="color: var(--danger)"
                      @click.stop="deleteCluster(cluster)"
                    >
                      删除
                    </button>
                  </template>
                </ClusterCard>
              </TransitionGroup>
            </div>
          </div>
          <div v-else class="group-head">
            <div class="group-header" @click="toggleGroup('__ungrouped__')">
              <CaretDownOutlined v-if="expandedGroups['__ungrouped__'] !== false" class="group-toggle" />
              <CaretRightOutlined v-else class="group-toggle" />
              <span class="group-name ungrouped-label">未分组</span>
              <span class="group-count">(共{{ group.clusters.length }}个)</span>
              <div class="cluster-names">
                <span
                  v-for="c in group.clusters"
                  :key="c.id"
                  class="cluster-name-item"
                  :title="c.display_name || c.name"
                  @click.stop="maximizeCluster(c)"
                >
                  <span class="status-dot-sm" :class="c.status === 1 ? 'green' : 'red'"></span>
                  {{ c.display_name || c.name }}
                </span>
              </div>
              <a-button size="small" class="expand-group-btn" @click.stop="toggleGroup('__ungrouped__')">
                {{ expandedGroups['__ungrouped__'] !== false ? '收起' : '展开' }}
              </a-button>
            </div>
            <div v-if="expandedGroups['__ungrouped__'] !== false" class="group-body">
              <TransitionGroup name="grid" tag="div" class="cluster-grid">
                <ClusterCard
                  v-for="cluster in group.clusters"
                  :key="cluster.id"
                  :cluster="cluster"
                  :route-badge="routeBadge(cluster)"
                  :stat-click="(key: string) => openStatTab(cluster, key)"
                >
                  <template #topbar>
                    <span>{{ cluster.group_name || '未分组' }}</span>
                    <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" />
                        <line
                          x1="4.5"
                          y1="1.5"
                          x2="4.5"
                          y2="12.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="9.5"
                          y1="1.5"
                          x2="9.5"
                          y2="12.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="1.5"
                          y1="4.5"
                          x2="12.5"
                          y2="4.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                        <line
                          x1="1.5"
                          y1="9.5"
                          x2="12.5"
                          y2="9.5"
                          stroke="currentColor"
                          stroke-width="1"
                          opacity="0.3"
                        />
                      </svg>
                      <span>最大化</span>
                    </div>
                  </template>
                  <template #actions>
                    <button class="btn btn-secondary btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
                    <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
                    <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
                    <button
                      class="btn btn-ghost btn-sm"
                      style="color: var(--danger)"
                      @click.stop="deleteCluster(cluster)"
                    >
                      删除
                    </button>
                  </template>
                </ClusterCard>
              </TransitionGroup>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- EXPANDED AREA: clusters removed from grid -->
    <TransitionGroup v-if="expandedClusters.length > 0" name="expand" tag="div" class="expanded-area">
      <div
        v-for="cluster in expandedClusters"
        :key="cluster.id"
        class="card-expanded"
        :class="{ 'card-maximized': maximizedClusterId === cluster.id }"
        :data-cluster-id="cluster.id"
      >
        <!-- Header: status + group-chip + restore -->
        <div class="expanded-mini-row">
          <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
          <span v-if="cluster.group_name" class="group-chip">{{ cluster.group_name }}</span>
          <span class="flex-spacer"></span>
          <div
            v-if="maximizedClusterId !== cluster.id"
            class="maximize-btn"
            title="最大化"
            @click.stop="maximizeCluster(cluster)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" />
              <line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
              <line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
              <line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
              <line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3" />
            </svg>
            <span>最大化</span>
          </div>
          <div v-else class="maximize-btn restore" title="退出最大化" @click.stop="restoreMaximize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3" />
              <line x1="3" y="1.5" x2="3" y2="12.5" stroke="currentColor" stroke-width="1.2" />
              <line x1="7" y="1.5" x2="7" y2="12.5" stroke="currentColor" stroke-width="1.2" />
              <line x1="11" y="1.5" x2="11" y2="12.5" stroke="currentColor" stroke-width="1.2" />
              <line x1="1.5" y="3" x2="12.5" y2="3" stroke="currentColor" stroke-width="1.2" />
              <line x1="1.5" y="7" x2="12.5" y2="7" stroke="currentColor" stroke-width="1.2" />
              <line x1="1.5" y="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.2" />
            </svg>
            <span>还原</span>
          </div>
        </div>
        <!-- Name + actions row -->
        <div class="expanded-name-row">
          <span class="cname">{{ cluster.display_name || cluster.name }}</span>
          <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
          <div class="cl-card-actions">
            <button class="btn btn-secondary btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
            <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
            <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
            <button class="btn btn-ghost btn-sm" @click.stop="exportCluster(cluster)">导出 Excel</button>
            <button class="btn btn-ghost btn-sm" @click.stop="openBackupDownload(cluster)">备份下载</button>
            <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click.stop="deleteCluster(cluster)">
              删除
            </button>
          </div>
        </div>
        <div class="card-detail">
          <div class="dtabs">
            <span class="dt" :class="{ active: cluster.activeTab === 'nodes' }" @click="switchTab(cluster, 'nodes')"
              >集群节点 <span class="db">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span
            >
            <span
              class="dt"
              :class="{ active: cluster.activeTab === 'upstreams' }"
              @click="switchTab(cluster, 'upstreams')"
              >上游 <span class="db">{{ cluster.upstream_count }}</span></span
            >
            <span class="dt" :class="{ active: cluster.activeTab === 'routes' }" @click="switchTab(cluster, 'routes')"
              >路由 <span class="db">{{ cluster.route_count }}</span></span
            >
            <span
              v-if="authStore.hasPermission('plugin_groups')"
              class="dt"
              :class="{ active: cluster.activeTab === 'pluginConfigs' }"
              @click="switchTab(cluster, 'pluginConfigs')"
              >插件组 <span class="db">{{ cluster.plugin_config_count }}</span></span
            >
            <span
              v-if="authStore.hasPermission('plugin_metadata')"
              class="dt"
              :class="{ active: cluster.activeTab === 'globalPlugins' }"
              @click="switchTab(cluster, 'globalPlugins')"
              >插件元数据</span
            >
            <span
              v-if="authStore.hasPermission('global_rules')"
              class="dt"
              :class="{ active: cluster.activeTab === 'globalRules' }"
              @click="switchTab(cluster, 'globalRules')"
              >全局规则 <span class="db">{{ cluster.global_rule_count }}</span></span
            >
            <span
              class="dt"
              :class="{ active: cluster.activeTab === 'staticResources' }"
              @click="switchTab(cluster, 'staticResources')"
              >静态资源 <span class="db">{{ cluster.static_resource_count }}</span></span
            >
          </div>
          <div class="dbody">
            <ClusterUpstreams
              v-if="cluster.activeTab === 'upstreams'"
              :cluster="cluster"
              :clusters="clusters"
              :open-publish-modal="openPublishModal"
              @refresh="loadClusters"
            />
            <ClusterRoutes
              v-else-if="cluster.activeTab === 'routes'"
              :cluster="cluster"
              :clusters="clusters"
              :open-publish-modal="openPublishModal"
              :show-delete-confirm="showDeleteConfirm"
              :load-plugin-configs="loadPluginConfigs"
              @refresh="loadClusters"
            />
            <ClusterPluginConfigs
              v-else-if="cluster.activeTab === 'pluginConfigs'"
              :cluster="cluster"
              :clusters="clusters"
              :open-publish-modal="openPublishModal"
              :available-plugins="availablePlugins"
              :load-available-plugins="loadAvailablePlugins"
              :loading="loading"
              @refresh="loadClusters"
            />
            <ClusterGlobalRules
              v-else-if="cluster.activeTab === 'globalRules'"
              :cluster="cluster"
              :clusters="clusters"
              :open-publish-modal="openPublishModal"
              :available-plugins="availablePlugins"
              :load-available-plugins="loadAvailablePlugins"
              :loading="loading"
              @refresh="loadClusters"
            />
            <ClusterStaticResources
              v-else-if="cluster.activeTab === 'staticResources'"
              :cluster="cluster"
              :clusters="clusters"
              :open-publish-modal="openPublishModal"
              :load-routes="loadRoutes"
              :loading="loading"
              @refresh="loadClusters"
            />
            <div v-else-if="cluster.activeTab === 'globalPlugins'" class="tab-content">
              <PluginMetadata :cluster-id="cluster.id" :nodes="cluster.nodes" />
            </div>
            <ClusterNodes v-else :cluster="cluster" @refresh="loadClusters" />
          </div>
        </div>
      </div>
    </TransitionGroup>

    <div v-if="filteredClusters.length === 0 && !loading" class="empty-state">
      <!-- 空状态两分支（cluster-ux-close-loop B6.4）：从未创建 vs 筛选无结果 -->
      <a-empty :description="hasActiveFilters ? '没有符合筛选条件的集群' : '还没有集群'" />
      <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearFilters">清除筛选</button>
      <button v-else class="btn btn-primary" @click="showAddModal">新建集群</button>
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
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />

    <!-- Cluster Detail Modal -->
    <!-- 集群详情弹窗：共享组件唯一实现（cluster-ux-close-loop 3.6） -->
    <ClusterDetailModal :cluster="detailCluster" :visible="detailVisible" @close="detailVisible = false" />

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
              将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）：
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
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons-vue'
import {
  showDeleteConfirm,
  executeDeleteWithProgress,
  routeLabel,
  deleteClusterWithConfirm,
} from '@/composables/useClusterUtils'
import { downloadBlob } from '@/utils/download'
import api from '@/api'
import ClusterDetailModal from '@/components/ClusterDetailModal.vue'
import { useClusterRouteBadge } from '@/composables/useClusterRouteBadge'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
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
import ConfigDiff from '@/views/ConfigDiff.vue'
import { useClusterNodes, allNodeColumns, allNodeActionButtons } from '@/composables/useClusterNodes'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'
import { useClusterRoutes } from '@/composables/useClusterRoutes'
import { useClusterPluginConfigs } from '@/composables/useClusterPluginConfigs'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import ClusterNodes from '@/views/clusters/ClusterNodes.vue'
import ClusterUpstreams from '@/views/clusters/ClusterUpstreams.vue'
import ClusterRoutes from '@/views/clusters/ClusterRoutes.vue'
import ClusterPluginConfigs from '@/views/clusters/ClusterPluginConfigs.vue'
import ClusterGlobalRules from '@/views/clusters/ClusterGlobalRules.vue'
import ClusterStaticResources from '@/views/clusters/ClusterStaticResources.vue'

const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const filterText = ref('')
const statusFilter = ref<string>('all')

/** 筛选是否有生效条件（空状态两分支判定，cluster-ux-close-loop B6.4） */
const hasActiveFilters = computed(() => filterText.value.trim() !== '' || statusFilter.value !== 'all')

function clearFilters() {
  filterText.value = ''
  statusFilter.value = 'all'
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
let publishModalResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(
  title: string,
  clusterId: number,
  opts?: { currentVersion?: number | null },
): Promise<number[]> {
  publishModalTitle.value = title
  publishModalClusterId.value = clusterId
  publishModalCurrentVersion.value = opts?.currentVersion ?? null
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

const expandedIds = ref<Set<number>>(new Set())
const expandedOrder = ref<number[]>([])
const maximizedClusterId = ref<number | null>(null)

function maximizeCluster(cluster: Cluster) {
  // Collapse all groups to save space
  for (const g of groupedClusters.value) {
    expandedGroups[g.name || '__ungrouped__'] = false
  }
  // Collapse all other expanded clusters
  const s = new Set<number>()
  s.add(cluster.id)
  expandedIds.value = s
  expandedOrder.value = [cluster.id]
  cluster.activeTab = cluster.activeTab || 'nodes'
  maximizedClusterId.value = cluster.id
}

function restoreMaximize() {
  const clusterId = maximizedClusterId.value
  if (clusterId) {
    const s = new Set(expandedIds.value)
    s.delete(clusterId)
    expandedIds.value = s
    expandedOrder.value = expandedOrder.value.filter((id) => id !== clusterId)
  }
  maximizedClusterId.value = null
}

function switchMaximizedCluster(clusterId: number) {
  const cluster = clusters.value.find((c) => c.id === clusterId)
  if (!cluster) return
  maximizeCluster(cluster)
}

function toggleExpand(clusterId: number) {
  const s = new Set(expandedIds.value)
  const order = [...expandedOrder.value]
  if (s.has(clusterId)) {
    s.delete(clusterId)
    const idx = order.indexOf(clusterId)
    if (idx > -1) order.splice(idx, 1)
    if (maximizedClusterId.value === clusterId) {
      maximizedClusterId.value = null
    }
  } else {
    s.add(clusterId)
    order.push(clusterId)
    setTimeout(() => {
      const el = document.querySelector(`.card-expanded[data-cluster-id="${clusterId}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
  expandedIds.value = s
  expandedOrder.value = order
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

function expandAndSwitchTab(cluster: Cluster, tab: string) {
  cluster.activeTab = tab
  const s = new Set(expandedIds.value)
  const order = [...expandedOrder.value]
  const isNew = !s.has(cluster.id)
  if (isNew) {
    s.add(cluster.id)
    order.push(cluster.id)
  }
  expandedIds.value = s
  expandedOrder.value = order
  handleTabClick(cluster, tab)
  if (isNew) {
    setTimeout(() => {
      const el = document.querySelector(`.card-expanded[data-cluster-id="${cluster.id}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
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
    if (statusFilter.value === 'enabled') return c.status === 1
    if (statusFilter.value === 'disabled') return c.status !== 1
    return true
  })
})

const gridClusters = computed(() => {
  return filteredClusters.value.filter((c: Cluster) => !expandedIds.value.has(c.id))
})

const expandedClusters = computed(() => {
  const byId: Record<number, Cluster> = {}
  for (const c of filteredClusters.value) {
    if (expandedIds.value.has(c.id)) byId[c.id] = c
  }
  return expandedOrder.value.map((id) => byId[id]).filter(Boolean)
})

// ── Group collapse state ──
const expandedGroups = reactive<Record<string, boolean>>({})

function toggleGroup(name: string) {
  expandedGroups[name] = expandedGroups[name] === false ? true : false
}

function expandAll() {
  for (const g of groupedClusters.value) {
    expandedGroups[g.name || '__ungrouped__'] = true
  }
}

function collapseAll() {
  for (const g of groupedClusters.value) {
    expandedGroups[g.name || '__ungrouped__'] = false
  }
}

const groupedClusters = computed(() => {
  const groups: { name: string; clusters: Cluster[] }[] = []
  const map = new Map<string, Cluster[]>()
  for (const c of filteredClusters.value) {
    if (expandedIds.value.has(c.id)) continue // 展开的单独显示
    const key = c.group_name || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  // 未分组在前，有分组名在后（默认色在上，彩色在下）
  if (map.has('')) groups.push({ name: '', clusters: map.get('')! })
  const named = Array.from(map.entries())
    .filter(([k]) => k)
    .sort(([a], [b]) => a.localeCompare(b))
  for (const [name, cls] of named) groups.push({ name, clusters: cls })
  return groups
})

let draggedClusterId: number | null = null

function onDragStart(event: DragEvent, clusterId: number) {
  draggedClusterId = clusterId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(clusterId))
  }
  const el = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (el) setTimeout(() => el.classList.add('dragging'), 0)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const target = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (!target || !draggedClusterId) return
  const targetId = Number(target.dataset.clusterId)
  if (targetId === draggedClusterId) return
  document.querySelectorAll('.card-expanded.drag-over').forEach((el) => el.classList.remove('drag-over'))
  target.classList.add('drag-over')
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach((el) => {
    el.classList.remove('drag-over', 'dragging')
  })
  if (!draggedClusterId) return
  const target = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (!target) return
  const targetId = Number(target.dataset.clusterId)
  if (targetId === draggedClusterId) return

  const order = [...expandedOrder.value]
  const fromIdx = order.indexOf(draggedClusterId)
  const toIdx = order.indexOf(targetId)
  if (fromIdx === -1 || toIdx === -1) return
  order.splice(fromIdx, 1)
  order.splice(toIdx, 0, draggedClusterId)
  expandedOrder.value = order
}

function onDragEnd(_event: DragEvent) {
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach((el) => {
    el.classList.remove('drag-over', 'dragging')
  })
  draggedClusterId = null
}

const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })
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

const loadClusters = async () => {
  loading.value = true
  try {
    const endpoint = isAdmin() ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: pagination.current, page_size: pagination.pageSize } })
    clusters.value = res.data.items.map((c: Cluster) => ({
      ...c,
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
    }))
    pagination.total = res.data.total
    for (const cluster of clusters.value) {
      loadNodes(cluster)
      loadUpstreams(cluster)
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
    const res = await api.get(`/clusters/${cluster.id}/nodes`, { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
    testNodes.value = (res.data.items || []).map((n: any) => ({
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
  } catch (e: any) {
    for (let i = 0; i < testLogs.value.length; i++) {
      if (testLogs.value[i].status === 'pending') {
        const n = testNodes.value[i]
        testLogs.value[i] = {
          status: 'error',
          msg: `${n.ip}:${n.management_port} 测试异常 — ${e.response?.data?.detail || e.message}`,
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
    const res = await api.get(`/clusters/${cluster.id}/export`, {
      responseType: 'blob',
    })
    const filename = `${cluster.name}_配置导出.xlsx`
    downloadBlob(res.data as Blob, filename)
  } catch (e: any) {
    message.error(e.response?.data?.detail || e.message || '导出失败')
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

.cl-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.cl-header-actions .search-input-wrap {
  width: 200px;
  flex-shrink: 0;
}
.cl-header-actions :deep(.form-input) {
  width: 100%;
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

.cluster-group {
  margin-bottom: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  border-radius: 6px;
  background: oklch(94.5% 0.008 240);
  transition: background 0.15s;
  user-select: none;
}
.group-header:hover {
  background: var(--accent-bg);
}
.group-toggle {
  font-size: 11px;
  color: var(--accent);
  opacity: 0.6;
  flex-shrink: 0;
}
.group-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--fg);
  flex-shrink: 0;
}
.group-count {
  font-size: 12px;
  color: var(--muted);
  margin-right: 8px;
  flex-shrink: 0;
}
.ungrouped-label {
  opacity: 0.7;
  font-weight: 500;
}
.cluster-names {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  padding: 0 4px;
}
.cluster-name-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.cluster-name-item:hover {
  background: var(--accent-bg);
  color: var(--accent);
}
.status-dot-sm {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot-sm.green {
  background: var(--success);
}
.status-dot-sm.red {
  background: var(--danger);
}
.expand-group-btn {
  flex-shrink: 0;
}
.group-chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--accent-bg);
  color: var(--accent);
  margin-right: 4px;
  flex-shrink: 0;
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

.group-body {
  position: relative;
}

.cluster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
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

.expanded-area {
  margin-top: 20px;
  position: relative;
  z-index: 1;
  border-top: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
  padding-top: 16px;
}

.card-expanded {
  background: var(--surface);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top: 3px solid var(--accent);
  border-radius: var(--radius-lg);
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}
.card-expanded.dragging {
  opacity: 0.35;
}
.card-expanded.drag-over {
  border-color: var(--warning) !important;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--warning) 25%, transparent) !important;
}

.flex-spacer {
  flex: 1;
}
.expanded-mini-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--accent-bg);
  border-bottom: 1px solid var(--border);
}
.expanded-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}
.expanded-name-row .cname {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}
.expanded-name-row .chint {
  font-size: 12px;
  color: var(--muted);
}
.expanded-name-row .cl-card-actions {
  margin-left: auto;
  margin-top: 0;
  padding: 0;
  border-top: none;
}

.card-detail {
  border-top: 1px solid var(--border);
  position: relative;
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

/* transitions */
.grid-leave-active {
  position: absolute !important;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.2s ease-in;
  width: calc(100% / 3 - 8px);
  z-index: 1;
}
.grid-move {
  transition: all 0.3s ease;
}
.grid-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.grid-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
.expand-enter-active {
  animation: expandWaterfall 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes expandWaterfall {
  0% {
    opacity: 0;
    max-height: 0;
    margin-bottom: 0;
    overflow: hidden;
    transform: translateY(-250px);
  }
  25% {
    opacity: 1;
  }
  85% {
    max-height: 500px;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    max-height: 500px;
    margin-bottom: 12px;
    transform: translateY(0);
  }
}
.expand-leave-active {
  animation: expandFlyUp 0.3s ease-in forwards;
  overflow: hidden;
}
@keyframes expandFlyUp {
  0% {
    opacity: 1;
    max-height: 500px;
    margin-bottom: 12px;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    max-height: 0;
    margin-bottom: 0;
    padding-top: 0;
    padding-bottom: 0;
    transform: translateY(-120px);
  }
}

:deep(.node-table) .ant-table {
  background: transparent !important;
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
.maximize-btn {
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
  margin-left: 4px;
}
.maximize-btn:hover {
  background: var(--bg);
  border-color: var(--accent);
  color: var(--accent);
}
.maximize-btn.restore {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Card maximized ── */
.card-maximized {
  border-color: var(--accent) !important;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--accent) 20%, transparent) !important;
}
.card-maximized .dbody {
  min-height: 300px;
}
.card-maximized .dtabs {
  overflow-x: visible;
}
.card-maximized .expanded-mini-row {
  cursor: default;
}

/* ── Expanded area in maximized mode ── */
.cluster-list:has(.cluster-mini-bar) .expanded-area {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}

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
  .cl-header-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .cl-header-actions .search-input-wrap {
    width: 100%;
  }
}
</style>

<style></style>
