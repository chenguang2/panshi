<template>
  <div class="edge-client">
    <PageHeader title="Edge 直连" description="直接连接边缘节点进行调试和数据查询" />
    <a-alert
      message="调试模式"
      description="此处操作绕过正常同步流程，直接修改边缘节点数据"
      type="warning"
      show-icon
      closable
      style="margin-bottom: 16px;"
    />

    <div class="edge-filter-bar">
      <select v-model="inputMode" class="form-input" style="width: 130px;">
        <option value="cluster">按集群选择</option>
        <option value="manual">手动输入</option>
      </select>

      <template v-if="inputMode === 'cluster'">
        <select v-model="selectedClusterId" class="form-input" style="width: 200px;" @change="onClusterChange">
          <option value="">选择集群</option>
          <option v-for="cluster in clusters" :key="cluster.id" :value="cluster.id">
            {{ cluster.display_name || cluster.name }}
          </option>
        </select>
        <select v-model="selectedNode" class="form-input" style="width: 250px;" :disabled="!selectedClusterId" @change="onNodeChange">
          <option value="">选择边缘节点</option>
          <option v-for="node in clusterNodes" :key="node.ip + ':' + node.management_port" :value="node.ip + ':' + node.management_port">
            {{ node.ip }}:{{ node.management_port }}
          </option>
        </select>
      </template>

      <template v-else>
        <input v-model="manualNode" class="form-input" placeholder="192.168.100.235:11999" style="width: 250px;" @blur="onManualInput" />
      </template>

      <button class="btn btn-primary" @click="startQuery" :disabled="loading">
        <SearchOutlined /> 查询
      </button>
      <button class="btn btn-ghost" @click="cancelQuery" :disabled="!loading">
        <CloseCircleOutlined /> 取消查询
      </button>
      <span v-if="loadedNode" class="text-muted text-sm" style="margin-left: auto;">
        已连接: {{ loadedNode }}
      </span>
    </div>

    <a-tabs v-model:activeKey="activeTab" style="margin-top: 16px;">
        <a-tab-pane key="upstreams" tab="上游">
          <div class="table-toolbar">
            <button class="btn btn-primary" @click="showUpstreamModal('create')">
              <PlusOutlined /> 添加上游
            </button>
            <div class="search-input-wrap">
              <input v-model="upstreamSearch" class="form-input" placeholder="搜索上游..." style="width: 240px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="upstreamColumns"
            :data-source="upstreamSearch ? upstreams.filter(u => (u.value?.name || '').includes(upstreamSearch) || (u.value?.id || '').includes(upstreamSearch)) : upstreams"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'name'">
                {{ record.value?.name || '-' }}
              </template>
              <template v-if="column.key === 'type'">
                {{ record.value?.type || '-' }}
              </template>
              <template v-if="column.key === 'nodes'">
                <span v-if="record.value?.nodes">
                  {{ getNodeCount(record.value.nodes) }} 个节点
                </span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showUpstreamJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" @click="showUpstreamModal('edit', record)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deleteUpstream(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="routes" tab="路由">
          <div class="table-toolbar">
            <button class="btn btn-primary" @click="showRouteModal('create')">
              <PlusOutlined /> 添加路由
            </button>
            <div class="search-input-wrap">
              <input v-model="routeSearch" class="form-input" placeholder="搜索路由..." style="width: 240px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="routeColumns"
            :data-source="routeSearch ? routes.filter(r => (r.value?.name || '').includes(routeSearch) || (r.value?.uri || '').includes(routeSearch)) : routes"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'name'">
                {{ record.value?.name || '-' }}
              </template>
              <template v-if="column.key === 'uri'">
                {{ record.value?.uri || record.value?.uris?.[0] || '-' }}
              </template>
              <template v-if="column.key === 'methods'">
                <a-tag v-for="m in (record.value?.methods || [])" :key="m" color="blue">{{ m }}</a-tag>
              </template>
              <template v-if="column.key === 'upstream'">
                {{ record.value?.upstream_id || '-' }}
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showRouteJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" @click="showRouteModal('edit', record)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deleteRoute(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="globalRules" tab="全局规则">
          <div class="table-toolbar">
            <button class="btn btn-primary" @click="showGlobalRuleModal('create')">
              <PlusOutlined /> 添加规则
            </button>
            <div class="search-input-wrap">
              <input v-model="globalRuleSearch" class="form-input" placeholder="搜索规则..." style="width: 240px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="globalRuleColumns"
            :data-source="globalRuleSearch ? globalRules.filter(r => (r.value?.desc || '').includes(globalRuleSearch) || (r.value?.id || '').includes(globalRuleSearch)) : globalRules"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'desc'">
                {{ record.value?.desc || '-' }}
              </template>
              <template v-if="column.key === 'plugins'">
                <a-tag v-if="record.value?.plugins">{{ Object.keys(record.value.plugins).length }} 个插件</a-tag>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showGlobalRuleJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" @click="showGlobalRuleModal('edit', record)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deleteGlobalRule(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="pluginConfigs" tab="插件组">
          <div class="table-toolbar">
            <button class="btn btn-primary" @click="showPluginConfigModal('create')">
              <PlusOutlined /> 添加插件组
            </button>
            <div class="search-input-wrap">
              <input v-model="pluginConfigSearch" class="form-input" placeholder="搜索插件组..." style="width: 240px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="pluginConfigColumns"
            :data-source="pluginConfigSearch ? pluginConfigs.filter(p => (p.value?.desc || '').includes(pluginConfigSearch) || (p.value?.id || '').includes(pluginConfigSearch)) : pluginConfigs"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'desc'">
                {{ record.value?.desc || '-' }}
              </template>
              <template v-if="column.key === 'plugins'">
                <a-tag v-if="record.value?.plugins">{{ Object.keys(record.value.plugins).length }} 个插件</a-tag>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'labels'">
                <span v-if="record.value?.labels">{{ Object.keys(record.value.labels).length }}</span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'hosts'">
                <span v-if="record.value?.hosts">{{ record.value.hosts.length }}</span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showPluginConfigJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" @click="showPluginConfigModal('edit', record)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deletePluginConfig(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="pluginMetadata" tab="插件元数据">
          <div class="table-toolbar">
            <button class="btn btn-primary" @click="showPluginMetadataModal('create')">
              <PlusOutlined /> 添加插件元数据
            </button>
            <button class="btn btn-ghost" @click="reloadPlugins" :disabled="reloadingPlugins">
              <ReloadOutlined /> 重新加载
            </button>
            <div class="search-input-wrap">
              <input v-model="pluginMetadataSearch" class="form-input" placeholder="搜索..." style="width: 200px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="pluginMetadataColumns"
            :data-source="pluginMetadataSearch ? pluginMetadataList.filter(m => (m.key || '').includes(pluginMetadataSearch)) : pluginMetadataList"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'name'">
                <span style="font-size: 12px;">{{ record.key?.split('/').pop() || '-' }}</span>
              </template>
              <template v-if="column.key === 'config'">
                <pre class="json-viewer-inline">{{ JSON.stringify(record.value, null, 2) }}</pre>
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showPluginMetadataJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" @click="showPluginMetadataModal('edit', record)">编辑</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deletePluginMetadata(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="pluginList" tab="插件列表">
          <div class="table-container">
          <a-table
            :columns="pluginListColumns"
            :data-source="pluginList"
            :loading="loading"
            :pagination="false"
            :row-key="(_record: any, index: number) => index"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'name'">
                <span style="font-size: 12px;">{{ record }}</span>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>
        <a-tab-pane key="streamRoutes" tab="四层代理">
          <div class="table-toolbar">
            <div class="search-input-wrap">
              <input v-model="streamRouteSearch" class="form-input" placeholder="搜索四层代理..." style="width: 200px;" />
              <span class="search-icon">🔍</span>
            </div>
          </div>
          <div class="table-container">
          <a-table
            :columns="streamRouteColumns"
            :data-source="streamRouteSearch ? streamRoutes.filter(r => (r.value?.name || '').includes(streamRouteSearch) || (r.value?.id || '').includes(streamRouteSearch)) : streamRoutes"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="text-muted">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'name'">
                {{ record.value?.name || '-' }}
              </template>
              <template v-if="column.key === 'server_port'">
                <span class="text-mono">{{ record.value?.server_port }}</span>
              </template>
              <template v-if="column.key === 'scheme'">
                {{ record.value?.upstream?.scheme || 'tcp' }}
              </template>
              <template v-if="column.key === 'server_addr'">
                {{ record.value?.server_addr || '-' }}
              </template>
              <template v-if="column.key === 'remote_addr'">
                {{ record.value?.remote_addr || '-' }}
              </template>
              <template v-if="column.key === 'sni'">
                {{ record.value?.sni || '-' }}
              </template>
              <template v-if="column.key === 'upstream_nodes'">
                <span v-if="record.value?.upstream?.nodes">{{ Object.keys(record.value.upstream.nodes).length }} 个节点</span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <div class="node-actions-wrap">
                  <button class="btn btn-ghost btn-sm" @click="showStreamRouteJson(record)">JSON</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="deleteStreamRoute(record)">删除</button>
                </div>
              </template>
            </template>
          </a-table>
          </div>
        </a-tab-pane>
      </a-tabs>

    <!-- 上游 Modal -->
    <div class="modal-overlay" :style="{ display: upstreamModalVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ upstreamModalMode === 'create' ? '添加上游' : '编辑上游' }}</h2>
          <button class="modal-close" @click="upstreamModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">名称</label>
            <input v-model="upstreamForm.name" class="form-input" placeholder="上游名称" />
          </div>
          <div class="form-group">
            <label class="form-label">类型</label>
            <select v-model="upstreamForm.type" class="form-input">
              <option value="roundrobin">roundrobin</option>
              <option value="chash">chash</option>
              <option value="ewma">ewma</option>
              <option value="least_conn">least_conn</option>
            </select>
          </div>
          <template v-if="upstreamForm.type === 'chash'">
            <div class="form-group">
              <label class="form-label">哈希位置</label>
              <select v-model="upstreamForm.hash_on" class="form-input">
                <option value="header">HTTP请求头</option>
                <option value="cookie">Cookie</option>
                <option value="vars">内置变量</option>
                <option value="vars_combinations">自定义变量</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Key</label>
              <input v-model="upstreamForm.key" class="form-input" placeholder="remote_addr" />
              <div class="form-hint">hash_on=内置变量时: remote_addr / uri / host / server_name / query_string / arg_xxx</div>
            </div>
          </template>
          <div class="form-group">
            <label class="form-label">节点</label>
            <div v-for="(node, index) in upstreamForm.nodes" :key="index" style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input v-model="node.host" class="form-input" placeholder="127.0.0.1:1980" style="width: 200px;" />
              <input v-model.number="node.weight" type="number" class="form-input" placeholder="权重" style="width: 100px;" />
              <button class="btn btn-sm" style="color:var(--danger)" @click="removeNode(index)">删除</button>
            </div>
            <button class="btn btn-ghost" @click="addNode">+ 添加节点</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="upstreamModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleUpstreamSubmit">{{ upstreamModalMode === 'create' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 路由 Modal -->
    <div class="modal-overlay" :style="{ display: routeModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ routeModalMode === 'create' ? '添加路由' : '编辑路由' }}</h2>
          <button class="modal-close" @click="routeModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">名称</label>
            <input v-model="routeForm.name" class="form-input" placeholder="路由名称" />
          </div>
          <div class="form-group">
            <label class="form-label">URI</label>
            <input v-model="routeForm.uri" class="form-input" placeholder="/api/*" />
          </div>
          <div class="form-group">
            <label class="form-label">请求方法</label>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
              <label v-for="m in ['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS','CONNECT','TRACE']" :key="m" class="checkbox-label" style="font-size:12px;">
                <input type="checkbox" :value="m" v-model="routeForm.methods" />
                {{ m }}
              </label>
              <a style="margin-left:4px;font-size:12px;cursor:pointer;white-space:nowrap" @click="toggleAllMethods">
                {{ allMethodsSelected ? '取消全选' : '全选' }}
              </a>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">域名</label>
            <input v-model="routeForm.hosts" class="form-input" placeholder="example.com,*.example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">优先级</label>
            <input v-model.number="routeForm.priority" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">上游</label>
            <select v-model="routeForm.upstream_id" class="form-input">
              <option value="">请选择上游</option>
              <option v-for="u in upstreams" :key="u.value?.id || u.key" :value="u.value?.id || u.key">
                {{ u.value?.name || u.value?.id || u.key }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">插件配置 (JSON)</label>
            <textarea v-model="routeForm.pluginsJson" class="form-input" :rows="4" placeholder='{"proxy_rewrite": {...}}' style="resize:vertical;"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">高级匹配</label>
            <label class="toggle"><input type="checkbox" :checked="routeForm.advancedMatchEnabled" @change="routeForm.advancedMatchEnabled = !routeForm.advancedMatchEnabled" /><span class="toggle-slider"></span></label>
            <span style="margin-left: 12px; color: var(--muted); font-size: 12px;">开启后配置请求匹配条件</span>
          </div>
          <div v-if="routeForm.advancedMatchEnabled" class="advanced-tab" style="margin-bottom:12px;">
            <RouteAdvancedMatch
              :enabled="routeForm.advancedMatchEnabled"
              :model-value="{ vars: routeForm.advancedMatch.vars }"
              @update:model-value="(val: any) => { routeForm.advancedMatch.vars = val.vars || []; }"
            />
          </div>
          <div v-else-if="routeForm.advancedMatchEnabled === false && routeForm.advancedMatch.vars.length > 0" style="margin-bottom: 12px;">
            <WarningOutlined style="color: var(--warning); margin-right: 8px;" />
            <span style="color: var(--muted); font-size: 12px;">高级匹配已配置，但未启用</span>
          </div>

          <div style="border-top:1px solid var(--border);margin:8px 0;"></div>
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">关联插件组</div>
          <div v-if="pluginConfigs.length === 0" style="padding: 16px 0; text-align: center; color: var(--muted); font-size: 12px;">
            暂无插件组
          </div>
          <div v-else style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 240px; overflow-y: auto;">
            <div
              v-for="pg in pluginConfigs"
              :key="pg.value?.id || pg.key"
              class="plugin-config-card"
              :class="{ selected: isPluginGroupSelected(pg.value?.id || pg.key) }"
              @click="togglePluginGroup(pg)"
              style="width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 10px; cursor: pointer; transition: all 0.2s; background: var(--bg);"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <input type="checkbox" :checked="isPluginGroupSelected(pg.value?.id || pg.key)" @click.stop="togglePluginGroup(pg)" style="width:16px;height:16px;accent-color:var(--accent);" />
                <strong style="font-size: 13px; flex: 1; margin-left: 8px;">{{ pg.value?.id || pg.key }}</strong>
                <span style="font-size: 11px; color: var(--muted);">v{{ pg.value?.current_version || 0 }}</span>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-left: 24px;">
                <a-tag
                  v-for="(_pcfg, pname) in (typeof pg.value?.plugins === 'string' ? JSON.parse(pg.value.plugins) : (pg.value?.plugins || {}))"
                  :key="pname"
                  color="blue"
                  style="font-size: 11px;"
                >
                  {{ pname }}
                </a-tag>
              </div>
              <div v-if="pg.value?.desc" style="font-size: 11px; color: var(--muted); margin-left: 24px; margin-top: 4px;">{{ pg.value?.desc }}</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="routeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleRouteSubmit">{{ routeModalMode === 'create' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- JSON 数据 Modal -->
    <div class="modal-overlay" :style="{ display: jsonModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>JSON 数据</h2>
          <button class="modal-close" @click="jsonModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <pre class="json-viewer">{{ jsonContent }}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="jsonModalVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 全局规则 Modal -->
    <div class="modal-overlay" :style="{ display: globalRuleModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ globalRuleModalMode === 'create' ? '添加全局规则' : '编辑全局规则' }}</h2>
          <button class="modal-close" @click="globalRuleModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">规则ID</label>
            <input v-model="globalRuleForm.id" class="form-input" placeholder="如: 6001" :disabled="globalRuleModalMode === 'edit'" />
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <input v-model="globalRuleForm.desc" class="form-input" placeholder="规则描述" />
          </div>
          <div class="form-group">
            <label class="form-label">插件配置 (JSON)</label>
            <textarea v-model="globalRuleForm.pluginsJson" class="form-input" :rows="6" placeholder='{"plugin_name": {"option": "value"}}' style="resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="globalRuleModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleGlobalRuleSubmit">{{ globalRuleModalMode === 'create' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 插件组 Modal -->
    <div class="modal-overlay" :style="{ display: pluginConfigModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ pluginConfigModalMode === 'create' ? '添加插件组' : '编辑插件组' }}</h2>
          <button class="modal-close" @click="pluginConfigModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">配置ID</label>
            <input v-model="pluginConfigForm.id" class="form-input" placeholder="如: 5001" :disabled="pluginConfigModalMode === 'edit'" />
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <input v-model="pluginConfigForm.desc" class="form-input" placeholder="配置描述" />
          </div>
          <div class="form-group">
            <label class="form-label">插件配置 (JSON)</label>
            <textarea v-model="pluginConfigForm.pluginsJson" class="form-input" :rows="6" placeholder='{"plugin_name": {"option": "value"}}' style="resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="pluginConfigModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handlePluginConfigSubmit">{{ pluginConfigModalMode === 'create' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 插件元数据 Modal -->
    <div class="modal-overlay" :style="{ display: pluginMetadataModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ pluginMetadataModalMode === 'create' ? '添加插件元数据' : '编辑插件元数据' }}</h2>
          <button class="modal-close" @click="pluginMetadataModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">插件名称</label>
            <input v-model="pluginMetadataForm.name" class="form-input" placeholder="如: log_process" :disabled="pluginMetadataModalMode === 'edit'" />
          </div>
          <div class="form-group">
            <label class="form-label">配置数据 (JSON)</label>
            <textarea v-model="pluginMetadataForm.configJson" class="form-input" :rows="8" placeholder='{"option": "value"}' style="resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="pluginMetadataModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handlePluginMetadataSubmit">{{ pluginMetadataModalMode === 'create' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, onUnmounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, CloseCircleOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import { useProgressModal } from '@/composables/useProgressModal'
import { upstreamColumns, routeColumns, pluginMetadataColumns, pluginListColumns, globalRuleColumns, pluginConfigColumns, streamRouteColumns } from '@/utils/edgeColumns'

const inputMode = ref<'cluster' | 'manual'>('cluster')
const clusters = ref<any[]>([])
const selectedClusterId = ref<string | null>(null)
const clusterNodes = ref<any[]>([])
const selectedNode = ref<string | null>(null)
const manualNode = ref('')
const activeTab = ref('upstreams')
const loading = ref(false)
const loadedNode = ref('')
const currentSignal = ref<AbortSignal | undefined>(undefined)

// AbortController for cancel query
let abortController: AbortController | null = null

function cancelQuery() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  loading.value = false
  loadedNode.value = ''
}

onUnmounted(() => {
  cancelQuery()
})

const upstreams = ref<any[]>([])
const routes = ref<any[]>([])
const globalRules = ref<any[]>([])
const pluginConfigs = ref<any[]>([])
const pluginMetadataList = ref<any[]>([])
const pluginList = ref<any[]>([])
const streamRoutes = ref<any[]>([])
const reloadingPlugins = ref(false)

const upstreamSearch = ref('')
const routeSearch = ref('')
const globalRuleSearch = ref('')
const pluginConfigSearch = ref('')
const pluginMetadataSearch = ref('')
const streamRouteSearch = ref('')

const upstreamModalVisible = ref(false)
const upstreamModalMode = ref<'create' | 'edit'>('create')
const upstreamEditRecord = ref<any>(null)
const upstreamForm = reactive({
  name: '',
  type: 'roundrobin',
  nodes: [] as { host: string; weight: number }[],
  hash_on: 'vars',
  key: '',
})

watch(() => upstreamForm.type, (newType) => {
  if (newType !== 'chash') {
    upstreamForm.hash_on = 'vars'
    upstreamForm.key = ''
  }
})

const routeModalVisible = ref(false)
const routeModalMode = ref<'create' | 'edit'>('create')
const routeEditRecord = ref<any>(null)
const routeForm = reactive({
  name: '',
  uri: '',
  methods: [] as string[],
  hosts: '',
  priority: 0,
  upstream_id: '',
  pluginsJson: '',
  plugin_config_ids: [] as string[],
  advancedMatchEnabled: false,
  advancedMatch: { vars: [] as [string, string, string][] }
})

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']
const allMethodsSelected = computed(() => ALL_METHODS.every(m => routeForm.methods.includes(m)))
const toggleAllMethods = () => {
  routeForm.methods = allMethodsSelected.value ? [] : [...ALL_METHODS]
}

const jsonModalVisible = ref(false)
const jsonContent = ref('')

const globalRuleModalVisible = ref(false)
const globalRuleModalMode = ref<'create' | 'edit'>('create')
const globalRuleForm = reactive({
  id: '',
  desc: '',
  pluginsJson: ''
})

const pluginConfigModalVisible = ref(false)
const pluginConfigModalMode = ref<'create' | 'edit'>('create')
const pluginConfigForm = reactive({
  id: '',
  desc: '',
  pluginsJson: ''
})

const pluginMetadataModalVisible = ref(false)
const pluginMetadataModalMode = ref<'create' | 'edit'>('create')
const pluginMetadataForm = reactive({
  name: '',
  configJson: ''
})

const loadClusters = async () => {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch (error: any) {
    message.error('加载集群列表失败: ' + (error.response?.data?.detail || error.message))
  }
}

const onClusterChange = async () => {
  selectedNode.value = null
  clusterNodes.value = []

  if (!selectedClusterId.value) return

  try {
    const res = await api.get(`/clusters/${selectedClusterId.value}/nodes`)
    clusterNodes.value = res.data?.items || []
  } catch (error: any) {
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
  }
}

const onNodeChange = async () => {
  await loadAllData()
}

const onManualInput = () => {
  const value = manualNode.value.trim()
  if (value && value.includes(':')) {
    selectedNode.value = value
  }
}

// 单独加载各标签页数据
const loadUpstreams = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/upstreams`, { signal: currentSignal.value })
    upstreams.value = res.data.upstreams || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadUpstreams error:', error)
  }
}

const loadRoutes = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/routes`, { signal: currentSignal.value })
    routes.value = res.data.routes || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadRoutes error:', error)
  }
}

const loadGlobalRules = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/global_rules`, { signal: currentSignal.value })
    globalRules.value = res.data.global_rules || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadGlobalRules error:', error)
  }
}

const loadPluginConfigs = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugin_configs`, { signal: currentSignal.value })
    pluginConfigs.value = res.data.plugin_configs || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadPluginConfigs error:', error)
  }
}

const loadPluginMetadata = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugin_metadata`, { signal: currentSignal.value })
    pluginMetadataList.value = res.data.plugin_metadata || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadPluginMetadata error:', error)
  }
}

const loadPluginList = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugins/list`, { signal: currentSignal.value })
    pluginList.value = res.data.plugins || []
  } catch (error: any) {
    console.error('[DEBUG] loadPluginList error:', error)
  }
}

const loadStreamRoutes = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/stream-routes`, { signal: currentSignal.value })
    streamRoutes.value = res.data.stream_routes || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadStreamRoutes error:', error)
  }
}

// 预加载所有标签页数据（并行）
const loadAllData = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  
  // Create abort signal for this query
  abortController = new AbortController()
  currentSignal.value = abortController.signal
  
  loading.value = true

  try {
    await Promise.all([
      loadUpstreams(ip, port),
      loadRoutes(ip, port),
      loadGlobalRules(ip, port),
      loadPluginConfigs(ip, port),
      loadPluginMetadata(ip, port),
      loadPluginList(ip, port),
      loadStreamRoutes(ip, port)
    ])
    loadedNode.value = `${ip}:${port}`
  } catch (error: any) {
    console.error('[DEBUG] loadAllData error:', error)
    message.error('加载数据失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

// 单个标签页加载（保留用于切换标签时快速刷新）
const loadData = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')

  switch (activeTab.value) {
    case 'upstreams': await loadUpstreams(ip, port); break
    case 'routes': await loadRoutes(ip, port); break
    case 'globalRules': await loadGlobalRules(ip, port); break
    case 'pluginConfigs': await loadPluginConfigs(ip, port); break
    case 'pluginMetadata': await loadPluginMetadata(ip, port); break
    case 'pluginList': await loadPluginList(ip, port); break
    case 'streamRoutes': await loadStreamRoutes(ip, port); break
  }
}

const startQuery = async () => {
  await loadAllData()
}


const getNodeCount = (nodes: any) => {
  if (Array.isArray(nodes)) return nodes.length
  if (typeof nodes === 'object') return Object.keys(nodes).length
  return 0
}

const showUpstreamModal = (mode: 'create' | 'edit', record?: any) => {
  upstreamModalMode.value = mode
  upstreamEditRecord.value = mode === 'edit' ? record : null
  if (mode === 'edit' && record?.value) {
    upstreamForm.name = record.value.name || ''
    upstreamForm.type = record.value.type || 'roundrobin'
    upstreamForm.hash_on = (record.value as any).hash_on || 'vars'
    upstreamForm.key = (record.value as any).key || ''
    upstreamForm.nodes = []
    if (record.value.nodes) {
      if (Array.isArray(record.value.nodes)) {
        record.value.nodes.forEach((n: any) => {
          upstreamForm.nodes.push({ host: `${n.host}:${n.port}`, weight: n.weight || 1 })
        })
      } else {
        Object.entries(record.value.nodes).forEach(([host, weight]: [string, any]) => {
          upstreamForm.nodes.push({ host, weight })
        })
      }
    }
  } else {
    upstreamForm.name = ''
    upstreamForm.type = 'roundrobin'
    upstreamForm.hash_on = 'vars'
    upstreamForm.key = ''
    upstreamForm.nodes = [{ host: '', weight: 1 }]
  }
  upstreamModalVisible.value = true
}

const addNode = () => {
  upstreamForm.nodes.push({ host: '', weight: 1 })
}

const removeNode = (index: number) => {
  upstreamForm.nodes.splice(index, 1)
}

const handleUpstreamSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  const nodesObj: Record<string, number> = {}
  upstreamForm.nodes.forEach(n => {
    if (n.host) nodesObj[n.host] = n.weight
  })

  const payload: Record<string, any> = {
    type: upstreamForm.type,
    name: upstreamForm.name || undefined,
    nodes: nodesObj
  }

  if (upstreamForm.type === 'chash') {
    payload.hash_on = upstreamForm.hash_on
    if (upstreamForm.hash_on === 'vars' && upstreamForm.key) {
      const VARS_KEY_PATTERN = /^((uri|server_name|server_addr|request_uri|remote_port|remote_addr|query_string|host|hostname)|arg_[0-9a-zA-Z_-]+)$/
      if (!VARS_KEY_PATTERN.test(upstreamForm.key)) {
        message.error('Key 格式无效，内置变量模式请输入 remote_addr、uri、arg_xxx 等有效变量')
        return
      }
    }
    payload.key = upstreamForm.key || undefined
  }

  const action = upstreamModalMode.value === 'create' ? '创建' : '更新'
  const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
  const { addLog, updateContent, done } = useProgressModal(`${action}上游: ${payload.name || upstreamForm.name}`, progress)

  upstreamModalVisible.value = false
  addLog(`开始${action}上游: ${payload.name || upstreamForm.name}`)
  addLog(`节点数: ${upstreamForm.nodes.length}, 节点数据: ${JSON.stringify(upstreamForm.nodes)}`)
  addLog(`payload.nodes: ${JSON.stringify(nodesObj)}`)
  progress.percent = 10
  updateContent()

  await new Promise(r => setTimeout(r, 300))

  try {
    addLog('正在构建配置...')
    progress.percent = 30
    updateContent()

    let res
    if (upstreamModalMode.value === 'create') {
      res = await api.post(`/edge-client/nodes/${ip}/${port}/upstreams`, payload)
      addLog('上游已创建')
    } else {
      const upstreamId = upstreamEditRecord.value?.value?.id
      if (!upstreamId) {
        addLog('错误: 无法获取上游 ID')
        progress.percent = 100
        progress.status = 'exception'
        updateContent()
        done()
        return
      }
      res = await api.put(`/edge-client/nodes/${ip}/${port}/upstreams/${upstreamId}`, payload)
      addLog('上游已更新')
    }

    progress.percent = 70
    addLog(`节点: ${ip}:${port}`)
    if (res?.data) {
      addLog(`响应: ${JSON.stringify(res.data).substring(0, 800)}`)
    }
    progress.percent = 100
    progress.status = 'success'
    addLog('')
    addLog(`✅ ${action}成功`)
    updateContent()
    done()
    await loadData()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ ${action}失败: ${errMsg}`)
    updateContent()
    done()
  }
}

const showUpstreamJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deleteUpstream = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const upstreamId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除上游 ${record.value?.name || upstreamId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/upstreams/${upstreamId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showRouteModal = (mode: 'create' | 'edit', record?: any) => {
  routeModalMode.value = mode
  routeEditRecord.value = mode === 'edit' ? record : null
  if (mode === 'edit' && record?.value) {
    routeForm.name = record.value.name || ''
    routeForm.uri = record.value.uri || record.value.uris?.[0] || ''
    routeForm.methods = record.value.methods || []
    routeForm.hosts = record.value.hosts?.join(', ') || ''
    routeForm.priority = record.value.priority || 0
    routeForm.upstream_id = record.value.upstream_id || ''
    routeForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
    routeForm.plugin_config_ids = record.value.plugin_config_ids ? [...record.value.plugin_config_ids] : []
    const existingVars = record.value.vars || []
    routeForm.advancedMatchEnabled = record.value.advanced_match_enabled || existingVars.length > 0
    routeForm.advancedMatch = { vars: [...existingVars] }
  } else {
    routeForm.name = ''
    routeForm.uri = ''
    routeForm.methods = []
    routeForm.hosts = ''
    routeForm.priority = 0
    routeForm.upstream_id = ''
    routeForm.pluginsJson = ''
    routeForm.plugin_config_ids = []
    routeForm.advancedMatchEnabled = false
    routeForm.advancedMatch = { vars: [] }
  }
  routeModalVisible.value = true
}

const getPluginGroupId = (pg: any) => {
  return pg.value?.id || pg.key?.split('/').pop() || pg.id
}

const isPluginGroupSelected = (edgeUuid: string) => {
  return routeForm.plugin_config_ids.indexOf(edgeUuid) !== -1
}

const togglePluginGroup = (pg: any) => {
  const edgeUuid = getPluginGroupId(pg)
  const idx = routeForm.plugin_config_ids.indexOf(edgeUuid)
  if (idx !== -1) {
    routeForm.plugin_config_ids.splice(idx, 1)
  } else {
    routeForm.plugin_config_ids.push(edgeUuid)
  }
}

const handleRouteSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')

  let plugins: any = undefined
  if (routeForm.pluginsJson) {
    try {
      plugins = JSON.parse(routeForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }

  const payload: Record<string, any> = {
    name: routeForm.name || undefined,
    uri: routeForm.uri || undefined,
    methods: routeForm.methods.length ? routeForm.methods : undefined,
    hosts: routeForm.hosts ? routeForm.hosts.split(',').map(h => h.trim()) : undefined,
    priority: routeForm.priority || 0,
    upstream_id: routeForm.upstream_id || undefined,
    plugins
  }

  if (routeForm.plugin_config_ids.length > 0) {
    payload.plugin_config_ids = routeForm.plugin_config_ids
  }

  if (routeForm.advancedMatchEnabled) {
    payload.advanced_match_enabled = true
    if (routeForm.advancedMatch.vars.length > 0) {
      payload.vars = routeForm.advancedMatch.vars
    }
  }

  const action = routeModalMode.value === 'create' ? '创建' : '更新'
  const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
  const { addLog, updateContent, done } = useProgressModal(`${action}路由: ${payload.name || routeForm.name}`, progress)

  routeModalVisible.value = false
  addLog(`开始${action}路由: ${payload.name || routeForm.name}`)
  progress.percent = 10
  updateContent()

  await new Promise(r => setTimeout(r, 300))

  try {
    addLog('正在构建配置...')
    progress.percent = 30
    updateContent()

    if (routeModalMode.value === 'create') {
      await api.post(`/edge-client/nodes/${ip}/${port}/routes`, payload)
      addLog('路由已创建')
    } else {
      const routeId = routeEditRecord.value?.value?.id
      if (!routeId) {
        addLog('错误: 无法获取路由 ID')
        progress.percent = 100
        progress.status = 'exception'
        updateContent()
        done()
        return
      }
      await api.put(`/edge-client/nodes/${ip}/${port}/routes/${routeId}`, payload)
      addLog('路由已更新')
    }

    progress.percent = 100
    progress.status = 'success'
    addLog('')
    addLog(`✅ ${action}成功`)
    updateContent()
    done()
    await loadData()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ ${action}失败: ${errMsg}`)
    updateContent()
    done()
  }
}

const deleteRoute = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const routeId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除路由 ${record.value?.name || routeId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/routes/${routeId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showRouteJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const showGlobalRuleModal = (mode: 'create' | 'edit', record?: any) => {
  globalRuleModalMode.value = mode
  if (mode === 'edit' && record?.value) {
    globalRuleForm.id = record.value.id || ''
    globalRuleForm.desc = record.value.desc || ''
    globalRuleForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
  } else {
    globalRuleForm.id = ''
    globalRuleForm.desc = ''
    globalRuleForm.pluginsJson = ''
  }
  globalRuleModalVisible.value = true
}

const handleGlobalRuleSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let plugins: any = undefined
  if (globalRuleForm.pluginsJson) {
    try {
      plugins = JSON.parse(globalRuleForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }

  const payload = {
    desc: globalRuleForm.desc || undefined,
    plugins
  }

  const action = globalRuleModalMode.value === 'create' ? '创建' : '更新'
  const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
  const { addLog, updateContent, done } = useProgressModal(`${action}全局规则: ${globalRuleForm.id}`, progress)

  globalRuleModalVisible.value = false
  addLog(`开始${action}全局规则: ${globalRuleForm.id}`)
  progress.percent = 10
  updateContent()

  await new Promise(r => setTimeout(r, 300))

  try {
    addLog('正在构建配置...')
    progress.percent = 30
    updateContent()

    if (globalRuleModalMode.value === 'create') {
      await api.put(`/edge-client/nodes/${ip}/${port}/global_rules/${globalRuleForm.id}`, payload)
      addLog('全局规则已创建')
    } else {
      await api.patch(`/edge-client/nodes/${ip}/${port}/global_rules/${globalRuleForm.id}`, payload)
      addLog('全局规则已更新')
    }

    progress.percent = 100
    progress.status = 'success'
    addLog('')
    addLog(`✅ ${action}成功`)
    updateContent()
    done()
    await loadData()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ ${action}失败: ${errMsg}`)
    updateContent()
    done()
  }
}

const showGlobalRuleJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const showPluginConfigModal = (mode: 'create' | 'edit', record?: any) => {
  pluginConfigModalMode.value = mode
  if (mode === 'edit' && record?.value) {
    pluginConfigForm.id = record.value.id || ''
    pluginConfigForm.desc = record.value.desc || ''
    pluginConfigForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
  } else {
    pluginConfigForm.id = ''
    pluginConfigForm.desc = ''
    pluginConfigForm.pluginsJson = ''
  }
  pluginConfigModalVisible.value = true
}

const handlePluginConfigSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let plugins: any = undefined
  if (pluginConfigForm.pluginsJson) {
    try {
      plugins = JSON.parse(pluginConfigForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }

  const payload: any = {
    desc: pluginConfigForm.desc || undefined,
    plugins
  }

  const action = pluginConfigModalMode.value === 'create' ? '创建' : '更新'
  const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
  const { addLog, updateContent, done } = useProgressModal(`${action}插件组: ${pluginConfigForm.id}`, progress)

  pluginConfigModalVisible.value = false
  addLog(`开始${action}插件组: ${pluginConfigForm.id}`)
  progress.percent = 10
  updateContent()

  await new Promise(r => setTimeout(r, 300))

  try {
    addLog('正在构建配置...')
    progress.percent = 30
    updateContent()

    if (pluginConfigModalMode.value === 'create') {
      await api.put(`/edge-client/nodes/${ip}/${port}/plugin_configs/${pluginConfigForm.id}`, payload)
      addLog('插件组已创建')
    } else {
      await api.patch(`/edge-client/nodes/${ip}/${port}/plugin_configs/${pluginConfigForm.id}`, payload)
      addLog('插件组已更新')
    }

    progress.percent = 100
    progress.status = 'success'
    addLog('')
    addLog(`✅ ${action}成功`)
    updateContent()
    done()
    await loadData()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ ${action}失败: ${errMsg}`)
    updateContent()
    done()
  }
}

const showPluginConfigJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deletePluginConfig = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const configId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除插件组 ${record.value?.desc || configId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/plugin_configs/${configId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showPluginMetadataModal = (mode: 'create' | 'edit', record?: any) => {
  pluginMetadataModalMode.value = mode
  if (mode === 'edit' && record?.key) {
    const pluginName = record.key?.split('/').pop() || ''
    pluginMetadataForm.name = pluginName
    pluginMetadataForm.configJson = record.value ? JSON.stringify(record.value, null, 2) : ''
  } else {
    pluginMetadataForm.name = ''
    pluginMetadataForm.configJson = ''
  }
  pluginMetadataModalVisible.value = true
}

const handlePluginMetadataSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let config: any = undefined
  if (pluginMetadataForm.configJson) {
    try {
      config = JSON.parse(pluginMetadataForm.configJson)
    } catch {
      message.error('配置数据JSON格式无效')
      return
    }
  }

  const action = pluginMetadataModalMode.value === 'create' ? '创建' : '更新'
  const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
  const { addLog, updateContent, done } = useProgressModal(`${action}插件元数据: ${pluginMetadataForm.name}`, progress)

  pluginMetadataModalVisible.value = false
  addLog(`开始${action}插件元数据: ${pluginMetadataForm.name}`)
  progress.percent = 10
  updateContent()

  await new Promise(r => setTimeout(r, 300))

  try {
    addLog('正在构建配置...')
    progress.percent = 30
    updateContent()

    await api.put(`/edge-client/nodes/${ip}/${port}/plugin_metadata/${pluginMetadataForm.name}`, config || {})
    addLog(`插件元数据已${action === '创建' ? '创建' : '更新'}`)

    progress.percent = 100
    progress.status = 'success'
    addLog('')
    addLog(`✅ ${action}成功`)
    updateContent()
    done()
    await loadData()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ ${action}失败: ${errMsg}`)
    updateContent()
    done()
  }
}

const showPluginMetadataJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deletePluginMetadata = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const pluginName = record.key?.split('/').pop()

  Modal.confirm({
    title: '确认删除',
    content: `确定删除插件数据 ${pluginName}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/plugin_metadata/${pluginName}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showStreamRouteJson = (record: any) => {
  jsonContent.value = JSON.stringify(record.value || record, null, 2)
  jsonModalVisible.value = true
}

const deleteStreamRoute = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return
  const [ip, port] = node.split(':')
  const routeId = record.value?.id || record.key
  Modal.confirm({
    title: '确认删除',
    content: `确定删除四层代理 ${routeId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/stream-routes/${routeId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const reloadPlugins = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  reloadingPlugins.value = true
  try {
    await api.put(`/edge-client/nodes/${ip}/${port}/plugins/reload`)
    message.success('插件重新加载成功')
  } catch (error: any) {
    message.error('重新加载失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    reloadingPlugins.value = false
  }
}

const deleteGlobalRule = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const ruleId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除全局规则 ${record.value?.desc || ruleId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/global_rules/${ruleId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

onMounted(async () => {
  await loadClusters()
  // Auto-select first cluster and load node list for dropdown
  if (clusters.value.length > 0) {
    selectedClusterId.value = clusters.value[0].id
    try {
      const res = await api.get(`/clusters/${clusters.value[0].id}/nodes`)
      clusterNodes.value = res.data?.items || []
      if (clusterNodes.value.length > 0) {
        selectedNode.value = clusterNodes.value[0].ip + ':' + clusterNodes.value[0].management_port
      }
    } catch (error: any) {
      message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
    }
  }
})

// Watch for cluster changes to load nodes
watch(selectedClusterId, async (newClusterId, oldClusterId) => {
  if (!newClusterId) return
  // Skip if this is the initial load (oldClusterId is undefined)
  if (oldClusterId === undefined) return
  // This fires on user manual cluster change, not on initial auto-selection
  selectedNode.value = null
  clusterNodes.value = []
  try {
    const res = await api.get(`/clusters/${newClusterId}/nodes`)
    clusterNodes.value = res.data?.items || []
    // Auto-select first node on user cluster change
    if (clusterNodes.value.length > 0) {
      selectedNode.value = clusterNodes.value[0].ip + ':' + clusterNodes.value[0].management_port
    }
  } catch (error: any) {
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
  }
})

// Watch for node changes to load data
watch(selectedNode, async (_newNode) => {
  // 不再自动调用查询，用户点击「查询」按钮才加载
})
</script>

<style scoped>
.edge-client {
  padding: 20px 24px;
}

/* ── Filter bar (节点选择器) ── */
.edge-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }

/* ── 表格外框 ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-container :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
}

/* ── 表头 ── */
:deep(.ant-table-thead > tr > th) {
  background: oklch(97% 0.005 250) !important;
  padding: 10px 16px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  color: var(--muted) !important;
  white-space: nowrap !important;
  user-select: none !important;
  border-bottom: 1px solid var(--border) !important;
}
:deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
:deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px !important;
  font-size: 13px !important;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
:deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
:deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

/* ── Table toolbar per tab ── */
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

/* ── Action button group in table rows ── */
.node-actions-wrap {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
}

/* ── Plugin config cards in route modal ── */
.plugin-config-card:hover {
  border-color: var(--accent) !important;
}
.edge-client .plugin-card.selected {
  border-color: var(--accent) !important;
  background: oklch(56% 0.16 210 / 10%) !important;
}

/* ── JSON viewer ── */
.json-viewer {
  max-height: 500px;
  overflow: auto;
  background: #1a1b1e;
  color: #e0e0e0;
  padding: 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-family: var(--font-mono, var(--font-mono));
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-viewer-inline {
  max-width: 400px;
  overflow: auto;
  font-size: 11px;
  font-family: var(--font-mono, var(--font-mono));
  background: transparent;
  color: var(--muted);
}

/* ── JSON viewer ── */
:deep(.json-viewer) {
  max-height: 500px;
  overflow: auto;
  background: #1a1b1e;
  color: #e0e0e0;
  padding: 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-family: var(--font-mono, var(--font-mono));
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>