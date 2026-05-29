<template>
  <div class="cluster-list">
    <div class="header-section">
      <div class="header-left">
        <h2>集群管理</h2>
        <div class="filter-bar">
          <a-input-search
            v-model:value="filterText"
            placeholder="搜索集群名称或显示名"
            style="width: 280px;"
            allow-clear
          />
          <a-radio-group v-model:value="statusFilter" size="small" option-type="button" button-style="solid">
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="healthy">健康</a-radio-button>
            <a-radio-button value="offline">离线</a-radio-button>
          </a-radio-group>
          <span class="filter-count">共 {{ filteredClusters.length }} 个集群</span>
          <a-button size="small" @click="expandAll" v-if="groupedClusters.some(g => expandedGroups[g.name || '__ungrouped__'] === false)">全部展开</a-button>
          <a-button size="small" @click="collapseAll" v-if="groupedClusters.some(g => expandedGroups[g.name || '__ungrouped__'] !== false)">全部收起</a-button>
        </div>
      </div>
      <a-button type="primary" @click="showAddModal">添加集群</a-button>
    </div>

    <!-- Mini-bar: compact cluster bar when in maximized mode -->
    <div v-if="maximizedClusterId" class="cluster-mini-bar">
      <div class="mini-scroll">
        <div v-for="c in filteredClusters" :key="c.id"
             class="mini-item" :class="{ active: maximizedClusterId === c.id }"
             @click="switchMaximizedCluster(c.id)">
          <span class="status-dot" :class="c.status === 1 ? 'green' : 'red'"></span>
          <span class="mini-name">{{ c.display_name || c.name }}</span>
          <span v-if="c.display_name" class="mini-hint">{{ c.name }}</span>
        </div>
      </div>
      <button class="restore-btn" @click="restoreMaximize">退出最大化</button>
    </div>

    <!-- 分组集群列表 + 展开区 -->
    <div v-if="!maximizedClusterId" v-for="group in groupedClusters" :key="group.name || '__ungrouped'" class="cluster-group">
      <div class="group-inner">
        <div v-if="group.name" class="group-head">
          <div class="group-header" @click="toggleGroup(group.name)">
            <CaretDownOutlined v-if="expandedGroups[group.name] !== false" class="group-toggle" />
            <CaretRightOutlined v-else class="group-toggle" />
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">({{ group.clusters.length }})</span>
            <div class="cluster-names">
              <span v-for="c in group.clusters" :key="c.id"
                    class="cluster-name-item" :title="c.display_name || c.name"
                    @click.stop="maximizeCluster(c)">
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
              <div v-for="cluster in group.clusters" :key="cluster.id" class="cluster-card">
                <div class="expand-row" @click="toggleExpand(cluster.id)" title="点击展开集群详情">
                  <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
                  <div class="cname-wrap">
                    <span class="cname">{{ cluster.display_name || cluster.name }}</span>
                    <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
                  </div>
                  <div class="click-zone">
                    <span class="arrow">⬇</span>
                    <span class="label">展开</span>
                  </div>
                  <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
                  </div>
                </div>
                <div class="card-header">
                  <div class="stats-bar">
                    <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
                    <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
                    <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
                    <div class="scell"><div class="snum">{{ cluster.plugin_config_count }}</div><div class="slbl">插件组</div></div>
                    <div class="scell"><div class="snum">{{ cluster.global_rule_count }}</div><div class="slbl">全局规则</div></div>
                    <div class="scell"><div class="snum">{{ cluster.static_resource_count }}</div><div class="slbl">静态资源</div></div>
                  </div>
                  <div class="cactions">
                    <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
                    <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
                  </div>
                </div>
                <div class="chips-row">
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'nodes')">集群节点 <span class="cb">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'upstreams')">上游 <span class="cb">{{ cluster.upstream_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'routes')">路由 <span class="cb">{{ cluster.route_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalPlugins')">插件元数据</span>
                  <span v-if="authStore.hasPermission('plugin_groups')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'pluginConfigs')">插件组 <span class="cb">{{ cluster.plugin_config_count }}</span></span>
                  <span v-if="authStore.hasPermission('global_rules')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalRules')">全局规则 <span class="cb">{{ cluster.global_rule_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'staticResources')">静态资源 <span class="cb">{{ cluster.static_resource_count }}</span></span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
        <div v-else class="group-head">
          <div class="group-header" @click="toggleGroup('__ungrouped__')">
            <CaretDownOutlined v-if="expandedGroups['__ungrouped__'] !== false" class="group-toggle" />
            <CaretRightOutlined v-else class="group-toggle" />
            <span class="group-name ungrouped-label">未分组</span>
            <span class="group-count">({{ group.clusters.length }})</span>
            <div class="cluster-names">
              <span v-for="c in group.clusters" :key="c.id"
                    class="cluster-name-item" :title="c.display_name || c.name"
                    @click.stop="maximizeCluster(c)">
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
              <div v-for="cluster in group.clusters" :key="cluster.id" class="cluster-card">
                <div class="expand-row" @click="toggleExpand(cluster.id)" title="点击展开集群详情">
                  <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
                  <div class="cname-wrap">
                    <span class="cname">{{ cluster.display_name || cluster.name }}</span>
                    <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
                  </div>
                  <div class="click-zone">
                    <span class="arrow">⬇</span>
                    <span class="label">展开</span>
                  </div>
                  <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
                  </div>
                </div>
                <div class="card-header">
                  <div class="stats-bar">
                    <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
                    <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
                    <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
                    <div class="scell"><div class="snum">{{ cluster.plugin_config_count }}</div><div class="slbl">插件组</div></div>
                    <div class="scell"><div class="snum">{{ cluster.global_rule_count }}</div><div class="slbl">全局规则</div></div>
                    <div class="scell"><div class="snum">{{ cluster.static_resource_count }}</div><div class="slbl">静态资源</div></div>
                  </div>
                  <div class="cactions">
                    <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
                    <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
                  </div>
                </div>
                <div class="chips-row">
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'nodes')">集群节点 <span class="cb">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'upstreams')">上游 <span class="cb">{{ cluster.upstream_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'routes')">路由 <span class="cb">{{ cluster.route_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalPlugins')">插件元数据</span>
                  <span v-if="authStore.hasPermission('plugin_groups')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'pluginConfigs')">插件组 <span class="cb">{{ cluster.plugin_config_count }}</span></span>
                  <span v-if="authStore.hasPermission('global_rules')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalRules')">全局规则 <span class="cb">{{ cluster.global_rule_count }}</span></span>
                  <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'staticResources')">静态资源 <span class="cb">{{ cluster.static_resource_count }}</span></span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>

    <!-- EXPANDED AREA: clusters removed from grid -->
    <TransitionGroup v-if="expandedClusters.length > 0" name="expand" tag="div" class="expanded-area">
      <div v-for="cluster in expandedClusters" :key="cluster.id"
           class="card-expanded" :class="{ 'card-maximized': maximizedClusterId === cluster.id }" :data-cluster-id="cluster.id">
        <!-- Clickable row: name + drag handle + click-zone -->
        <div class="expand-row" draggable="true"
             @click="toggleExpand(cluster.id)"
             title="点击收回 · 拖拽排序"
             @dragstart="onDragStart($event, cluster.id)"
             @dragover="onDragOver($event)"
             @drop="onDrop($event)"
             @dragend="onDragEnd($event)">
          <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
          <div class="cname-wrap">
            <span class="cname">{{ cluster.display_name || cluster.name }}</span>
            <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
          </div>
          <span v-if="cluster.group_name" class="group-chip">{{ cluster.group_name }}</span>
          <div class="click-zone on">
            <span class="arrow">⬆</span>
            <span class="label">收回</span>
          </div>
          <div v-if="maximizedClusterId !== cluster.id" class="maximize-btn" title="最大化" @click.stop="maximizeCluster(cluster)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
            <span>最大化</span>
          </div>
          <div v-else class="maximize-btn restore" title="退出最大化" @click.stop="restoreMaximize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="1.5" x2="3" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="1.5" x2="7" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="11" y1="1.5" x2="11" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y1="3" x2="12.5" y2="3" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y1="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.2"/></svg>
            <span>还原</span>
          </div>
        </div>
        <!-- Stats + actions row -->
        <div class="card-header">
          <div class="stats-bar">
            <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
            <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
            <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
            <div class="scell"><div class="snum">{{ cluster.plugin_config_count }}</div><div class="slbl">插件组</div></div>
            <div class="scell"><div class="snum">{{ cluster.global_rule_count }}</div><div class="slbl">全局规则</div></div>
            <div class="scell"><div class="snum">{{ cluster.static_resource_count }}</div><div class="slbl">静态资源</div></div>
          </div>
          <div class="cactions">
            <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
            <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
          </div>
        </div>
        <div class="card-detail">
          <div class="dtabs">
            <span class="dt" :class="{ active: cluster.activeTab === 'nodes' }" @click="cluster.activeTab = 'nodes'; handleTabClick(cluster, 'nodes')">集群节点 <span class="db">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'upstreams' }" @click="cluster.activeTab = 'upstreams'; handleTabClick(cluster, 'upstreams')">上游 <span class="db">{{ cluster.upstream_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'routes' }" @click="cluster.activeTab = 'routes'; handleTabClick(cluster, 'routes')">路由 <span class="db">{{ cluster.route_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'globalPlugins' }" @click="cluster.activeTab = 'globalPlugins'; handleTabClick(cluster, 'globalPlugins')">插件元数据</span>
            <span v-if="authStore.hasPermission('plugin_groups')" class="dt" :class="{ active: cluster.activeTab === 'pluginConfigs' }" @click="cluster.activeTab = 'pluginConfigs'; handleTabClick(cluster, 'pluginConfigs')">插件组 <span class="db">{{ cluster.plugin_config_count }}</span></span>
            <span v-if="authStore.hasPermission('global_rules')" class="dt" :class="{ active: cluster.activeTab === 'globalRules' }" @click="cluster.activeTab = 'globalRules'; handleTabClick(cluster, 'globalRules')">全局规则 <span class="db">{{ cluster.global_rule_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'staticResources' }" @click="cluster.activeTab = 'staticResources'; handleTabClick(cluster, 'staticResources')">静态资源 <span class="db">{{ cluster.static_resource_count }}</span></span>
          </div>
          <div class="dbody">
          <ClusterUpstreams v-if="cluster.activeTab === 'upstreams'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" @refresh="loadClusters" />
           <ClusterRoutes v-else-if="cluster.activeTab === 'routes'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :show-delete-confirm="showDeleteConfirm" :load-plugin-configs="loadPluginConfigs" @refresh="loadClusters" />
          <ClusterPluginConfigs v-else-if="cluster.activeTab === 'pluginConfigs'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :available-plugins="availablePlugins" :load-available-plugins="loadAvailablePlugins" @refresh="loadClusters" />
          <ClusterGlobalRules v-else-if="cluster.activeTab === 'globalRules'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :available-plugins="availablePlugins" :load-available-plugins="loadAvailablePlugins" @refresh="loadClusters" />
          <ClusterStaticResources v-else-if="cluster.activeTab === 'staticResources'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :load-routes="loadRoutes" @refresh="loadClusters" />
          <div v-else-if="cluster.activeTab === 'globalPlugins'" class="tab-content">
            <PluginMetadata :cluster-id="cluster.id" :nodes="cluster.nodes" />
          </div>
          <ClusterNodes v-else :cluster="cluster" @refresh="loadClusters" />
          </div>
        </div>
      </div>
    </TransitionGroup>

    <div v-if="filteredClusters.length === 0 && !loading" class="empty-state">
      <a-empty description="暂无集群" />
    </div>

    <a-modal v-model:open="modalVisible" :title="editingCluster ? '编辑集群' : '添加集群'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name" :validate-status="nameError ? 'error' : ''" :help="nameError || '小写字母、数字、中划线组成，中划线不能在首尾'">
          <a-input v-model:value="form.name" @blur="validateName" />
        </a-form-item>
        <a-form-item label="显示名称" name="display_name">
          <a-input v-model:value="form.display_name" />
        </a-form-item>
        <a-form-item label="分组" name="group_name">
          <a-select v-model:value="form.group_name">
            <template #dropdownRender="{ menuNode }">
              <div>
                <component :is="menuNode" />
                <a-divider style="margin: 4px 0" />
                <div style="padding: 4px 8px; display: flex; gap: 4px;">
                  <a-input v-model:value="newGroupName" placeholder="新建分组名称" size="small" @pressEnter="addNewGroup" />
                  <a-button size="small" type="primary" @click="addNewGroup">添加</a-button>
                </div>
              </div>
            </template>
            <a-select-option value="">未分类</a-select-option>
            <a-select-option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
        <a-form-item label="状态" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Admin Key" name="admin_key">
          <a-input-password v-model:value="form.admin_key" placeholder="Edge 节点 Admin API 密钥" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="nodeModalVisible" :title="editingNode ? '编辑节点' : '添加节点'" width="500px" @ok="handleNodeSubmit">
      <a-form ref="nodeFormRef" :model="nodeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="IP" name="ip" :rules="[{ required: true, validator: validateIP, trigger: 'blur' }]">
          <a-input v-model:value="nodeForm.ip" placeholder="请输入IP地址" />
        </a-form-item>
        <a-form-item label="服务端口" name="service_port" :rules="[{ required: true, type: 'number', message: '请输入服务端口' }]">
          <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="管理端口" name="management_port" :rules="[{ required: true, type: 'number', message: '请输入管理端口' }]">
          <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Edge路径" name="edge_path" :rules="[{ required: true, message: '请输入Edge路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { max: 255, message: '最多255个字符' }]">
          <a-input v-model:value="nodeForm.edge_path" placeholder="请输入Edge路径，如 /edge/node1" />
        </a-form-item>
        <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
          <a-select v-model:value="nodeForm.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      :title="publishModalTitle"
      :cluster-id="publishModalClusterId"
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick, h } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { showDeleteConfirm, buildDeleteProgressContent, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import api from '@/api'
import type { Cluster, Upstream, Plugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PluginMetadata from '@/components/PluginMetadata.vue'
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

// PublishConfirmModal state
const publishModalVisible = ref(false)
const publishModalTitle = ref('')
const publishModalClusterId = ref(0)
let publishModalResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(title: string, clusterId: number): Promise<number[]> {
  publishModalTitle.value = title
  publishModalClusterId.value = clusterId
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
    if (g.name) expandedGroups[g.name] = false
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
  maximizedClusterId.value = null
}

function switchMaximizedCluster(clusterId: number) {
  const cluster = clusters.value.find(c => c.id === clusterId)
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
    nextTick(() => {
      const el = document.querySelector(`.card-expanded[data-cluster-id="${clusterId}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  expandedIds.value = s
  expandedOrder.value = order
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
  if (!s.has(cluster.id)) {
    s.add(cluster.id)
    order.push(cluster.id)
  }
  expandedIds.value = s
  expandedOrder.value = order
  handleTabClick(cluster, tab)
}

const filteredClusters = computed(() => {
  return clusters.value.filter((c: Cluster) => {
    const text = filterText.value.trim().toLowerCase()
    if (text) {
      const matchName = (c.display_name || c.name).toLowerCase().includes(text)
      const matchKey = c.name.toLowerCase().includes(text)
      if (!matchName && !matchKey) return false
    }
    if (statusFilter.value === 'healthy') return c.status === 1
    if (statusFilter.value === 'offline') return c.status !== 1
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
  return expandedOrder.value.map(id => byId[id]).filter(Boolean)
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
  // 有分组名在前，未分组在后
  const named = Array.from(map.entries()).filter(([k]) => k).sort(([a],[b]) => a.localeCompare(b))
  for (const [name, cls] of named) groups.push({ name, clusters: cls })
  if (map.has('')) groups.push({ name: '', clusters: map.get('')! })
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
  document.querySelectorAll('.card-expanded.drag-over').forEach(el => el.classList.remove('drag-over'))
  target.classList.add('drag-over')
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach(el => {
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
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach(el => {
    el.classList.remove('drag-over', 'dragging')
  })
  draggedClusterId = null
}

const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })
const nameError = ref('')
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const isAdmin = () => authStore.user?.role === 'admin'
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const validateName = () => {
  if (!form.name) {
    nameError.value = '请输入集群名称'
    return false
  }
  if (!NAME_PATTERN.test(form.name)) {
    nameError.value = '集群名称只能包含小写字母、数字和中划线，中划线不能在首尾'
    return false
  }
  nameError.value = ''
  return true
}

const form = reactive({
  name: '',
  display_name: '',
  group_name: '',
  description: '',
  status: 1,
  admin_key: '',
})

const newGroupName = ref('')
const pendingNewGroup = ref('')

const groupOptions = computed(() => {
  const groups = new Set<string>()
  for (const c of clusters.value) {
    if (c.group_name) groups.add(c.group_name)
  }
  if (pendingNewGroup.value) groups.add(pendingNewGroup.value)
  return Array.from(groups).sort()
})

const addNewGroup = () => {
  const name = newGroupName.value.trim()
  if (!name) return
  pendingNewGroup.value = name
  form.group_name = name
  newGroupName.value = ''
}

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
const onRefresh = () => { loadClustersFn?.() }

// ── Composables ──
const {
  nodeModalVisible, editingNode, nodeFormRef, nodeForm,
  diffDrawerVisible, diffClusterId, diffNodeId,
  nodeColumnPopoverVisible, nodeColumnsSelected, nodeSearchVisible,
  nodeActionsSelected, moreNodeActions, visibleNodeColumns,
  validateIP, getNodeActionButtonTitle, handleNodeAction,
  handleNodeTableChange, loadNodes, selectNode,
  showAddNodeModal, editNode, handleNodeSubmit, deleteNode,
  startNode, stopNode, queryNodeStatus,
} = useClusterNodes({
  clusters,
  onRefresh,
})

const {
  loadUpstreams,
} = useClusterUpstreams({
  clusters,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal,
})

const {
  loadPluginConfigs,
} = useClusterPluginConfigs({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

// Shared currentClusterId for route composable + inline helpers
const currentClusterId = ref<number | null>(null)

// showDeleteConfirm placeholder — defined after resourceLabels, patched later
let _showDeleteConfirmRoute: ((opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
}) => void) = () => {}

const {
  loadRoutes,
} = useClusterRoutes({
  clusters: clusters as any,
  currentClusterId: currentClusterId as any,
  openPublishModal: openPublishModal as any,
  showDeleteConfirm: _showDeleteConfirmRoute as any,
  loadPluginConfigs: loadPluginConfigs as any,
  versionModalVisible: versionModalVisible as any,
  versionModalType: versionModalType as any,
  versionModalResourceId: versionModalResourceId as any,
  versionModalClusterId: versionModalClusterId as any,
  versionModalResourceName: versionModalResourceName as any,
  versionModalEdgeUuid: versionModalEdgeUuid as any,
})

const {
  loadGlobalRules,
} = useClusterGlobalRules({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

const {
  loadStaticResources,
} = useClusterStaticResources({
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
      selectedUpstream: null,
      selectedRoute: null,
      plugin_configs: [],
      selectedPluginConfig: null,
      global_rules: [],
      selectedGlobalRule: null
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
  Object.assign(form, {
    name: '',
    display_name: '',
    group_name: '',
    description: '',
    status: 1,
    admin_key: '',
  })
  nameError.value = ''
  modalVisible.value = true
}

const editCluster = (cluster: Cluster) => {
  editingCluster.value = cluster
  form.name = cluster.name
  form.display_name = cluster.display_name || ''
  form.group_name = cluster.group_name || ''
  form.description = cluster.description || ''
  form.status = cluster.status
  form.admin_key = (cluster as any).admin_key || ''
  nameError.value = ''
  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!validateName()) return
  try {
    if (editingCluster.value) {
      await api.put(`/clusters/${editingCluster.value.id}`, form)
      message.success('集群已更新')
    } else {
      await api.post('/clusters', form)
      message.success('集群已创建')
    }
    modalVisible.value = false
    loadClusters()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}


const deleteCluster = async (cluster: Cluster) => {
  const clusterName = cluster.display_name || cluster.name

  // 获取节点列表（用于第一个界面的节点选择）
  let availableNodes: { id: number; ip: string; management_port: number }[] = []
  console.log('[删除集群] cluster.id:', cluster.id, 'clusterName:', clusterName)
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes`, { params: { page: 1, page_size: 100 } })
    availableNodes = res.data.items || []
    console.log('[删除集群] 获取到节点数:', availableNodes.length, JSON.stringify(availableNodes.map((n: any) => n.ip + ':' + n.management_port)))
  } catch (e) {
    console.error('[删除集群] 加载节点列表失败', e)
  }

  // 加载资源统计
  let stats: Record<string, number> = {}
  try {
    const res = await api.get(`/clusters/${cluster.id}/stats`)
    stats = res.data
  } catch { /* 统计加载失败时不阻塞，显示空计数 */ }

  showDeleteConfirm({
    title: `确定要删除集群 "${clusterName}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}`,
    showResourceStats: true,
    stats,
    nodes: availableNodes,
    onOk: async (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => {
      // 第二步：输入集群名称确认
      let nameConfirmed = false
      const nameModal = Modal.confirm({
        title: '请输入集群名称确认删除',
        width: 400,
        content: h('div', { style: 'font-size: 13px;' }, [
          h('div', { style: 'margin-bottom: 8px; color: #666;' }, `请输入集群名称 "${clusterName}" 以确认删除：`),
          h('input', {
            type: 'text',
            placeholder: '请输入集群名称',
            onInput: (e: any) => {
              nameConfirmed = (e.target.value || '').trim() === (clusterName || '').trim()
              if (nameModal) {
                nameModal.update({ okButtonProps: { disabled: !nameConfirmed } })
              }
            },
            style: 'width: 100%; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; box-sizing: border-box; font-size: 14px;',
          }),
        ]),
        okText: '确认删除',
        okButtonProps: { disabled: true } as any,
        cancelText: '取消',
        onOk: async () => {
          if (!nameConfirmed) return false
          await executeDeleteWithProgress({
            title: `删除集群: ${clusterName}`,
            apiEndpoint: `/clusters/${cluster.id}`,
            cluster,
            deleteDb,
            deleteEdge,
            nodeIds,
            refreshFn: () => loadClusters(),
          })
        },
      })
    },
  })
}

// Wire showDeleteConfirm for route composable (must be after showDeleteConfirm definition)
_showDeleteConfirmRoute = showDeleteConfirm

onMounted(() => {
  loadClusters()
})
</script>

<style scoped>
.cluster-list {
  position: relative;
  min-height: calc(100vh - 56px - 40px);
  margin: -20px -24px;
  padding: 20px 24px;
  background: var(--p-bg-page);
  overflow: hidden;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.header-section h2 {
  margin: 0 0 8px 0;
  color: var(--p-text-primary);
  font-size: 20px;
  font-weight: 600;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-count {
  font-size: 13px;
  color: var(--p-text-tertiary);
  white-space: nowrap;
}

:deep(.header-section) .ant-input-affix-wrapper {
  background: var(--p-bg-glass) !important;
  border: 1px solid var(--p-border-default) !important;
  border-radius: 6px;
  box-shadow: none !important;
}
:deep(.header-section) .ant-input-affix-wrapper .ant-input {
  background: transparent !important;
  border: none !important;
  color: var(--p-text-primary) !important;
}
:deep(.header-section) .ant-input-affix-wrapper .ant-input::placeholder {
  color: var(--p-text-disabled) !important;
}
:deep(.header-section) .ant-input-search-button {
  background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info)) !important;
  border: none !important;
  color: var(--p-text-inverse) !important;
  border-radius: 0 6px 6px 0 !important;
}
:deep(.header-section) .ant-input-search-button:hover {
  opacity: 0.92;
}
:deep(.header-section) .ant-radio-group.ant-radio-group-solid .ant-radio-button-wrapper {
  background: var(--p-bg-glass) !important;
  border-color: var(--p-border-default) !important;
  color: var(--p-text-secondary) !important;
}
:deep(.header-section) .ant-radio-group.ant-radio-group-solid .ant-radio-button-wrapper-checked {
  background: var(--p-color-primary) !important;
  border-color: var(--p-color-primary) !important;
  color: var(--p-text-inverse) !important;
}
:deep(.header-section) .ant-radio-group.ant-radio-group-solid .ant-radio-button-wrapper:not(:first-child)::before {
  background: var(--p-border-default) !important;
}

.status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.green { background: var(--p-color-success); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-success) 50%, transparent); }
.status-dot.red { background: var(--p-color-danger); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-danger) 50%, transparent); }

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
  background: var(--p-bg-hover);
  transition: background 0.15s;
  user-select: none;
}
.group-header:hover { background: var(--p-color-primary-bg); }
.group-toggle { font-size: 11px; color: var(--p-color-primary); opacity: 0.6; flex-shrink: 0; }
.group-name { font-weight: 600; font-size: 14px; color: var(--p-text-primary); flex-shrink: 0; }
.group-count { font-size: 12px; color: var(--p-text-tertiary); margin-right: 8px; flex-shrink: 0; }
.ungrouped-label { opacity: 0.7; font-weight: 500; }
.cluster-names {
  display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0;
  padding: 0 4px;
}
.cluster-name-item {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 4px;
  font-size: 12px; color: var(--p-text-secondary);
  cursor: pointer; white-space: nowrap;
  transition: all 0.15s;
}
.cluster-name-item:hover {
  background: var(--p-color-primary-bg);
  color: var(--p-color-primary);
}
.status-dot-sm {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.status-dot-sm.green { background: var(--p-color-success); }
.status-dot-sm.red { background: var(--p-color-danger); }
.expand-group-btn { flex-shrink: 0; }
.group-chip {
  font-size: 10px; padding: 1px 8px; border-radius: 8px;
  background: var(--p-color-primary-bg); color: var(--p-color-primary);
  margin-right: 4px; flex-shrink: 0;
}
.maximize-btn-sm {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 4px;
  cursor: pointer; color: var(--p-text-tertiary);
  transition: all 0.15s; flex-shrink: 0;
}
.maximize-btn-sm:hover {
  background: var(--p-color-primary-bg); color: var(--p-color-primary);
}
.ungrouped-hdr { cursor: default; opacity: 0.7; }
.ungrouped-hdr:hover { background: var(--p-bg-hover); }

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

.cluster-card {
  background: var(--p-bg-glass);
  backdrop-filter: blur(var(--p-glass-blur));
  -webkit-backdrop-filter: blur(var(--p-glass-blur));
  border: 1px solid var(--p-glass-border);
  border-top: 3px solid var(--p-color-primary);
  border-radius: var(--p-radius-lg);
  overflow: hidden;
  box-shadow: var(--p-shadow-glass);
  transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
}
.cluster-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--p-shadow-lg);
  border-color: var(--p-border-hover);
}

.expand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: var(--p-bg-hover);
  transition: background 0.15s;
  border-bottom: 1px solid var(--p-border-divider);
  border-left: 3px solid transparent;
}
.expand-row:hover {
  background: var(--p-color-primary-bg);
  border-left-color: var(--p-color-primary);
}
.expand-row:hover {
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent);
}

.cname-wrap {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
}
.cname {
  font-weight: 600; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--p-text-primary);
}
.chint {
  font-size: 11px; color: var(--p-text-tertiary); font-weight: 400; flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: transparent;
}

.stats-bar {
  display: flex;
  background: var(--p-bg-hover);
  border-radius: var(--p-radius-md);
  overflow: hidden;
  flex-shrink: 0;
}
.scell {
  text-align: center; padding: 5px 12px;
}
.scell + .scell { border-left: 1px solid var(--p-border-divider); }
.snum { font-size: 15px; font-weight: 700; color: var(--p-text-primary); line-height: 1.2; }
.slbl { font-size: 10px; color: var(--p-text-tertiary); }

.cactions {
  display: flex; gap: 3px; flex-shrink: 0; margin-left: auto;
}
.cbtn {
  padding: 3px 10px; font-size: 11px;
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-sm);
  background: var(--p-bg-hover);
  cursor: pointer;
  color: var(--p-text-secondary);
  transition: all 0.2s;
}
.cbtn:hover { border-color: var(--p-color-primary); color: var(--p-color-primary); background: var(--p-bg-hover); }
.cbtn.danger:hover { border-color: var(--p-color-danger); color: var(--p-color-danger); background: color-mix(in srgb, var(--p-color-danger) 10%, transparent); }

.chips-row {
  display: flex; gap: 6px; flex-wrap: wrap; padding: 0 14px 12px;
}
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 6px; font-size: 12px;
  border: 1px solid var(--p-border-default);
  background: var(--p-bg-hover);
  color: var(--p-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.chip::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--p-text-tertiary);
  flex-shrink: 0;
  transition: background 0.2s;
}
.chip:hover {
  border-color: var(--p-color-primary);
  color: #fff;
  background: var(--p-color-primary);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--p-color-primary) 30%, transparent);
}
.chip:hover::before {
  background: #fff;
}
.chip.disabled { opacity: 0.35; cursor: not-allowed; }
.chip.disabled:hover { background: var(--p-bg-hover); color: var(--p-text-secondary); border-color: var(--p-border-default); }
.chip.disabled:hover::before { background: var(--p-text-tertiary); }
.cb {
  font-size: 10px; font-weight: 600; margin-left: 2px;
  color: var(--p-text-tertiary);
  transition: color 0.2s;
}
.chip:hover .cb { color: rgba(255,255,255,0.85); }

.expanded-area {
  margin-top: 20px;
  position: relative;
  z-index: 1;
  border-top: 2px solid color-mix(in srgb, var(--p-color-primary) 40%, transparent);
  padding-top: 16px;
}

.card-expanded {
  background: var(--p-bg-glass);
  backdrop-filter: blur(var(--p-glass-blur));
  -webkit-backdrop-filter: blur(var(--p-glass-blur));
  border: 1px solid color-mix(in srgb, var(--p-color-primary) 30%, transparent);
  border-top: 3px solid var(--p-color-primary);
  border-radius: var(--p-radius-lg);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: var(--p-shadow-glass);
}
.card-expanded .card-header {
  border-bottom: 1px solid var(--p-border-divider);
  background: transparent;
}
.card-expanded .expand-row {
  background: var(--p-color-primary-bg);
  border-bottom: 1px solid var(--p-border-divider);
  border-left: 3px solid var(--p-color-primary);
  cursor: grab;
}
.card-expanded .expand-row:hover {
  background: color-mix(in srgb, var(--p-color-primary) 15%, transparent);
}
.card-expanded.dragging { opacity: 0.35; }
.card-expanded.drag-over {
  border-color: var(--p-color-warning) !important;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--p-color-warning) 25%, transparent) !important;
}

.card-detail {
  border-top: 1px solid var(--p-border-divider);
  position: relative;
}

.dtabs {
  display: flex;
  gap: 4px;
  background: transparent;
  border-bottom: 1px solid var(--p-border-divider);
  padding: 8px 16px 0;
  overflow-x: auto;
}
.dt {
  padding: 7px 14px; font-size: 13px;
  color: var(--p-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
  border-radius: 8px 8px 0 0;
  background: var(--p-bg-hover);
  border: 1px solid var(--p-border-default);
  border-bottom: none;
  position: relative;
  user-select: none;
}
.dt:hover {
  color: var(--p-color-primary);
  background: var(--p-color-primary-bg);
  border-color: var(--p-border-hover);
}
.dt.active {
  color: var(--p-color-primary);
  background: var(--p-bg-page);
  border-color: var(--p-border-default);
  border-bottom: 1px solid var(--p-bg-page);
  margin-bottom: -1px;
  font-weight: 500;
  box-shadow: 0 -2px 6px rgba(0,0,0,0.04);
  z-index: 1;
}
.dt.active::after {
  content: '';
  position: absolute;
  top: 0; left: 8px; right: 8px;
  height: 2px;
  background: var(--p-color-primary);
  border-radius: 0 0 2px 2px;
}
.db {
  margin-left: 4px; padding: 1px 6px; border-radius: 8px; font-size: 10px;
  background: var(--p-bg-hover); color: var(--p-text-tertiary);
}
.dt.active .db { background: var(--p-color-primary-bg); color: var(--p-color-primary); }

.dbody { padding: 16px; min-height: 100px; }

.node-tab { width: 100%; }
.tab-content { min-height: 100px; }
.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.node-table { margin-top: 8px; }

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
  border-radius: var(--p-radius-sm);
  color: var(--p-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--p-bg-hover);
  border: 1px solid var(--p-border-default);
  transition: all 0.2s;
  user-select: none;
}
.click-zone:hover {
  background: var(--p-bg-hover);
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}
.click-zone.on {
  background: var(--p-color-primary-bg);
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}

.cluster-desc { color: var(--p-text-secondary); font-size: 13px; margin: 0; }
.no-desc { color: var(--p-text-tertiary); font-size: 13px; font-style: italic; margin: 0; }

/* transitions */
.grid-leave-active { position: absolute !important; opacity: 0; transform: translateY(10px); transition: all 0.2s ease-in; width: calc(100% / 3 - 8px); z-index: 1; }
.grid-move { transition: all 0.3s ease; }
.grid-enter-active { transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.grid-enter-from { opacity: 0; transform: translateY(10px) scale(0.95); }
.expand-enter-active { animation: expandWaterfall 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
@keyframes expandWaterfall { 0% { opacity: 0; max-height: 0; margin-bottom: 0; overflow: hidden; transform: translateY(-250px); } 25% { opacity: 1; } 85% { max-height: 500px; transform: translateY(8px); } 100% { opacity: 1; max-height: 500px; margin-bottom: 12px; transform: translateY(0); } }
.expand-leave-active { animation: expandFlyUp 0.3s ease-in forwards; overflow: hidden; }
@keyframes expandFlyUp { 0% { opacity: 1; max-height: 500px; margin-bottom: 12px; transform: translateY(0); } 40% { opacity: 1; } 100% { opacity: 0; max-height: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; transform: translateY(-120px); } }

:deep(.header-section .ant-btn-primary) {
  background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info)) !important;
  border: none !important;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--p-color-primary) 30%, transparent) !important;
}
:deep(.header-section .ant-btn-primary:hover) {
  opacity: 0.92;
  box-shadow: 0 6px 24px color-mix(in srgb, var(--p-color-primary) 40%, transparent) !important;
}

:deep(.node-table) .ant-table { background: transparent !important; }
:deep(.node-table) .ant-table-thead > tr > th {
  background: var(--p-color-primary-bg) !important;
  border-bottom: 2px solid var(--p-color-primary) !important;
  color: var(--p-text-primary) !important;
  font-size: 12px; font-weight: 600;
}
:deep(.node-table) .ant-table-tbody > tr > td {
  background: transparent !important;
  border-bottom: 1px solid var(--p-border-divider) !important;
  color: var(--p-text-secondary);
}
:deep(.node-table) .ant-table-tbody > tr:hover > td { background: var(--p-bg-hover) !important; }
:deep(.node-table) .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
:deep(.node-table) .ant-empty-description { color: var(--p-text-disabled) !important; }
:deep(.node-table) .ant-tag { border: none; font-weight: 500; border-radius: var(--p-radius-sm); }
:deep(.node-table) .ant-badge-status-text { color: var(--p-text-secondary); }

:deep(.node-table) .ant-table-tbody .ant-btn {
  background: var(--p-bg-hover) !important;
  border: 1px solid var(--p-border-default) !important;
  color: var(--p-text-secondary) !important;
  border-radius: var(--p-radius-sm); height: 26px; font-size: 12px; padding: 0 8px;
}
:deep(.node-table) .ant-table-tbody .ant-btn:hover { background: var(--p-color-primary-bg) !important; border-color: var(--p-color-primary) !important; color: var(--p-color-primary) !important; }
:deep(.node-table) .ant-table-tbody .ant-btn-dangerous { color: var(--p-color-danger) !important; }

:deep(.node-table) .ant-pagination .ant-pagination-item { background: var(--p-bg-glass) !important; border: 1px solid var(--p-border-default) !important; border-radius: var(--p-radius-sm); }
:deep(.node-table) .ant-pagination .ant-pagination-item a { color: var(--p-text-secondary) !important; }
:deep(.node-table) .ant-pagination .ant-pagination-item-active { background: var(--p-color-primary) !important; border-color: var(--p-color-primary) !important; }
:deep(.node-table) .ant-pagination .ant-pagination-item-active a { color: var(--p-text-inverse) !important; }
:deep(.node-table) .ant-pagination .ant-pagination-prev button,
:deep(.node-table) .ant-pagination .ant-pagination-next button { background: var(--p-bg-glass) !important; border: 1px solid var(--p-border-default) !important; color: var(--p-text-secondary) !important; }
:deep(.node-table) .ant-pagination .ant-pagination-disabled button { opacity: 0.3 !important; }
:deep(.node-table) .ant-pagination-options .ant-select-selector { background: var(--p-bg-glass) !important; border: 1px solid var(--p-border-default) !important; color: var(--p-text-secondary) !important; }
:deep(.node-table) .ant-pagination-total-text { color: var(--p-text-tertiary) !important; }

:deep(.dbody) .ant-input-affix-wrapper { background: var(--p-bg-glass) !important; border: 1px solid var(--p-border-default) !important; border-radius: 6px; }
:deep(.dbody) .ant-input-affix-wrapper .ant-input { background: transparent !important; border: none !important; color: var(--p-text-primary) !important; }
:deep(.dbody) .ant-input-affix-wrapper .ant-input::placeholder { color: var(--p-text-disabled) !important; }
:deep(.dbody) .ant-input-search-button { background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info)) !important; border: none !important; color: var(--p-text-inverse) !important; border-radius: 0 6px 6px 0 !important; }
:deep(.dbody) .ant-select-selector { background: var(--p-bg-glass) !important; border: 1px solid var(--p-border-default) !important; color: var(--p-text-primary) !important; border-radius: 6px !important; }
:deep(.dbody) .ant-select-selection-placeholder { color: var(--p-text-disabled) !important; }
:deep(.dbody) .ant-select-arrow { color: var(--p-text-tertiary) !important; }

:deep(.node-actions .ant-btn) { background: var(--p-bg-hover) !important; border: 1px solid var(--p-border-default) !important; color: var(--p-text-secondary) !important; border-radius: 6px; }
:deep(.node-actions .ant-btn:hover) { background: var(--p-color-primary-bg) !important; border-color: var(--p-color-primary) !important; color: var(--p-color-primary) !important; }
:deep(.node-actions .ant-btn-primary) { background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info)) !important; border: none !important; color: var(--p-text-inverse) !important; }
:deep(.node-actions .ant-btn-primary:hover) { opacity: 0.92; box-shadow: 0 4px 16px color-mix(in srgb, var(--p-color-primary) 30%, transparent) !important; }
:deep(.node-actions .ant-btn-dangerous) { color: var(--p-color-danger) !important; }
:deep(.node-actions .ant-divider-vertical) { border-color: var(--p-border-default) !important; }

:deep(.ant-popover-inner) { background: var(--p-bg-page) !important; border: 1px solid var(--p-border-default) !important; }
:deep(.ant-popover-title) { color: var(--p-text-primary) !important; border-bottom: 1px solid var(--p-border-divider) !important; }
:deep(.ant-popover-inner-content) { color: var(--p-text-secondary) !important; }
:deep(.ant-checkbox-wrapper) { color: var(--p-text-secondary) !important; }

/* ── Maximized mode: mini-bar ── */
.cluster-mini-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 12px;
  background: var(--p-bg-glass);
  border: 1px solid var(--p-glass-border);
  border-radius: var(--p-radius-lg);
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
  border-radius: var(--p-radius-md);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
  border: 1px solid transparent;
  background: var(--p-bg-hover);
  color: var(--p-text-secondary);
  user-select: none;
}
.mini-item:hover {
  border-color: var(--p-border-hover);
  background: var(--p-color-primary-bg);
  color: var(--p-color-primary);
}
.mini-item.active {
  background: var(--p-color-primary);
  color: #fff;
  border-color: var(--p-color-primary);
  font-weight: 500;
}
.mini-item .status-dot {
  width: 7px; height: 7px;
}
.mini-name {
  font-weight: 500;
}
.mini-hint {
  font-size: 10px;
  opacity: 0.6;
}

.restore-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-sm);
  background: var(--p-bg-hover);
  color: var(--p-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.restore-btn:hover {
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
  background: var(--p-color-primary-bg);
}

/* ── Maximize / Restore button ── */
.maximize-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 6px;
  border-radius: var(--p-radius-sm);
  color: var(--p-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--p-bg-hover);
  border: 1px solid var(--p-border-default);
  transition: all 0.2s;
  user-select: none;
  margin-left: 4px;
}
.maximize-btn:hover {
  background: var(--p-bg-hover);
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}
.maximize-btn.restore {
  background: var(--p-color-primary-bg);
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}

/* ── Card maximized ── */
.card-maximized {
  border-color: var(--p-color-primary) !important;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--p-color-primary) 20%, transparent) !important;
}
.card-maximized .dbody {
  min-height: 300px;
}
.card-maximized .dtabs {
  overflow-x: visible;
}
.card-maximized .expand-row {
  cursor: default;
}
.card-maximized .expand-row:active {
  cursor: default;
}

/* ── Expanded area in maximized mode ── */
.cluster-list:has(.cluster-mini-bar) .expanded-area {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}
</style>

<style>
</style>
