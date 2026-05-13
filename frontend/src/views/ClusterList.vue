<template>
  <div class="cluster-list">
    <div class="header-actions">
      <h2>集群管理</h2>
      <a-button type="primary" @click="showAddModal">添加集群</a-button>
    </div>

    <a-row :gutter="[16, 16]" class="cluster-grid">
      <a-col :span="24" v-for="cluster in clusters" :key="cluster.id">
        <a-card :bordered="true" class="cluster-card" hoverable>
          <template #title>
            <div class="card-title">
              <CloudOutlined />
              <span class="cluster-title-name">
                {{ cluster.display_name || cluster.name }}
                <span class="cluster-name-hint" v-if="cluster.display_name">({{ cluster.name }})</span>
              </span>
              <span class="stat-item-inline">
                <TeamOutlined /> 节点: {{ cluster.healthy_node_count }}/{{ cluster.node_count }}
              </span>
              <span class="stat-item-inline">
                <CloudServerOutlined /> 上游: {{ cluster.upstream_count }}
              </span>
              <span class="stat-item-inline">
                <GatewayOutlined /> 路由: {{ cluster.route_count }}
              </span>
            </div>
          </template>
          <template #extra>
            <div class="title-actions">
              <a-button size="small" @click="editCluster(cluster)">编辑</a-button>
              <a-button size="small" danger @click="deleteCluster(cluster)">删除</a-button>
            </div>
          </template>
          <a-tabs v-model:activeKey="cluster.activeTab" size="small" class="cluster-tabs" @tabClick="(key: string) => handleTabClick(cluster, key)">
            <a-tab-pane key="nodes" tab="集群节点"></a-tab-pane>
            <a-tab-pane key="upstreams" tab="上游" :disabled="!cluster.nodes || cluster.nodes.length === 0"></a-tab-pane>
            <a-tab-pane key="routes" tab="路由" :disabled="!cluster.upstreams || cluster.upstreams.length === 0"></a-tab-pane>
            <a-tab-pane key="pluginConfigs" tab="插件组"></a-tab-pane>
            <a-tab-pane key="globalPlugins" tab="插件元数据"></a-tab-pane>
          </a-tabs>
          <div v-if="cluster.activeTab === 'upstreams'" class="tab-content">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddUpstreamModal(cluster)">添加上游</a-button>
              <a-button size="small" @click="editUpstream(cluster)" :disabled="!cluster.selectedUpstream">编辑上游</a-button>
              <a-button size="small" danger :disabled="!cluster.selectedUpstream" @click="deleteUpstream(cluster)">删除上游</a-button>
              <a-divider type="vertical" />
              <a-button size="small" @click="publishUpstream(cluster)" :disabled="!cluster.selectedUpstream">发布</a-button>
              <a-button size="small" @click="openUpstreamVersionManagement(cluster)" :disabled="!cluster.selectedUpstream">版本管理</a-button>
              <a-divider type="vertical" />
              <a-popover v-model:open="upstreamColumnPopoverVisible" trigger="click" placement="bottomRight">
                <template #title>选择显示列</template>
                <template #content>
                  <div style="min-width: 400px;">
                    <div style="font-weight: 500; margin-bottom: 8px;">列选择</div>
                    <a-checkbox-group v-model:value="upstreamColumnsSelected">
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <div v-for="col in allUpstreamColumns" :key="col.key" style="margin-bottom: 4px;">
                          <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                        </div>
                      </div>
                    </a-checkbox-group>
                    <a-divider style="margin: 12px 0;" />
                    <div style="font-weight: 500; margin-bottom: 8px;">操作按钮</div>
                    <a-checkbox-group v-model:value="upstreamActionsSelected">
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <div v-for="btn in allUpstreamActionButtons" :key="btn.key" style="margin-bottom: 4px;">
                          <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                        </div>
                      </div>
                    </a-checkbox-group>
                    <a-divider style="margin: 12px 0;" />
                    <div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
                    <a-checkbox v-model:checked="upstreamSearchVisible">显示搜索框</a-checkbox>
                  </div>
                </template>
                <a-button size="small">列配置</a-button>
              </a-popover>
            </div>
            <div v-if="upstreamSearchVisible" style="margin: 8px 0; display: flex; gap: 8px; align-items: center;">
              <a-input-search
                v-model:value="cluster.upstreamsSearch"
                placeholder="搜索上游"
                style="width: 150px;"
                @search="() => { cluster.upstreamsPagination!.page = 1; loadUpstreams(cluster) }"
                allow-clear
              />
              <a-select
                v-model:value="cluster.upstreamsSearchField"
                placeholder="字段"
                style="width: 100px;"
                allow-clear
              >
                <a-select-option value="">全部</a-select-option>
                <a-select-option value="name">名称</a-select-option>
                <a-select-option value="description">描述</a-select-option>
              </a-select>
            </div>
            <a-table
              :columns="visibleUpstreamColumns"
              :data-source="cluster.upstreams || []"
              :pagination="{
                current: cluster.upstreamsPagination?.page,
                pageSize: cluster.upstreamsPagination?.pageSize,
                total: cluster.upstreamsPagination?.total,
                showSizeChanger: true,
                showTotal: (total: number) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50', '100'],
                showQuickJumper: true
              }"
              :loading="cluster.upstreamsLoading"
              :row-selection="{ selectedRowKeys: cluster.selectedUpstream ? [cluster.selectedUpstream.id] : [], onChange: (_keys: any, rows: any) => selectUpstream(cluster, rows[rows.length - 1]) }"
              :showSorterTooltip="false"
              size="small"
              row-key="id"
              class="node-table"
              @change="(pag: any, _filters: any, sorter: any) => handleUpstreamTableChange(cluster, pag, sorter)"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'actions'">
                  <template v-for="btnKey in upstreamActionsSelected" :key="btnKey">
                    <a-divider type="vertical" v-if="btnKey === 'publish'" />
                    <a-button size="small" @click="handleUpstreamAction(cluster, record, btnKey)">
                      {{ getUpstreamActionButtonTitle(btnKey) }}
                    </a-button>
                  </template>
                </template>
              </template>
            </a-table>
          </div>
          <div v-else-if="cluster.activeTab === 'routes'" class="tab-content">
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
            </div>
            <div v-if="routeSearchVisible" style="margin: 8px 0; display: flex; gap: 8px; align-items: center;">
              <a-input-search
                v-model:value="cluster.routesSearch"
                placeholder="搜索路由"
                style="width: 150px;"
                @search="() => { cluster.routesPagination!.page = 1; loadRoutes(cluster) }"
                allow-clear
              />
              <a-select
                v-model:value="cluster.routesSearchField"
                placeholder="字段"
                style="width: 100px;"
                allow-clear
              >
                <a-select-option value="">全部</a-select-option>
                <a-select-option value="name">名称</a-select-option>
                <a-select-option value="uri">URI</a-select-option>
              </a-select>
            </div>
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
                  <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? '正常' : '禁用'" />
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
          </div>
          <div v-else-if="cluster.activeTab === 'pluginConfigs'" class="tab-content">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddPluginConfig(cluster)">添加插件组</a-button>
              <a-button size="small" @click="publishPluginConfig(cluster)" :disabled="!cluster.selectedPluginConfig">发布</a-button>
              <a-button size="small" @click="openPluginConfigVersionManagement(cluster)" :disabled="!cluster.selectedPluginConfig">版本管理</a-button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
              <div
                v-for="pc in cluster.plugin_configs"
                :key="pc.id"
                class="plugin-config-card"
                :class="{ selected: cluster.selectedPluginConfig?.id === pc.id }"
                @click="cluster.selectedPluginConfig = pc"
                style="width: 320px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; background: #fff;"
              >
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 14px;">{{ pc.name }}</strong>
                  <span :style="{ color: pc.current_version ? '#52c41a' : '#999', fontSize: '12px' }">
                    {{ pc.current_version ? `v${pc.current_version} ✅ 已发布` : '⏳ 未发布' }}
                  </span>
                </div>
                <div v-if="pc.description" style="font-size: 12px; color: #666; margin-bottom: 12px;">{{ pc.description }}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                  <a-tag
                    v-for="(pcfg, pname) in pc.plugins"
                    :key="pname"
                    color="blue"
                    style="cursor: default;"
                  >
                    {{ pname }}
                  </a-tag>
                  <span v-if="!pc.plugins || Object.keys(pc.plugins).length === 0" style="font-size: 12px; color: #ccc;">无插件</span>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                  <a-button size="small" @click.stop="editPluginConfig(cluster, pc)">编辑</a-button>
                  <a-button size="small" @click.stop="publishPluginConfig(cluster, pc)">发布</a-button>
                  <a-button size="small" @click.stop="deletePluginConfig(cluster, pc)" danger>删除</a-button>
                </div>
              </div>
              <div v-if="!cluster.plugin_configs || cluster.plugin_configs.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
                暂无插件组，点击"添加插件组"创建
              </div>
            </div>
          </div>
          <div v-else-if="cluster.activeTab === 'globalPlugins'" class="tab-content">
            <GlobalPluginSelector :cluster-id="cluster.id" />
          </div>
          <div v-else class="tab-content node-tab">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddNodeModal(cluster)">添加节点</a-button>
              <a-button size="small" @click="editNode(cluster)" :disabled="!cluster.selectedNode">编辑节点</a-button>
              <a-button size="small" danger :disabled="!cluster.selectedNode" @click="deleteNode(cluster)">删除节点</a-button>
              <a-divider type="vertical" />
              <a-button size="small" @click="startNode(cluster.selectedNode!)" :disabled="!cluster.selectedNode">启动</a-button>
              <a-button size="small" @click="stopNode(cluster.selectedNode!)" :disabled="!cluster.selectedNode">停止</a-button>
              <a-button size="small" @click="queryNodeStatus(cluster.selectedNode!)" :disabled="!cluster.selectedNode">状态查询</a-button>
              <a-divider type="vertical" />
              <a-popover v-model:open="nodeColumnPopoverVisible" trigger="click" placement="bottomLeft">
                <template #content>
                  <div style="min-width: 400px;">
                    <div style="font-weight: 500; margin-bottom: 8px;">列选择</div>
                    <a-checkbox-group v-model:value="nodeColumnsSelected">
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <div v-for="col in allNodeColumns" :key="col.key" style="margin-bottom: 4px;">
                          <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                        </div>
                      </div>
                    </a-checkbox-group>
                    <a-divider style="margin: 12px 0;" />
                    <div style="font-weight: 500; margin-bottom: 8px;">操作按钮</div>
                    <a-checkbox-group v-model:value="nodeActionsSelected">
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <div v-for="btn in allNodeActionButtons" :key="btn.key" style="margin-bottom: 4px;">
                          <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                        </div>
                      </div>
                    </a-checkbox-group>
                    <a-divider style="margin: 12px 0;" />
                    <div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
                    <a-checkbox v-model:checked="nodeSearchVisible">显示搜索框</a-checkbox>
                  </div>
                </template>
                <a-button size="small">列配置</a-button>
              </a-popover>
            </div>
            <div v-if="nodeSearchVisible" style="margin: 8px 0; display: flex; gap: 8px; align-items: center;">
              <a-input-search
                v-model:value="cluster.nodesSearch"
                placeholder="搜索节点"
                style="width: 150px;"
                @search="() => { cluster.nodesPagination!.page = 1; loadNodes(cluster) }"
                allow-clear
              />
              <a-select
                v-model:value="cluster.nodesSearchField"
                placeholder="字段"
                style="width: 100px;"
                allow-clear
              >
                <a-select-option value="">全部</a-select-option>
                <a-select-option value="name">名称</a-select-option>
                <a-select-option value="ip">IP</a-select-option>
              </a-select>
            </div>
            <a-table
              :columns="visibleNodeColumns"
              :data-source="cluster.nodes || []"
              :pagination="{
                current: cluster.nodesPagination?.page,
                pageSize: cluster.nodesPagination?.pageSize,
                total: cluster.nodesPagination?.total,
                showSizeChanger: true,
                showTotal: (total: number) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50', '100'],
                showQuickJumper: true
              }"
              :row-selection="{ selectedRowKeys: cluster.selectedNode ? [cluster.selectedNode.id] : [], onChange: (_keys: any, rows: any) => selectNode(cluster, rows[rows.length - 1]) }"
              :loading="cluster.nodesLoading"
              :showSorterTooltip="false"
              size="small"
              row-key="id"
              class="node-table"
              @change="(pag: any, _filters: any, sorter: any) => handleNodeTableChange(cluster, pag, sorter)"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? '健康' : '离线'" />
                </template>
                <template v-if="column.key === 'actions'">
                  <template v-for="btnKey in nodeActionsSelected.filter(a => ['edit', 'delete'].includes(a))" :key="btnKey">
                    <a-button size="small" @click="handleNodeAction(cluster, record, btnKey)">
                      {{ getNodeActionButtonTitle(btnKey) }}
                    </a-button>
                  </template>
                  <a-divider type="vertical" v-if="nodeActionsSelected.some(a => ['edit', 'delete'].includes(a)) && nodeActionsSelected.some(a => ['start', 'stop', 'status'].includes(a))" />
                  <template v-for="btnKey in nodeActionsSelected.filter(a => ['start', 'stop', 'status'].includes(a))" :key="btnKey">
                    <a-button size="small" @click="handleNodeAction(cluster, record, btnKey)">
                      {{ getNodeActionButtonTitle(btnKey) }}
                    </a-button>
                  </template>
                </template>
              </template>
            </a-table>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <div v-if="clusters.length === 0 && !loading" class="empty-state">
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
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
        <a-form-item label="状态" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
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

    <a-modal v-model:open="upstreamModalVisible" :title="editingUpstream ? '编辑上游' : '添加上游'" width="750px" @ok="handleUpstreamSubmit">
      <a-tabs v-model:activeKey="upstreamModalActiveTab">
        <a-tab-pane key="basic" tab="基础配置">
          <a-form ref="upstreamFormRef" :model="upstreamForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入上游名称' }]">
              <a-input v-model:value="upstreamForm.name" placeholder="请输入上游名称" />
            </a-form-item>
            <a-form-item label="负载均衡" name="load_balance" :rules="[{ required: true, message: '请选择负载均衡' }]">
              <a-select v-model:value="upstreamForm.load_balance">
                <a-select-option value="weighted_roundrobin">加权轮询</a-select-option>
                <a-select-option value="chash">一致性哈希</a-select-option>
                <a-select-option value="ewma">延迟最小</a-select-option>
                <a-select-option value="least_conn">最少连接</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="upstreamForm.load_balance === 'chash'" label="哈希位置" name="hash_on" :rules="[{ required: true, message: '请选择哈希位置' }]">
              <a-select v-model:value="upstreamForm.hash_on">
                <a-select-option value="header">HTTP请求头</a-select-option>
                <a-select-option value="cookie">Cookie</a-select-option>
                <a-select-option value="vars">内置变量</a-select-option>
                <a-select-option value="vars_combinations">自定义变量</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="upstreamForm.load_balance === 'chash'" label="Key" name="key" :rules="[{ required: true, message: '请输入哈希 Key' }]">
              <a-input v-model:value="upstreamForm.key" placeholder="请输入哈希 Key" />
            </a-form-item>
            <a-form-item label="描述" name="description">
              <a-textarea v-model:value="upstreamForm.description" :rows="2" />
            </a-form-item>
            <a-form-item label="节点列表" :rules="[{ required: true, message: '请至少添加一个节点' }]">
              <a-table :columns="targetColumns" :data-source="upstreamForm.targets" :pagination="false" size="small" row-key="key">
                <template #bodyCell="{ column, record, index }">
                  <template v-if="column.key === 'ip'">
                    <a-input v-model:value="record.ip" placeholder="IP地址" />
                    <div v-if="targetValidation[index]?.ip" class="ant-form-item-explain-error">{{ targetValidation[index].ip }}</div>
                  </template>
                  <template v-else-if="column.key === 'port'">
                    <a-input-number v-model:value="record.port" :min="1" :max="65535" style="width: 100%" placeholder="端口" />
                    <div v-if="targetValidation[index]?.port" class="ant-form-item-explain-error">{{ targetValidation[index].port }}</div>
                  </template>
                  <template v-else-if="column.key === 'weight'">
                    <a-input-number v-model:value="record.weight" :min="1" :max="100" style="width: 100%" placeholder="权重" />
                    <div v-if="targetValidation[index]?.weight" class="ant-form-item-explain-error">{{ targetValidation[index].weight }}</div>
                  </template>
                  <template v-else-if="column.key === 'action'">
                    <a-button size="small" danger @click="removeUpstreamTarget(index)">删除</a-button>
                  </template>
                </template>
              </a-table>
              <a-button type="dashed" size="small" style="width: 100%; margin-top: 8px" @click="addUpstreamTarget">
                <PlusOutlined /> 添加节点
              </a-button>
            </a-form-item>
            <a-form-item label="高级配置">
              <a-switch v-model:checked="upstreamForm.advancedEnabled" checked-children="开" un-checked-children="关" />
              <span style="margin-left: 12px; color: #999; font-size: 12px;">开启后在"高级配置"页配置健康检查、超时、重试等</span>
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane key="advanced" tab="高级配置">
          <div v-if="upstreamForm.advancedEnabled">
            <a-form :model="upstreamForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
              <a-form-item label="健康检查" name="checks">
                <a-textarea v-model:value="checksJson" :rows="20" placeholder="健康检查JSON配置" />
              </a-form-item>
              <a-form-item label="重试次数" name="retries">
                <a-input-number v-model:value="upstreamForm.retries" :min="0" placeholder="默认等于可用节点数" style="width: 100%" />
                <div style="color: #999; font-size: 11px; margin-top: 2px">0 = 不启用重试，留空 = 自动使用节点数</div>
              </a-form-item>
              <a-form-item label="重试超时(秒)" name="retry_timeout">
                <a-input-number v-model:value="upstreamForm.retry_timeout" :min="0" placeholder="秒" style="width: 100%" />
                <div style="color: #999; font-size: 11px; margin-top: 2px">0 = 不限制重试时间</div>
              </a-form-item>
              <a-form-item label="超时配置(秒)">
                <div style="display: flex; gap: 8px;">
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">连接</div>
                    <a-input-number v-model:value="upstreamForm.timeout.connect" :min="0" placeholder="connect" style="width: 100%" />
                  </div>
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">发送</div>
                    <a-input-number v-model:value="upstreamForm.timeout.send" :min="0" placeholder="send" style="width: 100%" />
                  </div>
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">读取</div>
                    <a-input-number v-model:value="upstreamForm.timeout.read" :min="0" placeholder="read" style="width: 100%" />
                  </div>
                </div>
              </a-form-item>
              <a-form-item label="Host策略" name="pass_host">
                <a-select v-model:value="upstreamForm.pass_host">
                  <a-select-option value="pass">pass（透传客户端Host）</a-select-option>
                  <a-select-option value="node">node（使用节点Host）</a-select-option>
                  <a-select-option value="rewrite">rewrite（自定义Host）</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item v-if="upstreamForm.pass_host === 'rewrite'" label="上游Host" name="upstream_host">
                <a-input v-model:value="upstreamForm.upstream_host" placeholder="指定上游请求的Host" />
              </a-form-item>
              <a-form-item label="通信协议" name="scheme">
                <a-select v-model:value="upstreamForm.scheme">
                  <a-select-option value="http">http</a-select-option>
                  <a-select-option value="https">https</a-select-option>
                  <a-select-option value="tcp">tcp</a-select-option>
                  <a-select-option value="udp">udp</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item label="连接池">
                <div style="display: flex; gap: 8px;">
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">大小</div>
                    <a-input-number v-model:value="upstreamForm.keepalive_pool.size" :min="1" placeholder="size" style="width: 100%" />
                  </div>
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">空闲超时(秒)</div>
                    <a-input-number v-model:value="upstreamForm.keepalive_pool.idle_timeout" :min="0" placeholder="idle_timeout" style="width: 100%" />
                  </div>
                  <div style="flex: 1">
                    <div style="margin-bottom: 2px; color: #666; font-size: 12px">最大请求数</div>
                    <a-input-number v-model:value="upstreamForm.keepalive_pool.requests" :min="1" placeholder="requests" style="width: 100%" />
                  </div>
                </div>
              </a-form-item>
            </a-form>
          </div>
          <div v-else class="advanced-disabled-hint">
            <WarningOutlined style="color: #faad14; margin-right: 8px;" />
            高级配置未启用，请在"基础配置"中开启
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <a-modal v-model:open="routeModalVisible" :title="copyingRoute ? '复制路由' : (editingRoute ? '编辑路由' : '添加路由')" width="800px" @ok="handleRouteSubmit">
      <a-tabs v-model:activeKey="routeModalActiveTab" :lazy="true">
        <a-tab-pane key="basic" tab="基础配置">
          <a-form ref="routeFormRef" :model="routeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入路由名称' }]">
              <a-input v-model:value="routeForm.name" placeholder="请输入路由名称" />
            </a-form-item>
            <a-form-item label="URI" name="uri" :rules="[{ required: true, message: '请输入URI' }]">
              <a-input v-model:value="routeForm.uri" placeholder="如: /api/*" />
            </a-form-item>
            <a-form-item label="请求方法" name="methods" :rules="[{ required: true, message: '请选择请求方法' }]">
              <a-select v-model:value="routeForm.methods" mode="multiple" placeholder="可选多个方法">
                <a-select-option value="GET">GET</a-select-option>
                <a-select-option value="POST">POST</a-select-option>
                <a-select-option value="PUT">PUT</a-select-option>
                <a-select-option value="DELETE">DELETE</a-select-option>
                <a-select-option value="PATCH">PATCH</a-select-option>
                <a-select-option value="HEAD">HEAD</a-select-option>
                <a-select-option value="OPTIONS">OPTIONS</a-select-option>
              </a-select>
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
              <a-switch v-model:checked="routeForm.advancedMatchEnabled" checked-children="开" un-checked-children="关" />
              <span style="margin-left: 12px; color: #999; font-size: 12px;">开启后在"高级匹配"页配置请求条件</span>
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane key="advanced" tab="高级匹配">
          <div v-if="routeForm.advancedMatchEnabled" class="advanced-tab">
            <RouteAdvancedMatch
              :enabled="routeForm.advancedMatchEnabled"
              :model-value="{ vars: routeForm.advancedMatch.vars }"
              @update:model-value="(val: any) => { routeForm.advancedMatch.vars = val.vars || []; }"
            />
          </div>
          <div v-else class="advanced-disabled-hint">
            <WarningOutlined style="color: #faad14; margin-right: 8px;" />
            高级匹配未启用，请在"基础配置"中开启
          </div>
        </a-tab-pane>

        <a-tab-pane key="plugins" tab="插件管理">
          <PluginSelector
            v-model="routeForm.plugins"
            :plugins="availablePlugins"
          />
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <a-modal v-model:open="pluginConfigModalVisible" :title="pluginConfigFormMode === 'add' ? '添加插件组' : '编辑插件组'" width="600px" @ok="handlePluginConfigSubmit">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入插件组名称' }]">
          <a-input v-model:value="pluginConfigFormData.name" placeholder="请输入插件组名称" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="pluginConfigFormData.description" :rows="2" placeholder="可选描述" />
        </a-form-item>
        <a-form-item label="插件配置(JSON)" name="pluginsJson" :rules="[{ required: true, message: '请输入插件配置JSON' }]">
          <a-textarea v-model:value="pluginConfigFormData.pluginsJson" :rows="12" placeholder='例如:&#10;{&#10;  "cors": {},&#10;  "limit-count": {&#10;    "count": 100,&#10;    "time_window": 60&#10;  }&#10;}' style="font-family: monospace;" />
        </a-form-item>
      </a-form>
    </a-modal>

    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      @published="versionModalOnPublished"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, h } from 'vue'
import { message, Modal, Progress } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { CloudOutlined, TeamOutlined, CloudServerOutlined, GatewayOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster, Node, Upstream, Route, Plugin, RoutePlugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PluginSelector from '@/components/PluginSelector.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import GlobalPluginSelector from '@/components/GlobalPluginSelector.vue'

const router = useRouter()
const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const nodeModalVisible = ref(false)
const upstreamModalVisible = ref(false)
const routeModalVisible = ref(false)
const routeModalActiveTab = ref('basic')
const upstreamModalActiveTab = ref('basic')
const editingCluster = ref<Cluster | null>(null)
const editingNode = ref<Node | null>(null)
const editingUpstream = ref<Upstream | null>(null)
const editingRoute = ref<Route | null>(null)
const copyingRoute = ref(false)
const currentClusterId = ref<number | null>(null)
const currentUpstreamId = ref<number | null>(null)
const currentRouteId = ref<number | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })
const nameError = ref('')
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

// Plugin Config state
const pluginConfigModalVisible = ref(false)
const pluginConfigFormMode = ref<'add' | 'edit'>('add')
const pluginConfigEditingClusterId = ref<number | null>(null)
const pluginConfigEditingId = ref<number | null>(null)
const pluginConfigFormData = reactive({
  name: '',
  description: '',
  pluginsJson: '{}'
})

const nodeColumns = [
  { title: 'IP', dataIndex: 'ip', key: 'ip', sorter: true },
  { title: '服务端口', dataIndex: 'service_port', key: 'service_port', sorter: true },
  { title: '管理端口', dataIndex: 'management_port', key: 'management_port', sorter: true },
  { title: 'Edge路径', dataIndex: 'edge_path', key: 'edge_path', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  { title: '操作', key: 'actions', width: 280 }
]

const allNodeColumns = [
  { title: 'IP', dataIndex: 'ip', key: 'ip', sorter: true },
  { title: '服务端口', dataIndex: 'service_port', key: 'service_port', sorter: true },
  { title: '管理端口', dataIndex: 'management_port', key: 'management_port', sorter: true },
  { title: 'Edge路径', dataIndex: 'edge_path', key: 'edge_path', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  { title: '操作', key: 'actions', width: 280 }
]

const upstreamColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: '负载均衡', dataIndex: 'load_balance', key: 'load_balance', sorter: true, customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text) },
  { title: '描述', dataIndex: 'description', key: 'description', sorter: true },
  { title: '操作', key: 'actions', width: 280 }
]

const allUpstreamColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: '负载均衡', dataIndex: 'load_balance', key: 'load_balance', sorter: true, customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text) },
  { title: '描述', dataIndex: 'description', key: 'description', sorter: true },
  { title: '操作', key: 'actions', width: 280 }
]

const targetColumns = [
  { title: 'IP地址', key: 'ip', width: 200 },
  { title: '端口', key: 'port', width: 120 },
  { title: '权重', key: 'weight', width: 100 },
  { title: '操作', key: 'action', width: 80 }
]

const allRouteColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: 'URI', dataIndex: 'uri', key: 'uri', sorter: true },
  { title: '方法', dataIndex: 'methods', key: 'methods' },
  { title: '上游', dataIndex: 'upstream_id', key: 'upstream_id' },
  { title: '优先级', dataIndex: 'priority', key: 'priority', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  { title: '高级匹配', dataIndex: 'advanced_match_enabled', key: 'advanced_match_enabled' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '操作', key: 'actions', width: 340 }
]

const routeColumnPopoverVisible = ref(false)
const routeColumnsSelected = ref(['name', 'uri', 'priority', 'actions'])
const routeSearchVisible = ref(true)

const allActionButtons = [
  { key: 'publish', title: '发布' },
  { key: 'version', title: '版本管理' },
  { key: 'copy', title: '复制' },
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' }
]
const routeActionsSelected = ref(['copy', 'edit', 'delete', 'publish', 'version'])

const visibleRouteColumns = computed(() => {
  const selected = new Set(routeColumnsSelected.value)
  return allRouteColumns.filter(col => selected.has(col.key))
})

const upstreamColumnPopoverVisible = ref(false)
const upstreamColumnsSelected = ref(['name', 'load_balance', 'description', 'actions'])
const upstreamSearchVisible = ref(true)

const allUpstreamActionButtons = [
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' },
  { key: 'publish', title: '发布' },
  { key: 'version', title: '版本管理' }
]
const upstreamActionsSelected = ref(['edit', 'delete', 'publish', 'version'])

const visibleUpstreamColumns = computed(() => {
  const selected = new Set(upstreamColumnsSelected.value)
  return allUpstreamColumns.filter(col => selected.has(col.key))
})

const nodeColumnPopoverVisible = ref(false)
const nodeColumnsSelected = ref(['ip', 'service_port', 'management_port', 'status', 'actions'])
const nodeSearchVisible = ref(true)

const allNodeActionButtons = [
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' },
  { key: 'start', title: '启动' },
  { key: 'stop', title: '停止' },
  { key: 'status', title: '状态查询' }
]
const nodeActionsSelected = ref(['start', 'stop', 'status'])

const visibleNodeColumns = computed(() => {
  const selected = new Set(nodeColumnsSelected.value)
  return allNodeColumns.filter(col => selected.has(col.key))
})

const isAdmin = () => authStore.user?.role === 'admin'

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

// IP 地址校验正则
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

const isValidIP = (ip: string): boolean => IP_PATTERN.test(ip)

const getLoadBalanceLabel = (value: string): string => {
  const labels: Record<string, string> = {
    weighted_roundrobin: '加权轮询',
    chash: '一致性哈希',
    ewma: '延迟最小',
    least_conn: '最少连接'
  }
  return labels[value] || value
}

const validateIP = (_rule: any, value: string, callback: (error?: string) => void) => {
  if (!value) {
    callback('请输入IP地址')
    return
  }
  if (!IP_PATTERN.test(value)) {
    callback('请输入合法的IP地址')
    return
  }
  callback()
}

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
  description: '',
  status: 1
})

const nodeForm = reactive({
  ip: '',
  service_port: 80,
  management_port: 9180,
  edge_path: '',
  status: 1
})

const upstreamForm = reactive({
  name: '',
  load_balance: 'weighted_roundrobin',
  description: '',
  targets: [] as { key: number, ip: string, port: number, weight: number }[],
  hash_on: 'vars',
  key: '',
  checks: null as Record<string, any> | null,
  advancedEnabled: false as boolean,
  retries: undefined as number | undefined,
  retry_timeout: 0 as number,
  timeout: { connect: undefined as number | undefined, send: undefined as number | undefined, read: undefined as number | undefined },
  pass_host: 'pass' as string,
  upstream_host: '' as string,
  scheme: 'http' as string,
  keepalive_pool: { size: undefined as number | undefined, idle_timeout: undefined as number | undefined, requests: undefined as number | undefined } as Record<string, any>
})

watch(() => upstreamForm.load_balance, (newVal) => {
  if (newVal !== 'chash') {
    upstreamForm.hash_on = 'vars'
    upstreamForm.key = ''
  }
})

let upstreamTargetKey = 0

const defaultChecksJson = JSON.stringify({
  "passive": {},
  "active": {
    "unhealthy": {}
  }
}, null, 2)

const defaultTimeout = { connect: 6, send: 6, read: 6 }

const checksJson = ref(defaultChecksJson)

// Sync checksJson back to upstreamForm.checks on changes
watch(checksJson, (newVal) => {
  try {
    upstreamForm.checks = JSON.parse(newVal)
  } catch {
    // Invalid JSON, don't update
  }
})

const routeForm = reactive({
  name: '',
  uri: '',
  methods: [] as string[],
  priority: 0,
  status: 1,
  upstream_id: undefined as number | undefined,
  description: '',
  advancedMatchEnabled: false,
  advancedMatch: {
    vars: [] as [string, string, string][]
  },
  plugins: [] as RoutePlugin[]
})

const routeFormRef = ref()
const nodeFormRef = ref()
const upstreamFormRef = ref()
const targetValidation = ref<Record<string, { ip?: string; port?: string; weight?: string }>>({})

const availablePlugins = ref<Plugin[]>([])

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
      selectedPluginConfig: null
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

const getClusterUpstreams = () => {
  const cluster = clusters.value.find(c => c.id === currentClusterId.value)
  return cluster?.upstreams || []
}

const getUpstreamName = (cluster: Cluster, upstreamId: number | null) => {
  if (!upstreamId || !cluster.upstreams) return '-'
  const upstream = cluster.upstreams.find((u: Upstream) => u.id === upstreamId)
  return upstream?.name || '-'
}

const getActionButtonTitle = (key: string) => {
  const btn = allActionButtons.find(b => b.key === key)
  return btn?.title || key
}

const handleRouteAction = (cluster: Cluster, record: Route, action: string) => {
  switch (action) {
    case 'publish':
      publishRouteByRecord(cluster, record)
      break
    case 'version':
      openRouteVersionManagementByRecord(cluster, record)
      break
    case 'copy':
      copyRouteByRecord(cluster, record)
      break
    case 'edit':
      editRouteByRecord(cluster, record)
      break
    case 'delete':
      deleteRouteByRecord(cluster, record)
      break
  }
}

const getUpstreamActionButtonTitle = (key: string) => {
  const btn = allUpstreamActionButtons.find(b => b.key === key)
  return btn?.title || key
}

const handleUpstreamAction = (cluster: Cluster, record: Upstream, action: string) => {
  switch (action) {
    case 'publish':
      publishUpstreamByRecord(cluster, record)
      break
    case 'version':
      openUpstreamVersionManagementByRecord(cluster, record)
      break
    case 'edit':
      editUpstreamByRecord(cluster, record)
      break
    case 'delete':
      deleteUpstreamByRecord(cluster, record)
      break
  }
}

const getNodeActionButtonTitle = (key: string) => {
  const btn = allNodeActionButtons.find(b => b.key === key)
  return btn?.title || key
}

const handleNodeAction = (cluster: Cluster, record: Node, action: string) => {
  switch (action) {
    case 'edit':
      editNode(cluster)
      break
    case 'delete':
      deleteNode(cluster)
      break
    case 'start':
      startNode(record)
      break
    case 'stop':
      stopNode(record)
      break
    case 'status':
      queryNodeStatus(record)
      break
  }
}

const loadUpstreams = async (cluster: Cluster) => {
  cluster.upstreamsLoading = true
  try {
    const params: Record<string, any> = {
      page: cluster.upstreamsPagination?.page || 1,
      page_size: cluster.upstreamsPagination?.pageSize || 20
    }
    if (cluster.upstreamsSearch) {
      params.search = cluster.upstreamsSearch
      if (cluster.upstreamsSearchField) {
        params.search_field = cluster.upstreamsSearchField
      }
    }
    if (cluster.upstreamsSortBy) {
      params.sort_by = cluster.upstreamsSortBy
      params.sort_order = cluster.upstreamsSortOrder
    }
    const res = await api.get(`/clusters/${cluster.id}/upstreams`, { params })
    cluster.upstreams = res.data.items
    cluster.upstreamsPagination = {
      total: res.data.total,
      page: res.data.page,
      pageSize: res.data.page_size
    }
  } catch (error) {
    message.error('加载上游列表失败')
  } finally {
    cluster.upstreamsLoading = false
  }
}

const loadRoutes = async (cluster: Cluster) => {
  cluster.routesLoading = true
  try {
    const params: Record<string, any> = {
      page: cluster.routesPagination?.page || 1,
      page_size: cluster.routesPagination?.pageSize || 20
    }
    if (cluster.routesSearch) {
      params.search = cluster.routesSearch
      if (cluster.routesSearchField) {
        params.search_field = cluster.routesSearchField
      }
    }
    if (cluster.routesSortBy) {
      params.sort_by = cluster.routesSortBy
      params.sort_order = cluster.routesSortOrder
    }
    const res = await api.get(`/clusters/${cluster.id}/routes`, { params })
    cluster.routes = res.data.items
    cluster.routesPagination = {
      total: res.data.total,
      page: res.data.page,
      pageSize: res.data.page_size
    }
  } catch (error) {
    message.error('加载路由列表失败')
  } finally {
    cluster.routesLoading = false
  }
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
  }
}

const handleRouteTableChange = (cluster: Cluster, pag: any, sorter: any) => {
  if (cluster.routesPagination) {
    cluster.routesPagination.page = pag.current
    cluster.routesPagination.pageSize = pag.pageSize
  }
  if (sorter && sorter.field) {
    const fieldMap: Record<string, string> = {
      name: 'name',
      uri: 'uri',
      priority: 'priority',
      status: 'status',
      created_at: 'created_at'
    }
    cluster.routesSortBy = fieldMap[sorter.field] || sorter.field
    cluster.routesSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
  } else {
    cluster.routesSortBy = ''
    cluster.routesSortOrder = 'asc'
  }
  loadRoutes(cluster)
}

const handleUpstreamTableChange = (cluster: Cluster, pag: any, sorter: any) => {
  if (cluster.upstreamsPagination) {
    cluster.upstreamsPagination.page = pag.current
    cluster.upstreamsPagination.pageSize = pag.pageSize
  }
  if (sorter && sorter.field) {
    const fieldMap: Record<string, string> = {
      name: 'name',
      load_balance: 'load_balance',
      description: 'description',
      created_at: 'created_at'
    }
    cluster.upstreamsSortBy = fieldMap[sorter.field] || sorter.field
    cluster.upstreamsSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
  } else {
    cluster.upstreamsSortBy = ''
    cluster.upstreamsSortOrder = 'asc'
  }
  loadUpstreams(cluster)
}

const handleNodeTableChange = (cluster: Cluster, pag: any, sorter: any) => {
  if (cluster.nodesPagination) {
    cluster.nodesPagination.page = pag.current
    cluster.nodesPagination.pageSize = pag.pageSize
  }
  if (sorter && sorter.field) {
    const fieldMap: Record<string, string> = {
      ip: 'ip',
      service_port: 'service_port',
      management_port: 'management_port',
      status: 'status',
      created_at: 'created_at'
    }
    cluster.nodesSortBy = fieldMap[sorter.field] || sorter.field
    cluster.nodesSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
  } else {
    cluster.nodesSortBy = ''
    cluster.nodesSortOrder = 'asc'
  }
  loadNodes(cluster)
}

const loadNodes = async (cluster: Cluster) => {
  cluster.nodesLoading = true
  try {
    const params: Record<string, any> = {
      page: cluster.nodesPagination?.page || 1,
      page_size: cluster.nodesPagination?.pageSize || 20
    }
    if (cluster.nodesSearch) {
      params.search = cluster.nodesSearch
      if (cluster.nodesSearchField) {
        params.search_field = cluster.nodesSearchField
      }
    }
    if (cluster.nodesSortBy) {
      params.sort_by = cluster.nodesSortBy
      params.sort_order = cluster.nodesSortOrder
    }
    const res = await api.get(`/clusters/${cluster.id}/nodes`, { params })
    cluster.nodes = res.data.items
    cluster.nodesPagination = {
      total: res.data.total,
      page: res.data.page,
      pageSize: res.data.page_size
    }
  } catch (error) {
    message.error('加载节点列表失败')
  } finally {
    cluster.nodesLoading = false
  }
}

const selectNode = (cluster: Cluster, node: Node | undefined) => {
  cluster.selectedNode = node || null
}

const selectUpstream = (cluster: Cluster, upstream: Upstream | undefined) => {
  cluster.selectedUpstream = upstream || null
}

const selectRoute = (cluster: Cluster, route: Route | undefined) => {
  cluster.selectedRoute = route || null
}

const showAddModal = () => {
  editingCluster.value = null
  Object.assign(form, {
    name: '',
    display_name: '',
    description: '',
    status: 1
  })
  nameError.value = ''
  modalVisible.value = true
}

const editCluster = (cluster: Cluster) => {
  editingCluster.value = cluster
  form.name = cluster.name
  form.display_name = cluster.display_name || ''
  form.description = cluster.description || ''
  form.status = cluster.status
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

const testConnection = async (cluster: Cluster) => {
  try {
    await api.post(`/clusters/${cluster.id}/test`)
    message.success('连接成功')
  } catch (error) {
    message.error('连接失败')
  }
}

const viewDetail = (cluster: Cluster) => {
  router.push(`/clusters/${cluster.id}`)
}

const deleteCluster = (cluster: Cluster) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除集群"${cluster.display_name || cluster.name}"吗？此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await api.delete(`/clusters/${cluster.id}`)
        message.success('集群已删除')
        loadClusters()
      } catch (error: any) {
        message.error(error.response?.data?.detail || '删除集群失败')
      }
    }
  })
}

const showAddNodeModal = async (cluster: Cluster) => {
  await loadNodes(cluster)
  editingNode.value = null
  currentClusterId.value = cluster.id
  Object.assign(nodeForm, {
    ip: '',
    service_port: 80,
    management_port: 9180,
    edge_path: '',
    status: 1
  })
  nodeModalVisible.value = true
}

const editNode = (cluster: Cluster) => {
  if (!cluster.selectedNode) {
    message.warning('请先选择一个节点')
    return
  }
  editingNode.value = cluster.selectedNode
  currentClusterId.value = cluster.id
  nodeForm.ip = cluster.selectedNode.ip
  nodeForm.service_port = cluster.selectedNode.service_port
  nodeForm.management_port = cluster.selectedNode.management_port
  nodeForm.edge_path = cluster.selectedNode.edge_path
  nodeForm.status = cluster.selectedNode.status
  nodeModalVisible.value = true
}

const handleNodeSubmit = async () => {
  if (!currentClusterId.value) return
  try {
    await nodeFormRef.value.validate()
  } catch {
    return
  }
  try {
    if (editingNode.value) {
      await api.put(`/clusters/${currentClusterId.value}/nodes/${editingNode.value.id}`, nodeForm)
      message.success('节点已更新')
    } else {
      await api.post(`/clusters/${currentClusterId.value}/nodes`, nodeForm)
      message.success('节点已添加')
    }
    nodeModalVisible.value = false
    const cluster = clusters.value.find(c => c.id === currentClusterId.value)
    if (cluster) {
      const res = await api.get(`/clusters/${cluster.id}/nodes`)
      cluster.nodes = res.data.items
      cluster.node_count = cluster.nodes.length
    }
    loadClusters()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  }
}

const deleteNode = (cluster: Cluster) => {
  if (!cluster.selectedNode) {
    message.warning('请先选择一个节点')
    return
  }
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除节点"${cluster.selectedNode.ip}"吗？此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await api.delete(`/clusters/${cluster.id}/nodes/${cluster.selectedNode!.id}`)
        message.success('节点已删除')
        const res = await api.get(`/clusters/${cluster.id}/nodes`)
        cluster.nodes = res.data.items
        cluster.node_count = cluster.nodes.length
        cluster.selectedNode = null
        loadClusters()
} catch (error: any) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      message.error(detail)
    } else if (Array.isArray(detail)) {
      message.error(detail.map((d: any) => d.msg || JSON.stringify(d)).join('; '))
    } else if (error.response?.data?.message) {
      message.error(error.response.data.message)
    } else {
      message.error('操作失败')
    }
  }
    }
  })
}

const startNode = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    await api.post(`/clusters/${cluster.id}/nodes/${node.id}/start`)
    message.success('节点已启动')
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '启动节点失败')
  }
}

const stopNode = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    await api.post(`/clusters/${cluster.id}/nodes/${node.id}/stop`)
    message.success('节点已停止')
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '停止节点失败')
  }
}

const queryNodeStatus = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes/${node.id}/status`)
    message.success(`节点状态: ${res.data.node_status === 1 ? '健康' : '离线'}`)
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '查询节点状态失败')
  }
}

// 上游相关方法
const addUpstreamTarget = () => {
  const lastTarget = upstreamForm.targets[upstreamForm.targets.length - 1]
  const newTarget = {
    key: ++upstreamTargetKey,
    ip: lastTarget ? lastTarget.ip : '',
    port: lastTarget ? lastTarget.port : 80,
    weight: lastTarget ? lastTarget.weight : 100
  }
  upstreamForm.targets.push(newTarget)
}

const removeUpstreamTarget = (index: number) => {
  upstreamForm.targets.splice(index, 1)
}

const showAddUpstreamModal = async (cluster: Cluster) => {
  await loadUpstreams(cluster)
  editingUpstream.value = null
  currentClusterId.value = cluster.id
  upstreamForm.name = ''
  upstreamForm.load_balance = 'weighted_roundrobin'
  upstreamForm.description = ''
  upstreamForm.targets = [{ key: ++upstreamTargetKey, ip: '', port: 80, weight: 100 }]
  upstreamForm.hash_on = 'vars'
  upstreamForm.key = ''
  checksJson.value = defaultChecksJson
  upstreamForm.checks = JSON.parse(defaultChecksJson)
  upstreamForm.advancedEnabled = false
  upstreamForm.retries = undefined
  upstreamForm.retry_timeout = 0
  upstreamForm.timeout = { ...defaultTimeout }
  upstreamForm.pass_host = 'pass'
  upstreamForm.upstream_host = ''
  upstreamForm.scheme = 'http'
  upstreamForm.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
  targetValidation.value = {}
  upstreamModalVisible.value = true
  upstreamModalActiveTab.value = 'basic'
}

const editUpstream = (cluster: Cluster) => {
  if (!cluster.selectedUpstream) {
    message.warning('请先选择一个上游')
    return
  }
  editUpstreamByRecord(cluster, cluster.selectedUpstream)
}

const editUpstreamByRecord = async (cluster: Cluster, upstream: Upstream) => {
  editingUpstream.value = upstream
  currentClusterId.value = cluster.id
  upstreamForm.name = upstream.name
  upstreamForm.load_balance = upstream.load_balance
  upstreamForm.description = upstream.description || ''
  upstreamForm.hash_on = (upstream as any).hash_on || 'vars'
  upstreamForm.key = (upstream as any).key || ''
  const u = upstream as any
  if (u.checks) {
    const checksObj = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
    upstreamForm.checks = checksObj
    checksJson.value = JSON.stringify(checksObj, null, 2)
  } else {
    upstreamForm.checks = JSON.parse(defaultChecksJson)
    checksJson.value = defaultChecksJson
  }
  const isDefaultChecks = (() => {
    if (!u.checks) return true
    const c = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
    return JSON.stringify(c) === JSON.stringify({ passive: {}, active: { unhealthy: {} } })
  })()
  const isDefaultTimeout = (() => {
    if (!u.timeout) return true
    const t = typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout
    return t.connect === 6 && t.send === 6 && t.read === 6
  })()
  upstreamForm.advancedEnabled = !!(
    (u.retries !== undefined && u.retries !== null) ||
    (u.retry_timeout !== undefined && u.retry_timeout !== null && u.retry_timeout !== 0) ||
    (u.pass_host && u.pass_host !== 'pass') ||
    (u.upstream_host && u.upstream_host !== '') ||
    (u.scheme && u.scheme !== 'http') ||
    !isDefaultChecks ||
    !isDefaultTimeout ||
    (u.keepalive_pool && u.keepalive_pool !== '{}')
  )
  upstreamForm.retries = u.retries ?? undefined
  upstreamForm.retry_timeout = u.retry_timeout ?? 0
  if (u.timeout) {
    const t = typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout
    upstreamForm.timeout = { connect: t.connect ?? defaultTimeout.connect, send: t.send ?? defaultTimeout.send, read: t.read ?? defaultTimeout.read }
  } else {
    upstreamForm.timeout = { ...defaultTimeout }
  }
  upstreamForm.pass_host = u.pass_host || 'pass'
  upstreamForm.upstream_host = u.upstream_host || ''
  upstreamForm.scheme = u.scheme || 'http'
  if (u.keepalive_pool) {
    const k = typeof u.keepalive_pool === 'string' ? JSON.parse(u.keepalive_pool) : u.keepalive_pool
    upstreamForm.keepalive_pool = { size: k.size, idle_timeout: k.idle_timeout, requests: k.requests }
  } else {
    upstreamForm.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
  }
  if (upstream.targets && upstream.targets.length > 0) {
    upstreamForm.targets = upstream.targets.map((t) => {
      const [ip, port] = t.target.split(':')
      return {
        key: ++upstreamTargetKey,
        ip: ip || '',
        port: port ? parseInt(port) : 80,
        weight: t.weight
      }
    })
  } else {
    upstreamForm.targets = [{ key: ++upstreamTargetKey, ip: '', port: 80, weight: 100 }]
  }
  targetValidation.value = {}
  upstreamModalVisible.value = true
  upstreamModalActiveTab.value = 'basic'
}

const validateTargets = () => {
  targetValidation.value = {}
  let valid = true
  upstreamForm.targets.forEach((t, i) => {
    const errors: Record<string, string> = {}
    if (!t.ip) {
      errors.ip = 'IP不能为空'
      valid = false
    } else if (!isValidIP(t.ip)) {
      errors.ip = 'IP不合法'
      valid = false
    }
    if (!t.port || t.port < 1 || t.port > 65535) {
      errors.port = '端口不合法'
      valid = false
    }
    if (!t.weight || t.weight < 1 || t.weight > 100) {
      errors.weight = '权重不合法'
      valid = false
    }
    targetValidation.value[`${i}`] = errors
  })
  return valid
}

const handleUpstreamSubmit = async () => {
  if (!currentClusterId.value) return
  try {
    await upstreamFormRef.value.validate()
  } catch {
    return
  }

  // Validate targets array
  if (!validateTargets()) {
    return
  }

  try {
    const submitData: Record<string, any> = {
      name: upstreamForm.name,
      load_balance: upstreamForm.load_balance,
      description: upstreamForm.description,
      targets: upstreamForm.targets.map(t => ({
        target: `${t.ip}:${t.port}`,
        weight: t.weight
      })),
      ...(upstreamForm.load_balance === 'chash' && {
        hash_on: upstreamForm.hash_on,
        key: upstreamForm.key
      }),
      checks: upstreamForm.checks,
      timeout: upstreamForm.timeout
    }
    if (upstreamForm.advancedEnabled) {
      if (upstreamForm.retries !== undefined) {
        submitData.retries = upstreamForm.retries
      }
      if (upstreamForm.retry_timeout !== undefined) {
        submitData.retry_timeout = upstreamForm.retry_timeout
      }
      if (upstreamForm.pass_host) {
        submitData.pass_host = upstreamForm.pass_host
      }
      if (upstreamForm.pass_host === 'rewrite' && upstreamForm.upstream_host) {
        submitData.upstream_host = upstreamForm.upstream_host
      }
      if (upstreamForm.scheme && upstreamForm.scheme !== 'http') {
        submitData.scheme = upstreamForm.scheme
      }
      const k = upstreamForm.keepalive_pool
      if (k.size !== undefined || k.idle_timeout !== undefined || k.requests !== undefined) {
        submitData.keepalive_pool = {} as Record<string, any>
        if (k.size !== undefined) submitData.keepalive_pool.size = k.size
        if (k.idle_timeout !== undefined) submitData.keepalive_pool.idle_timeout = k.idle_timeout
        if (k.requests !== undefined) submitData.keepalive_pool.requests = k.requests
      }
    }
    if (editingUpstream.value) {
      await api.put(`/clusters/${currentClusterId.value}/upstreams/${editingUpstream.value.id}`, submitData)
      message.success('上游已更新')
    } else {
      await api.post(`/clusters/${currentClusterId.value}/upstreams`, submitData)
      message.success('上游已添加')
    }
    upstreamModalVisible.value = false
    const c = clusters.value.find(c => c.id === currentClusterId.value)
    if (c) {
      const res = await api.get(`/clusters/${c.id}/upstreams`)
      c.upstreams = res.data.items
      c.upstream_count = c.upstreams.length
    }
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  }
}

const buildDeleteProgressContent = (progress: { percent: number, status: 'active' | 'success' | 'exception' }, logs: string[]) => {
  return h('div', {}, [
    h(Progress, { percent: progress.percent, status: progress.status, showInfo: false, style: 'margin-bottom: 12px;' }),
    h('div', { style: 'max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px;' },
      logs.map(log => h('div', { style: 'margin-bottom: 4px; white-space: pre-wrap;' }, log))
    )
  ])
}

const deleteUpstream = async (cluster: Cluster) => {
  if (!cluster.selectedUpstream) {
    message.warning('请先选择一个上游')
    return
  }
  await deleteUpstreamByRecord(cluster, cluster.selectedUpstream)
}

const deleteUpstreamByRecord = async (cluster: Cluster, upstream: Upstream) => {
  if (!cluster.routes || cluster.routes.length === 0) {
    await loadRoutes(cluster)
  }
  const linkedRoutes = cluster.routes.filter((r: Route) => r.upstream_id === upstream.id)
  if (linkedRoutes.length > 0) {
    const routeNames = linkedRoutes.map((r: Route) => r.name).join(', ')
    message.error(`该上游已被路由 "${routeNames}" 引用，请先删除这些路由`)
    return
  }
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除上游"${upstream.name}"吗？将同时删除数据库记录及所有 Edge 节点上的对应数据，此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `删除上游: ${upstream.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始删除上游: ${upstream.name}`)
      progress.percent = 20
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在从数据库删除...')
        progress.percent = 40
        updateContent()

        const res = await api.delete(`/clusters/${cluster.id}/upstreams/${upstream.id}`)
        const data = res.data

        progress.percent = 60
        addLog(`数据库: ${data.message}`)
        addLog('')

        if (data.results && data.results.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of data.results) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${data.results.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (data.results && data.results.length > 0 && !data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (data.results && data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('⚠️ 部分节点删除失败（数据库已删除），请手动清理')
        } else {
          progress.status = 'success'
          addLog('✅ 数据库已删除')
        }

        updateContent()

        const res2 = await api.get(`/clusters/${cluster.id}/upstreams`)
        cluster.upstreams = res2.data.items
        cluster.upstream_count = cluster.upstreams.length
        cluster.selectedUpstream = null
      } catch (error: any) {
        const detail = error.response?.data?.detail
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
        updateContent()
      }
      modal.update({ okButtonProps: { disabled: false } })
    }
  })
}

// 路由相关方法
const loadAvailablePlugins = async () => {
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

const showAddRouteModal = async (cluster: Cluster) => {
  await loadRoutes(cluster)
  await loadAvailablePlugins()
  editingRoute.value = null
  copyingRoute.value = false
  currentClusterId.value = cluster.id
  Object.assign(routeForm, {
    name: '',
    uri: '',
    methods: [],
    priority: 0,
    status: 1,
    upstream_id: undefined,
    description: '',
    advancedMatchEnabled: false,
    advancedMatch: { vars: [] },
    plugins: []
  })
  routeModalActiveTab.value = 'basic'
  routeModalVisible.value = true
}

const editRoute = (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  editRouteByRecord(cluster, cluster.selectedRoute)
}

const editRouteByRecord = async (cluster: Cluster, route: Route) => {
  await loadRoutes(cluster)
  await loadAvailablePlugins()
  
  // 从刷新后的数据中获取最新路由信息，而不是使用旧的 route 参数
  const routeData = cluster.routes?.find((r: Route) => r.id === route.id)
  if (!routeData) {
    message.warning('路由不存在')
    return
  }
  
  editingRoute.value = routeData
  currentClusterId.value = cluster.id
  routeForm.name = routeData.name
  routeForm.uri = routeData.uri
  routeForm.methods = routeData.methods ? routeData.methods.split(',') : []
  routeForm.priority = routeData.priority
  routeForm.status = routeData.status
  routeForm.upstream_id = routeData.upstream_id
  routeForm.description = routeData.description || ''
  routeForm.advancedMatchEnabled = routeData.advanced_match_enabled || false
  // 使用新对象避免引用问题
  routeForm.advancedMatch = { vars: [...(routeData.vars || [])] }
  routeForm.plugins = []
  routeModalActiveTab.value = 'basic'

  try {
    const res = await api.get(`/clusters/${cluster.id}/routes/${routeData.id}/plugins`)
    routeForm.plugins = res.data.plugins || []
  } catch (error) {
    console.error('加载路由插件失败:', error)
    message.error('加载路由插件失败，请重试')
    routeForm.plugins = []
  }
  routeModalVisible.value = true
}

const copyRoute = (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  copyRouteByRecord(cluster, cluster.selectedRoute)
}

const copyRouteByRecord = async (cluster: Cluster, route: Route) => {
  await loadRoutes(cluster)
  await loadAvailablePlugins()
  
  // 从刷新后的数据中获取最新路由信息
  const routeData = cluster.routes?.find((r: Route) => r.id === route.id)
  const sourceRoute = routeData || route
  
  editingRoute.value = null
  copyingRoute.value = true
  currentClusterId.value = cluster.id
  routeForm.name = `复制_${sourceRoute.name}`
  routeForm.uri = sourceRoute.uri
  routeForm.methods = sourceRoute.methods ? sourceRoute.methods.split(',') : []
  routeForm.priority = sourceRoute.priority
  routeForm.status = sourceRoute.status
  routeForm.upstream_id = sourceRoute.upstream_id
  routeForm.description = sourceRoute.description || ''
  routeForm.advancedMatchEnabled = sourceRoute.advanced_match_enabled || false
  routeForm.advancedMatch = { vars: sourceRoute.vars || [] }
  routeForm.plugins = []
  routeModalActiveTab.value = 'basic'

  try {
    const res = await api.get(`/clusters/${cluster.id}/routes/${sourceRoute.id}/plugins`)
    routeForm.plugins = res.data.plugins || []
  } catch (error) {
    console.error('加载路由插件失败:', error)
    message.error('加载路由插件失败，请重试')
    routeForm.plugins = []
  }
  routeModalVisible.value = true
}

const handleRouteSubmit = async () => {
  if (!currentClusterId.value) return
  try {
    await routeFormRef.value.validate()
    const payload: Record<string, any> = {
      name: routeForm.name,
      uri: routeForm.uri,
      methods: Array.isArray(routeForm.methods) ? routeForm.methods.join(',') : routeForm.methods,
      priority: routeForm.priority || 0,
      status: routeForm.status,
      upstream_id: routeForm.upstream_id,
      description: routeForm.description,
      advanced_match_enabled: routeForm.advancedMatchEnabled
    }

    if (routeForm.advancedMatchEnabled) {
      payload.vars = routeForm.advancedMatch?.vars || []
    } else {
      payload.vars = []
    }

    let routeId: number
    if (editingRoute.value) {
      const res = await api.put(`/clusters/${currentClusterId.value}/routes/${editingRoute.value.id}`, payload)
      routeId = editingRoute.value.id
      message.success('路由已更新')
    } else {
      const res = await api.post(`/clusters/${currentClusterId.value}/routes`, payload)
      routeId = res.data.id
      message.success('路由已添加')
    }

    await api.put(`/clusters/${currentClusterId.value}/routes/${routeId}/plugins`, {
      plugins: routeForm.plugins
    })

    routeModalVisible.value = false
    const c = clusters.value.find(c => c.id === currentClusterId.value)
    if (c) {
      const res = await api.get(`/clusters/${c.id}/routes`)
      c.routes = res.data.items
      c.route_count = c.routes.length
    }
  } catch (error: any) {
    // 检查是否是表单验证错误（validate 抛出的是 Error 对象，没有 response 属性）
    if (error.errorFields) {
      // 表单验证错误，Ant Design Form 会提供 errorFields
      const firstError = error.errorFields?.[0]
      if (firstError?.name) {
        const fieldName = getFieldName(firstError.name[0])
        message.error(`请填写必填字段: ${fieldName}`)
      } else {
        message.error('请检查表单填写是否完整')
      }
      return
    }
    // API 错误
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      message.error(detail)
    } else if (Array.isArray(detail)) {
      message.error(detail.map((d: any) => d.msg || JSON.stringify(d)).join('; '))
    } else if (error.response?.data?.message) {
      message.error(error.response.data.message)
    } else {
      message.error('操作失败')
    }
  }
}

// 获取字段中文名称
const getFieldName = (name: string): string => {
  const nameMap: Record<string, string> = {
    name: '名称',
    uri: 'URI',
    methods: '请求方法',
    upstream_id: '上游',
    priority: '优先级',
    status: '状态'
  }
  return nameMap[name] || name
}

const deleteRoute = (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  deleteRouteByRecord(cluster, cluster.selectedRoute)
}

const deleteRouteByRecord = (cluster: Cluster, route: Route) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除路由"${route.name}"吗？将同时删除数据库记录及所有 Edge 节点上的对应数据，此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `删除路由: ${route.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始删除路由: ${route.name}`)
      progress.percent = 20
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在从数据库删除...')
        progress.percent = 40
        updateContent()

        const res = await api.delete(`/clusters/${cluster.id}/routes/${route.id}`)
        const data = res.data

        progress.percent = 60
        addLog(`数据库: ${data.message}`)
        addLog('')

        if (data.results && data.results.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of data.results) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${data.results.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (data.results && data.results.length > 0 && !data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (data.results && data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('⚠️ 部分节点删除失败（数据库已删除），请手动清理')
        } else {
          progress.status = 'success'
          addLog('✅ 数据库已删除')
        }

        updateContent()

        const res2 = await api.get(`/clusters/${cluster.id}/routes`)
        cluster.routes = res2.data.items
        cluster.route_count = cluster.routes.length
        cluster.selectedRoute = null
      } catch (error: any) {
        const detail = error.response?.data?.detail
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
        updateContent()
      }
      modal.update({ okButtonProps: { disabled: false } })
    }
  })
}

const publishUpstream = async (cluster: Cluster) => {
  if (!cluster.selectedUpstream) {
    message.warning('请先选择一个上游')
    return
  }
  Modal.confirm({
    title: '确认发布',
    content: `确定要将上游"${cluster.selectedUpstream.name}"发布到 ${cluster.healthy_node_count || cluster.node_count || 0} 个 Edge 节点吗？`,
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `发布上游: ${cluster.selectedUpstream!.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始发布上游: ${cluster.selectedUpstream!.name}`)
      progress.percent = 10
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在构建发布配置...')
        progress.percent = 30
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/upstreams/${cluster.selectedUpstream!.id}/publish`)
        const data = res.data
        progress.percent = 70

        addLog(`状态: ${data.status}`)
        addLog(`消息: ${data.message}`)
        addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }

        progress.percent = 100
        addLog('')
        if (data.status === 'ok') {
          progress.status = 'success'
          addLog('✅ 发布成功!')
        } else if (data.status === 'partial') {
          progress.status = 'exception'
          addLog('⚠️ 部分成功')
        } else {
          progress.status = 'exception'
          addLog('❌ 发布失败')
        }
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 发布失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
  })
}

const openUpstreamVersionManagement = (cluster: Cluster) => {
  if (!cluster.selectedUpstream) {
    message.warning('请先选择一个上游')
    return
  }
  versionModalType.value = 'upstream'
  versionModalResourceId.value = cluster.selectedUpstream.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = cluster.selectedUpstream.name
  versionModalEdgeUuid.value = cluster.selectedUpstream.edge_uuid || ''
  versionModalVisible.value = true
}

const versionModalOnPublished = async () => {
  const cluster = clusters.value.find(c => c.id === versionModalClusterId.value)
  if (!cluster) return

  if (versionModalType.value === 'upstream') {
    await loadUpstreams(cluster)
  } else if (versionModalType.value === 'plugin_config') {
    await loadPluginConfigs(cluster)
  }
}

const publishRoute = async (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  Modal.confirm({
    title: '确认发布',
    content: `确定要将路由"${cluster.selectedRoute.name}"发布到 ${cluster.healthy_node_count || cluster.node_count || 0} 个 Edge 节点吗？`,
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `发布路由: ${cluster.selectedRoute!.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始发布路由: ${cluster.selectedRoute!.name}`)
      progress.percent = 10
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在构建发布配置...')
        progress.percent = 30
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/routes/${cluster.selectedRoute!.id}/publish`)
        const data = res.data
        progress.percent = 70

        addLog(`状态: ${data.status}`)
        addLog(`消息: ${data.message}`)
        addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }

        progress.percent = 100
        addLog('')
        if (data.status === 'ok') {
          progress.status = 'success'
          addLog('✅ 发布成功!')
        } else if (data.status === 'partial') {
          progress.status = 'exception'
          addLog('⚠️ 部分成功')
        } else {
          progress.status = 'exception'
          addLog('❌ 发布失败')
        }
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 发布失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
  })
}

const openRouteVersionManagement = (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  versionModalType.value = 'route'
  versionModalResourceId.value = cluster.selectedRoute.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = cluster.selectedRoute.name
  versionModalEdgeUuid.value = cluster.selectedRoute.edge_uuid || ''
  versionModalVisible.value = true
}

const publishUpstreamByRecord = async (cluster: Cluster, record: Upstream) => {
  Modal.confirm({
    title: '确认发布',
    content: `确定要将上游"${record.name}"发布到 ${cluster.healthy_node_count || cluster.node_count || 0} 个 Edge 节点吗？`,
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `发布上游: ${record.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始发布上游: ${record.name}`)
      progress.percent = 10
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在构建发布配置...')
        progress.percent = 30
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/upstreams/${record.id}/publish`)
        const data = res.data
        progress.percent = 70

        addLog(`状态: ${data.status}`)
        addLog(`消息: ${data.message}`)
        addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }

        progress.percent = 100
        addLog('')
        if (data.status === 'ok') {
          progress.status = 'success'
          addLog('✅ 发布成功!')
        } else if (data.status === 'partial') {
          progress.status = 'exception'
          addLog('⚠️ 部分成功')
        } else {
          progress.status = 'exception'
          addLog('❌ 发布失败')
        }
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 发布失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
  })
}

const openUpstreamVersionManagementByRecord = (cluster: Cluster, record: Upstream) => {
  versionModalType.value = 'upstream'
  versionModalResourceId.value = record.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = record.name
  versionModalEdgeUuid.value = record.edge_uuid || ''
  versionModalVisible.value = true
}

const publishRouteByRecord = async (cluster: Cluster, record: Route) => {
  Modal.confirm({
    title: '确认发布',
    content: `确定要将路由"${record.name}"发布到 ${cluster.healthy_node_count || cluster.node_count || 0} 个 Edge 节点吗？`,
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `发布路由: ${record.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始发布路由: ${record.name}`)
      progress.percent = 10
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在构建发布配置...')
        progress.percent = 30
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/routes/${record.id}/publish`)
        const data = res.data
        progress.percent = 70

        addLog(`状态: ${data.status}`)
        addLog(`消息: ${data.message}`)
        addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }

        progress.percent = 100
        addLog('')
        if (data.status === 'ok') {
          progress.status = 'success'
          addLog('✅ 发布成功!')
        } else if (data.status === 'partial') {
          progress.status = 'exception'
          addLog('⚠️ 部分成功')
        } else {
          progress.status = 'exception'
          addLog('❌ 发布失败')
        }
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 发布失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
  })
}

const openRouteVersionManagementByRecord = (cluster: Cluster, record: Route) => {
  versionModalType.value = 'route'
  versionModalResourceId.value = record.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = record.name
  versionModalEdgeUuid.value = record.edge_uuid || ''
  versionModalVisible.value = true
}

// 插件组相关方法
const loadPluginConfigs = async (cluster: Cluster) => {
  try {
    const res = await api.get(`/clusters/${cluster.id}/plugin_configs`)
    cluster.plugin_configs = res.data.items || res.data || []
  } catch (error: any) {
    message.error('加载插件组列表失败')
    cluster.plugin_configs = []
  }
}

const showAddPluginConfig = async (cluster: Cluster) => {
  await loadPluginConfigs(cluster)
  pluginConfigFormMode.value = 'add'
  pluginConfigEditingClusterId.value = cluster.id
  pluginConfigEditingId.value = null
  pluginConfigFormData.name = ''
  pluginConfigFormData.description = ''
  pluginConfigFormData.pluginsJson = '{}'
  pluginConfigModalVisible.value = true
}

const editPluginConfig = async (cluster: Cluster, pc: any) => {
  pluginConfigFormMode.value = 'edit'
  pluginConfigEditingClusterId.value = cluster.id
  pluginConfigEditingId.value = pc.id
  pluginConfigFormData.name = pc.name || ''
  pluginConfigFormData.description = pc.description || ''
  pluginConfigFormData.pluginsJson = JSON.stringify(pc.plugins || {}, null, 2)
  pluginConfigModalVisible.value = true
}

const handlePluginConfigSubmit = async () => {
  if (!pluginConfigEditingClusterId.value) return
  if (!pluginConfigFormData.name) {
    message.warning('请输入插件组名称')
    return
  }
  if (!pluginConfigFormData.pluginsJson) {
    message.warning('请输入插件配置JSON')
    return
  }

  let plugins: Record<string, any>
  try {
    plugins = JSON.parse(pluginConfigFormData.pluginsJson)
  } catch {
    message.warning('插件配置JSON格式不正确')
    return
  }

  try {
    const payload = {
      name: pluginConfigFormData.name,
      description: pluginConfigFormData.description,
      plugins
    }

    if (pluginConfigEditingId.value) {
      await api.put(`/clusters/${pluginConfigEditingClusterId.value}/plugin_configs/${pluginConfigEditingId.value}`, payload)
      message.success('插件组已更新')
    } else {
      await api.post(`/clusters/${pluginConfigEditingClusterId.value}/plugin_configs`, payload)
      message.success('插件组已添加')
    }

    pluginConfigModalVisible.value = false
    const cluster = clusters.value.find(c => c.id === pluginConfigEditingClusterId.value)
    if (cluster) {
      await loadPluginConfigs(cluster)
    }
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  }
}

const deletePluginConfig = (cluster: Cluster, pc: any) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除插件组"${pc.name}"吗？将同时删除数据库记录及所有 Edge 节点上的对应数据，此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `删除插件组: ${pc.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始删除插件组: ${pc.name}`)
      progress.percent = 20
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在从数据库删除...')
        progress.percent = 40
        updateContent()

        const res = await api.delete(`/clusters/${cluster.id}/plugin_configs/${pc.id}`)
        const data = res.data

        progress.percent = 60
        addLog(`数据库: ${data.message}`)
        addLog('')

        if (data.results && data.results.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of data.results) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${data.results.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (data.results && data.results.length > 0 && !data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (data.results && data.results.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('⚠️ 部分节点删除失败（数据库已删除），请手动清理')
        } else {
          progress.status = 'success'
          addLog('✅ 数据库已删除')
        }

        updateContent()

        await loadPluginConfigs(cluster)
        cluster.selectedPluginConfig = null
      } catch (error: any) {
        const detail = error.response?.data?.detail
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
        updateContent()
      }
      modal.update({ okButtonProps: { disabled: false } })
    }
  })
}

const publishPluginConfig = async (cluster: Cluster, pc?: any) => {
  const target = pc || cluster.selectedPluginConfig
  if (!target) {
    message.warning('请先选择一个插件组')
    return
  }
  Modal.confirm({
    title: '确认发布',
    content: `确定要将插件组"${target.name}"发布到 ${cluster.healthy_node_count || cluster.node_count || 0} 个 Edge 节点吗？`,
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `发布插件组: ${target.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const updateContent = () => {
        modal.update({ content: buildDeleteProgressContent(progress, logs) })
      }

      addLog(`开始发布插件组: ${target.name}`)
      progress.percent = 10
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在构建发布配置...')
        progress.percent = 30
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/plugin_configs/${target.id}/publish`)
        const data = res.data
        progress.percent = 70

        addLog(`状态: ${data.status}`)
        addLog(`消息: ${data.message}`)
        addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }

        progress.percent = 100
        addLog('')
        if (data.status === 'ok') {
          progress.status = 'success'
          addLog('✅ 发布成功!')
        } else if (data.status === 'partial') {
          progress.status = 'exception'
          addLog('⚠️ 部分成功')
        } else {
          progress.status = 'exception'
          addLog('❌ 发布失败')
        }
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 发布失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
  })
}

const openPluginConfigVersionManagement = (cluster: Cluster) => {
  const target = cluster.selectedPluginConfig
  if (!target) {
    message.warning('请先选择一个插件组')
    return
  }
  versionModalType.value = 'plugin_config'
  versionModalResourceId.value = target.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = target.name
  versionModalEdgeUuid.value = target.edge_uuid || ''
  versionModalVisible.value = true
}

onMounted(() => {
  const storedUser = localStorage.getItem('user')
  if (storedUser && !authStore.user) {
    authStore.user = JSON.parse(storedUser)
  }
  loadClusters()
})
</script>

<style scoped>
.cluster-list {
  padding: 0;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions h2 {
  margin: 0;
}

.cluster-grid {
  margin-top: 16px;
}

.cluster-card {
  height: 100%;
  width: 100%;
}

.cluster-card :deep(.ant-card-head) {
  min-height: 48px;
}

.cluster-card :deep(.ant-card-head-title) {
  padding: 8px 0;
}

.card-title {
  display: flex;
  align-items: center;
  font-weight: 500;
  width: 100%;
}

.card-title :deep(.anticon) {
  font-size: 18px;
  color: #1890ff;
  margin-right: 8px;
}

.cluster-title-name {
  text-align: left;
}

.cluster-name-hint {
  color: #999;
  font-weight: normal;
  font-size: 12px;
  margin-left: 8px;
}

.title-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.title-actions :deep(.ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 13px;
}

.stat-item :deep(.anticon) {
  color: #1890ff;
}

.stat-item-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
  font-size: 13px;
  color: #666;
}

.stat-item-inline :deep(.anticon) {
  color: #1890ff;
}

.cluster-tabs {
  margin-bottom: 8px;
}

.cluster-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

.cluster-tabs :deep(.ant-tabs-tab) {
  padding: 8px 16px !important;
}

.node-tab {
  width: 100%;
}

.node-tab :deep(.ant-table-wrapper) {
  width: 100%;
}

.node-tab :deep(.ant-table) {
  width: 100% !important;
}

.tab-content {
  min-height: 100px;
}

.cluster-desc {
  color: #666;
  font-size: 13px;
  margin: 0;
}

.no-desc {
  color: #999;
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

.node-tab {
  padding: 0;
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

.node-table :deep(.ant-table-thead > tr > th) {
  padding: 8px;
}

.node-table :deep(.ant-table-tbody > tr > td) {
  padding: 8px;
}

.empty-state {
  padding: 48px 0;
  text-align: center;
}
</style>