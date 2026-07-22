<template>
  <div class="cl-page">
    <PageHeader title="统一管理" description="以集群为单位，统一管理该集群下的资源，实现统一监控与运维">
      <template #actions>
        <button class="btn btn-primary" @click="showAddModal">+ 新建集群</button>
      </template>
    </PageHeader>

    <div class="cl-header-actions">
      <div class="search-input-wrap">
        <input v-model="filterText" type="text" placeholder="搜索集群名称或显示名..." class="form-input">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="statusFilter" class="form-input" style="width:110px;flex-shrink:0;">
        <option value="all">全部状态</option>
        <option value="healthy">健康</option>
        <option value="offline">离线</option>
      </select>
      <span class="text-sm text-muted">共 {{ filteredClusters.length }} 个集群</span>
      <button v-if="groupedClusters.some(g => expandedGroups[g.name || '__ungrouped__'] === false)" class="btn btn-secondary btn-sm" @click="expandAll">全部展开</button>
      <button v-if="groupedClusters.some(g => expandedGroups[g.name || '__ungrouped__'] !== false)" class="btn btn-secondary btn-sm" @click="collapseAll">全部收起</button>
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
            <span class="group-count">(共{{ group.clusters.length }}个)</span>
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
              <div v-for="cluster in group.clusters" :key="cluster.id" class="cl-card">
                <div class="cl-card-topbar">
                  <span>{{ cluster.group_name || '未分类' }}</span>
                  <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
                    <span>最大化</span>
                  </div>
                </div>
                <div class="cl-card-header">
                  <div class="cl-card-info" style="display:flex;align-items:center;gap:8px;">
                    <span class="status-dot" :class="cluster.status === 1 ? 'online' : 'offline'"></span>
                    <div>
                      <div class="cl-card-name">{{ cluster.display_name || cluster.name }}</div>
                      <div v-if="cluster.display_name" class="cl-card-desc">集群标识: {{ cluster.name }}</div>
                    </div>
                  </div>
                  <div class="cl-card-meta">
                    <span v-if="cluster.status === 1" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
                    <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
                  </div>
                </div>
                <div class="cl-card-stats">
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'nodes')"><div class="cl-stat-value">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="cl-stat-label">节点</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'upstreams')"><div class="cl-stat-value">{{ cluster.upstream_count }}</div><div class="cl-stat-label">上游</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'routes')"><div class="cl-stat-value">{{ cluster.route_count }}</div><div class="cl-stat-label">路由</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'pluginConfigs')"><div class="cl-stat-value">{{ cluster.plugin_config_count }}</div><div class="cl-stat-label">插件组</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'globalRules')"><div class="cl-stat-value">{{ cluster.global_rule_count }}</div><div class="cl-stat-label">全局规则</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'staticResources')"><div class="cl-stat-value">{{ cluster.static_resource_count }}</div><div class="cl-stat-label">静态资源</div></div>
                </div>
                <div v-if="cluster.nodes && cluster.nodes.length > 0" class="cl-card-nodes">
                  <span v-for="n in (cluster.nodes.length <= 3 ? cluster.nodes : cluster.nodes.slice(0, 3))" :key="n.id" class="cl-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
                    <span class="node-ndot" :class="n.status === 1 ? 'green' : 'red'"></span>
                    {{ n.ip }}:{{ n.service_port }}
                  </span>
                  <span v-if="cluster.nodes.length > 3" class="node-more">...还有 {{ cluster.nodes.length - 3 }} 个</span>
                </div>
                <div class="cl-card-actions">
                  <button class="btn btn-ghost btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
                  <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
                  <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click.stop="deleteCluster(cluster)">删除</button>
                  <span style="flex:1"></span>
                  <span class="cl-card-id">#{{ cluster.id }}</span>
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
            <span class="group-count">(共{{ group.clusters.length }}个)</span>
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
              <div v-for="cluster in group.clusters" :key="cluster.id" class="cl-card">
                <div class="cl-card-topbar">
                  <span>{{ cluster.group_name || '未分类' }}</span>
                  <div class="maximize-btn-sm" title="最大化" @click.stop="maximizeCluster(cluster)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
                    <span>最大化</span>
                  </div>
                </div>
                <div class="cl-card-header">
                  <div class="cl-card-info" style="display:flex;align-items:center;gap:8px;">
                    <span class="status-dot" :class="cluster.status === 1 ? 'online' : 'offline'"></span>
                    <div>
                      <div class="cl-card-name">{{ cluster.display_name || cluster.name }}</div>
                      <div v-if="cluster.display_name" class="cl-card-desc">集群标识: {{ cluster.name }}</div>
                    </div>
                  </div>
                  <div class="cl-card-meta">
                    <span v-if="cluster.status === 1" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
                    <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
                  </div>
                </div>
                <div class="cl-card-stats">
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'nodes')"><div class="cl-stat-value">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="cl-stat-label">节点</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'upstreams')"><div class="cl-stat-value">{{ cluster.upstream_count }}</div><div class="cl-stat-label">上游</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'routes')"><div class="cl-stat-value">{{ cluster.route_count }}</div><div class="cl-stat-label">路由</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'pluginConfigs')"><div class="cl-stat-value">{{ cluster.plugin_config_count }}</div><div class="cl-stat-label">插件组</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'globalRules')"><div class="cl-stat-value">{{ cluster.global_rule_count }}</div><div class="cl-stat-label">全局规则</div></div>
                  <div class="cl-stat-cell cl-stat-link" @click.stop="maximizeAndSwitchTab(cluster, 'staticResources')"><div class="cl-stat-value">{{ cluster.static_resource_count }}</div><div class="cl-stat-label">静态资源</div></div>
                </div>
                <div v-if="cluster.nodes && cluster.nodes.length > 0" class="cl-card-nodes">
                  <span v-for="n in (cluster.nodes.length <= 3 ? cluster.nodes : cluster.nodes.slice(0, 3))" :key="n.id" class="cl-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
                    <span class="node-ndot" :class="n.status === 1 ? 'green' : 'red'"></span>
                    {{ n.ip }}:{{ n.service_port }}
                  </span>
                  <span v-if="cluster.nodes.length > 3" class="node-more">...还有 {{ cluster.nodes.length - 3 }} 个</span>
                </div>
                <div class="cl-card-actions">
                  <button class="btn btn-ghost btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
                  <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
                  <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click.stop="deleteCluster(cluster)">删除</button>
                  <span style="flex:1"></span>
                  <span class="cl-card-id">#{{ cluster.id }}</span>
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
        <!-- Header: status + group-chip + restore -->
        <div class="expanded-mini-row">
          <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
          <span v-if="cluster.group_name" class="group-chip">{{ cluster.group_name }}</span>
          <span class="flex-spacer"></span>
          <div v-if="maximizedClusterId !== cluster.id" class="maximize-btn" title="最大化" @click.stop="maximizeCluster(cluster)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="9.5" y1="1.5" x2="9.5" y2="12.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="1.5" y1="9.5" x2="12.5" y2="9.5" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>
            <span>最大化</span>
          </div>
          <div v-else class="maximize-btn restore" title="退出最大化" @click.stop="restoreMaximize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><line x1="3" y="1.5" x2="3" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="7" y="1.5" x2="7" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="11" y="1.5" x2="11" y2="12.5" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y="3" x2="12.5" y2="3" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y="7" x2="12.5" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="1.5" y="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.2"/></svg>
            <span>还原</span>
          </div>
        </div>
        <!-- Name + actions row -->
        <div class="expanded-name-row">
          <span class="cname">{{ cluster.display_name || cluster.name }}</span>
          <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
          <div class="cl-card-actions">
            <button class="btn btn-ghost btn-sm" @click.stop="viewClusterDetail(cluster)">详情</button>
            <button class="btn btn-ghost btn-sm" @click.stop="testCluster(cluster)">连接测试</button>
            <button class="btn btn-ghost btn-sm" @click.stop="editCluster(cluster)">编辑</button>
            <button class="btn btn-ghost btn-sm" @click.stop="exportCluster(cluster)">导出 Excel</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click.stop="deleteCluster(cluster)">删除</button>
          </div>
        </div>
        <div class="card-detail">
          <div class="dtabs">
            <span class="dt" :class="{ active: cluster.activeTab === 'nodes' }" @click="cluster.activeTab = 'nodes'; handleTabClick(cluster, 'nodes')">集群节点 <span class="db">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'upstreams' }" @click="cluster.activeTab = 'upstreams'; handleTabClick(cluster, 'upstreams')">上游 <span class="db">{{ cluster.upstream_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'routes' }" @click="cluster.activeTab = 'routes'; handleTabClick(cluster, 'routes')">路由 <span class="db">{{ cluster.route_count }}</span></span>
          <span v-if="authStore.hasPermission('plugin_groups')" class="dt" :class="{ active: cluster.activeTab === 'pluginConfigs' }" @click="cluster.activeTab = 'pluginConfigs'; handleTabClick(cluster, 'pluginConfigs')">插件组 <span class="db">{{ cluster.plugin_config_count }}</span></span>
          <span v-if="authStore.hasPermission('plugin_metadata')" class="dt" :class="{ active: cluster.activeTab === 'globalPlugins' }" @click="cluster.activeTab = 'globalPlugins'; handleTabClick(cluster, 'globalPlugins')">插件元数据</span>
          <span v-if="authStore.hasPermission('global_rules')" class="dt" :class="{ active: cluster.activeTab === 'globalRules' }" @click="cluster.activeTab = 'globalRules'; handleTabClick(cluster, 'globalRules')">全局规则 <span class="db">{{ cluster.global_rule_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'staticResources' }" @click="cluster.activeTab = 'staticResources'; handleTabClick(cluster, 'staticResources')">静态资源 <span class="db">{{ cluster.static_resource_count }}</span></span>
          </div>
          <div class="dbody">
          <ClusterUpstreams v-if="cluster.activeTab === 'upstreams'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" @refresh="loadClusters" />
           <ClusterRoutes v-else-if="cluster.activeTab === 'routes'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :show-delete-confirm="showDeleteConfirm" :load-plugin-configs="loadPluginConfigs" :available-plugins="availablePlugins" :load-available-plugins="loadAvailablePlugins" @refresh="loadClusters" />
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

    <ClusterFormModal :visible="modalVisible" :editing-cluster="editingCluster" :group-options="groupOptions" @close="modalVisible = false; editingCluster = null" @saved="modalVisible = false; editingCluster = null; loadClusters()" />

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
            <a-form-item label="服务端口" name="service_port" :rules="[{ required: true, type: 'number', message: '请输入服务端口' }]">
              <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item label="管理端口" name="management_port" :rules="[{ required: true, type: 'number', message: '请输入管理端口' }]">
              <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item label="Edge路径" name="edge_path" :rules="[{ required: true, message: '请输入Edge路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' }, { max: 255, message: '最多255个字符' }]">
              <a-input v-model:value="nodeForm.edge_path" placeholder="运行时路径，如 /edge/node1" />
            </a-form-item>
            <a-form-item label="安装路径" name="edge_install_path" :rules="[{ pattern: /^\//, message: '必须以 / 开头' }, { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' }, { max: 255, message: '最多255个字符' }]">
              <a-input v-model:value="nodeForm.edge_install_path" placeholder="留空则与Edge路径相同" />
            </a-form-item>
            <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
              <a-select v-model:value="nodeForm.status">
                <a-select-option :value="1">正常</a-select-option>
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

    <!-- Cluster Detail Modal -->
    <div class="modal-overlay" :style="{ display: detailVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>集群详情</h2>
          <button class="modal-close" @click="detailVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="detailCluster">
            <table class="detail-table">
              <tbody>
                <tr><td class="dt-label">集群名称</td><td class="dt-value">{{ detailCluster.name }}</td></tr>
                <tr><td class="dt-label">显示名称</td><td class="dt-value">{{ detailCluster.display_name || '-' }}</td></tr>
                <tr><td class="dt-label">分组</td><td class="dt-value">{{ detailCluster.group_name || '-' }}</td></tr>
                <tr><td class="dt-label">描述</td><td class="dt-value">{{ detailCluster.description || '-' }}</td></tr>
                <tr><td class="dt-label">状态</td>
                  <td class="dt-value">
                    <span v-if="detailCluster.status === 1" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
                    <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
                  </td>
                </tr>
                <tr><td class="dt-label">创建时间</td><td class="dt-value">{{ detailCluster.created_at ? new Date(detailCluster.created_at).toLocaleString('zh-CN') : '-' }}</td></tr>
              </tbody>
            </table>
            <h3 class="detail-section-title">资源统计</h3>
            <div class="detail-stats-grid">
              <div class="detail-stat-card"><div class="detail-stat-label">节点</div><div class="detail-stat-value">{{ detailCluster.healthy_node_count }}/{{ detailCluster.node_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">上游</div><div class="detail-stat-value">{{ detailCluster.upstream_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">路由</div><div class="detail-stat-value">{{ detailCluster.route_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">插件组</div><div class="detail-stat-value">{{ detailCluster.plugin_config_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">全局规则</div><div class="detail-stat-value">{{ detailCluster.global_rule_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">静态资源</div><div class="detail-stat-value">{{ detailCluster.static_resource_count }}</div></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="detailVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Test Connection Modal -->
    <div class="modal-overlay" :style="{ display: testVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>测试连接</h2>
          <button class="modal-close" @click="resetTest">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="!testRunning && testLogs.length === 0">
            <div style="margin-bottom:12px;font-size:13px;color:var(--muted);">将要对下列节点进行 TCP 端口连接测试：</div>
            <div v-if="testNodes.length > 0" class="test-nodes-list">
              <div v-for="n in testNodes" :key="n.id" class="test-node-row">
                <span class="node-addr">{{ n.ip }}:{{ n.management_port }}</span>
                <span class="badge" :class="n.status === 1 ? 'badge-success' : 'badge-neutral'">{{ n.status === 1 ? '在线' : '离线' }}</span>
              </div>
            </div>
            <div v-else style="text-align:center;padding:20px 0;color:var(--muted)">该集群没有节点</div>
          </div>
          <div v-else>
            <div class="test-progress">
              <div v-for="(log, i) in testLogs" :key="i" class="test-log-row" :class="log.status">
                <span v-if="log.status === 'pending'" class="log-spinner">⏳</span>
                <span v-else-if="log.status === 'success'" class="log-icon">✓</span>
                <span v-else-if="log.status === 'error'" class="log-icon log-error">✗</span>
                <span class="log-msg">{{ log.msg }}</span>
              </div>
            </div>
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
import { ref, reactive, computed, watch, onMounted, h, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons-vue'
import { showDeleteConfirm, buildDeleteProgressContent, executeDeleteWithProgress, showNameConfirm } from '@/composables/useClusterUtils'
import { downloadBlob } from '@/utils/download'
import api from '@/api'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
import type { Cluster, Upstream, Plugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PluginMetadata from '@/components/PluginMetadata.vue'
import ClusterFormModal from '@/components/ClusterFormModal.vue'
import PageHeader from '@/components/PageHeader.vue'
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
    expandedOrder.value = expandedOrder.value.filter(id => id !== clusterId)
  }
  maximizedClusterId.value = null
}

function switchMaximizedCluster(clusterId: number) {
  const cluster = clusters.value.find(c => c.id === clusterId)
  if (!cluster) return
  maximizeCluster(cluster)
}

function maximizeAndSwitchTab(cluster: Cluster, tab: string) {
  cluster.activeTab = tab
  maximizeCluster(cluster)
  handleTabClick(cluster, tab)
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
  // 未分组在前，有分组名在后（默认色在上，彩色在下）
  if (map.has('')) groups.push({ name: '', clusters: map.get('')! })
  const named = Array.from(map.entries()).filter(([k]) => k).sort(([a],[b]) => a.localeCompare(b))
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
  availablePlugins: availablePlugins as any,
  loadAvailablePlugins: loadAvailablePlugins as any,
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
const testLogs = ref<{ status: 'pending' | 'success' | 'error'; msg: string }[]>([])
let testingCluster: Cluster | null = null

function resetTest() {
  testVisible.value = false; testRunning.value = false
  testNodes.value = []; testLogs.value = []; testingCluster = null
}

async function testCluster(cluster: Cluster) {
  testingCluster = cluster
  testLogs.value = []
  testRunning.value = false
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes`, { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
    testNodes.value = (res.data.items || []).map((n: any) => ({
      id: n.id, ip: n.ip, service_port: n.service_port, management_port: n.management_port, status: n.status
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
  const nodeIds = testNodes.value.filter(n => n.status === 1).map(n => n.id)
  if (nodeIds.length === 0) {
    testLogs.value.push({ status: 'error', msg: '没有在线节点可测试' })
    testRunning.value = false
    return
  }
  const startTime = Date.now()
  for (const n of testNodes.value) {
    testLogs.value.push({ status: 'pending', msg: `${n.ip}:${n.management_port} 测试中...` })
  }
  try {
    const res = await api.post(`/clusters/${testingCluster.id}/test`, { node_ids: nodeIds })
    const results: any[] = res.data.results || []
    let successCount = 0; let failCount = 0
    for (const r of results) {
      const idx = testNodes.value.findIndex(n => n.id === r.node_id)
      if (idx >= 0) {
        const label = `${r.ip}:${r.port}`
        if (r.ok) { successCount++; testLogs.value[idx] = { status: 'success', msg: `${label} 连接成功` } }
        else { failCount++; testLogs.value[idx] = { status: 'error', msg: `${label} 连接失败 — ${r.msg}` } }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    testLogs.value.push({ status: 'success', msg: `测试完成 — 共 ${results.length} 个节点，成功 ${successCount}，失败 ${failCount}，耗时 ${elapsed}s` })
  } catch (e: any) {
    for (let i = 0; i < testLogs.value.length; i++) {
      if (testLogs.value[i].status === 'pending') {
        const n = testNodes.value[i]
        testLogs.value[i] = { status: 'error', msg: `${n.ip}:${n.management_port} 测试异常 — ${e.response?.data?.detail || e.message}` }
      }
    }
    testLogs.value.push({ status: 'error', msg: `测试异常终止` })
  }
  testRunning.value = false
}

const deleteCluster = async (cluster: Cluster) => {
  const clusterName = cluster.display_name || cluster.name

  // 获取节点列表（用于第一个界面的节点选择）
  let availableNodes: { id: number; ip: string; management_port: number }[] = []
  console.log('[删除集群] cluster.id:', cluster.id, 'clusterName:', clusterName)
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes`, { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
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
      showNameConfirm({
        title: '请输入集群名称确认删除',
        expectedName: clusterName,
        onConfirm: async () => {
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
_showDeleteConfirmRoute = showDeleteConfirm

const centralRoute = useRoute()

onMounted(async () => {
  await loadClusters()
  const editId = centralRoute.query.editClusterId
  if (editId) {
    const id = parseInt(editId as string, 10)
    if (!isNaN(id)) {
      const found = clusters.value.find(c => c.id === id)
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
  padding: 20px 24px;
  min-height: calc(100vh - 56px - 40px);
}

.cl-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.cl-header-actions .search-input-wrap { width: 200px; flex-shrink: 0; }
.cl-header-actions :deep(.form-input) { width: 100%; }

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
  display: inline-flex; align-items: center; gap: 2px;
  padding: 1px 6px; font-size: 11px;
  border-radius: 3px;
  cursor: pointer; color: var(--p-text-tertiary);
  transition: all 0.15s; flex-shrink: 0;
  white-space: nowrap;
}
.maximize-btn-sm:hover {
  background: color-mix(in srgb, var(--p-color-primary) 12%, transparent);
  color: var(--p-color-primary);
}
.scell {
  text-align: center; padding: 5px 12px; cursor: pointer;
  transition: all 0.15s;
}
.scell:hover {
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent);
}
.scell:hover .snum { color: var(--p-color-primary); }
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

/* ── Card style matching ClusterList ── */
.cl-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cl-card:hover {
  box-shadow: var(--shadow-md);
}

.cl-card-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 3px 12px 3px 16px; font-size: 11px; font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
}

.cl-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.cl-card-info {
  flex: 1;
  min-width: 0;
}
.cl-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.cl-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}

.cl-card-stats {
  display: flex;
  background: oklch(50% 0 0 / 4%);
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  margin: 4px 16px;
}
.cl-stat-cell {
  text-align: center; cursor: pointer;
  padding: 5px 12px;
  transition: all 0.15s;
  flex: 1;
}
.cl-stat-cell + .cl-stat-cell {
  border-left: 1px solid var(--border);
}
.cl-stat-cell:hover {
  background: oklch(100% 0 0 / 6%);
}
.cl-stat-value {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.3;
}
.cl-stat-label {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  margin-top: 2px;
}

.cl-card-actions {
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.cl-card-id {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.cl-card-nodes {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 8px;
}
.cl-node-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 10px; font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.cl-node-tag.online { border-color: oklch(55% 0.15 145 / 25%); }
.cl-node-tag.offline { border-color: oklch(55% 0.18 28 / 25%); }
.node-ndot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.node-ndot.green { background: var(--success); }
.node-ndot.red { background: var(--danger); }
.node-more { font-size: 11px; color: var(--p-text-tertiary); padding: 2px 4px; }

/* Expanded area action buttons */
.cactions {
  display: flex; gap: 3px; flex-shrink: 0; margin-left: auto;
}
.cname {
  font-weight: 600; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--fg);
}
.chint {
  font-size: 11px; color: var(--muted); font-weight: 400; flex-shrink: 0;
}

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
  margin-bottom: 12px;
  box-shadow: var(--p-shadow-glass);
}
.card-expanded.dragging { opacity: 0.35; }
.card-expanded.drag-over {
  border-color: var(--p-color-warning) !important;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--p-color-warning) 25%, transparent) !important;
}

.flex-spacer { flex: 1; }
.expanded-mini-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 16px; background: var(--p-color-primary-bg);
  border-bottom: 1px solid var(--p-border-divider);
}
.expanded-name-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--p-border-divider);
}
.expanded-name-row .cname { font-size: 15px; font-weight: 600; color: var(--p-text-primary); }
.expanded-name-row .chint { font-size: 12px; color: var(--p-text-tertiary); }
.expanded-name-row .cl-card-actions {
  margin-left: auto;
  margin-top: 0;
  padding: 0;
  border-top: none;
}

.card-detail {
  border-top: 1px solid var(--p-border-divider);
  position: relative;
}
.dtabs {
  display: flex; gap: 4px;
  background: transparent;
  border-bottom: 1px solid var(--p-border-divider);
  padding: 8px 16px 0;
  overflow-x: auto;
}
.dt {
  padding: 7px 14px; font-size: 13px;
  color: var(--p-text-secondary);
  cursor: pointer; white-space: nowrap;
  transition: all 0.2s; flex-shrink: 0;
  border-radius: 8px 8px 0 0;
  background: var(--p-bg-hover);
  border: 1px solid var(--p-border-default);
  border-bottom: none;
  position: relative; user-select: none;
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
  margin-bottom: -1px; font-weight: 500;
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

:deep(.dbody) .ant-input-affix-wrapper { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: 6px; }
:deep(.dbody) .ant-input-affix-wrapper .ant-input { background: transparent !important; border: none !important; color: var(--fg) !important; }
:deep(.dbody) .ant-input-affix-wrapper .ant-input::placeholder { color: var(--muted) !important; }
:deep(.dbody) .ant-input-search-button { background: var(--accent) !important; border: none !important; color: #fff !important; border-radius: 0 6px 6px 0 !important; }
:deep(.dbody) .ant-select-selector { background: var(--surface) !important; border: 1px solid var(--border) !important; color: var(--fg) !important; border-radius: 6px !important; }
:deep(.dbody) .ant-select-selection-placeholder { color: var(--muted) !important; }
:deep(.dbody) .ant-select-arrow { color: var(--muted) !important; }

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
.card-maximized .expanded-mini-row {
  cursor: default;
}

/* ── Expanded area in maximized mode ── */
.cluster-list:has(.cluster-mini-bar) .expanded-area {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}

/* ── Detail modal ── */
.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-table td { padding: 6px 0; border-bottom: 1px solid var(--p-border-divider); }
.dt-label { color: var(--p-text-tertiary); font-weight: 500; width: 100px; vertical-align: top; }
.dt-value { color: var(--p-text-primary); word-break: break-all; }
.detail-section-title { font-size: 14px; font-weight: 600; margin: 16px 0 10px; color: var(--p-text-primary); }
.detail-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.detail-stat-card { background: var(--p-bg-hover); border: 1px solid var(--p-border-default); border-radius: var(--p-radius-md); padding: 12px; text-align: center; }
.detail-stat-label { font-size: 11px; color: var(--p-text-tertiary); }
.detail-stat-value { font-family: monospace; font-size: 18px; font-weight: 700; color: var(--p-text-primary); margin-top: 2px; }

/* ── Test connection ── */
.test-nodes-list { max-height: 320px; overflow-y: auto; }
.test-node-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px; border-bottom: 1px solid var(--p-border-divider); }
.test-node-row:last-child { border-bottom: none; }
.node-addr { font-family: monospace; font-size: 14px; color: var(--p-text-primary); }
.test-progress { max-height: 400px; overflow-y: auto; }
.test-log-row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; font-size: 13px; border-bottom: 1px solid var(--p-border-divider); }
.test-log-row:last-child { border-bottom: none; }
.log-msg { font-family: monospace; font-size: 12px; color: var(--p-text-primary); }

@media (max-width: 1200px) { .cluster-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .cluster-grid { grid-template-columns: 1fr; }
  .cl-header-actions { flex-direction: column; align-items: stretch; }
  .cl-header-actions .search-input-wrap { width: 100%; }
}
</style>

<style>
</style>
