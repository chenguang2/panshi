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
        </div>
      </div>
      <a-button type="primary" @click="showAddModal">添加集群</a-button>
    </div>

    <TransitionGroup v-if="gridClusters.length > 0" name="grid" tag="div" class="cluster-grid">
      <div v-for="cluster in gridClusters" :key="cluster.id"
           class="cluster-card">

        <!-- Clickable expand row: status + name only -->
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
        </div>

        <!-- Stats + actions row -->
        <div class="card-header">
          <div class="stats-bar">
            <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
            <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
            <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
          </div>
          <div class="cactions">
            <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
            <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
          </div>
        </div>

        <!-- Chips row -->
        <div class="chips-row">
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'nodes')">集群节点 <span class="cb">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'upstreams')">上游 <span class="cb">{{ cluster.upstream_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'routes')">路由 <span class="cb">{{ cluster.route_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalPlugins')">插件元数据</span>
          <span v-if="authStore.hasPermission('plugin_groups')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'pluginConfigs')">插件组</span>
          <span v-if="authStore.hasPermission('global_rules')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalRules')">全局规则</span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'staticResources')">静态资源</span>
        </div>

      </div>
    </TransitionGroup>

    <!-- EXPANDED AREA: clusters removed from grid -->
    <TransitionGroup v-if="expandedClusters.length > 0" name="expand" tag="div" class="expanded-area">
      <div v-for="cluster in expandedClusters" :key="cluster.id"
           class="card-expanded" :data-cluster-id="cluster.id">
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
          <div class="click-zone on">
            <span class="arrow">⬆</span>
            <span class="label">收回</span>
          </div>
        </div>
        <!-- Stats + actions row -->
        <div class="card-header">
          <div class="stats-bar">
            <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
            <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
            <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
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
            <span v-if="authStore.hasPermission('plugin_groups')" class="dt" :class="{ active: cluster.activeTab === 'pluginConfigs' }" @click="cluster.activeTab = 'pluginConfigs'; handleTabClick(cluster, 'pluginConfigs')">插件组</span>
            <span v-if="authStore.hasPermission('global_rules')" class="dt" :class="{ active: cluster.activeTab === 'globalRules' }" @click="cluster.activeTab = 'globalRules'; handleTabClick(cluster, 'globalRules')">全局规则</span>
            <span class="dt" :class="{ active: cluster.activeTab === 'staticResources' }" @click="cluster.activeTab = 'staticResources'; handleTabClick(cluster, 'staticResources')">静态资源</span>
          </div>
          <div class="dbody">
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
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; min-height: 46px;">
                  <strong style="font-size: 14px;">{{ pc.name }}</strong>
                  <div style="text-align: right;">
                    <div style="margin-bottom: 2px;">
                      <a-tag v-if="pc.current_version" color="green" size="small">已发布</a-tag>
                      <a-tag v-else color="orange" size="small">未发布</a-tag>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      <template v-if="pc.current_version && pc.published_at">v{{ pc.current_version }} · {{ formatPublishDateTime(pc.published_at) }}</template>
                      <template v-else-if="pc.current_version">v{{ pc.current_version }} · 未同步</template>
                      <template v-else>&nbsp;</template>
                    </div>
                  </div>
                </div>
                <div v-if="pc.description" style="font-size: 12px; color: #666; margin-bottom: 12px;">{{ pc.description }}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                  <a-tag
                    v-for="(pcfg, pname) in pc.plugins"
                    :key="pname"
                    color="blue"
                    style="cursor: pointer;"
                    @click.stop="viewPluginConfigDetail(pc, pname, pcfg)"
                  >
                    {{ pname }}
                  </a-tag>
                  <span v-if="!pc.plugins || Object.keys(pc.plugins).length === 0" style="font-size: 12px; color: #ccc;">无插件</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center;">
                  <a-button size="small" @click.stop="viewPluginConfig(pc)" title="查看"><EyeOutlined /></a-button>
                  <a-button size="small" @click.stop="editPluginConfig(cluster, pc)" title="编辑"><EditOutlined /></a-button>
                  <a-button size="small" @click.stop="deletePluginConfig(cluster, pc)" danger title="删除"><DeleteOutlined /></a-button>
                  <span style="flex:1"></span>
                  <a-button size="small" @click.stop="publishPluginConfig(cluster, pc)">发布</a-button>
                  <a-button size="small" @click.stop="openPluginConfigVersionManagement(cluster, pc)">版本管理</a-button>
                </div>
              </div>
              <div v-if="!cluster.plugin_configs || cluster.plugin_configs.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
                暂无插件组，点击"添加插件组"创建
              </div>
            </div>
          </div>
          <div v-else-if="cluster.activeTab === 'globalRules'" class="tab-content">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddGlobalRule(cluster)">添加全局规则</a-button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
              <div
                v-for="gr in cluster.global_rules"
                :key="gr.id"
                class="plugin-config-card"
                :class="{ selected: cluster.selectedGlobalRule?.id === gr.id }"
                @click="cluster.selectedGlobalRule = gr"
                style="width: 320px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; background: #fff;"
              >
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; min-height: 46px;">
                  <strong style="font-size: 14px;">{{ gr.name }}</strong>
                  <div style="text-align: right;">
                    <div style="margin-bottom: 2px;">
                      <a-tag v-if="gr.current_version" color="green" size="small">已发布</a-tag>
                      <a-tag v-else color="orange" size="small">未发布</a-tag>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      <template v-if="gr.current_version && gr.published_at">v{{ gr.current_version }} · {{ formatPublishDateTime(gr.published_at) }}</template>
                      <template v-else-if="gr.current_version">v{{ gr.current_version }} · 未同步</template>
                      <template v-else>&nbsp;</template>
                    </div>
                  </div>
                </div>
                <div v-if="gr.description" style="font-size: 12px; color: #666; margin-bottom: 12px;">{{ gr.description }}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                  <a-tag v-for="(cfg, pname) in gr.plugins" :key="pname" color="blue" style="cursor: pointer;" @click.stop="viewGlobalRulePluginConfig(gr, pname, cfg)">{{ pname }}</a-tag>
                  <span v-if="!gr.plugins || Object.keys(gr.plugins).length === 0" style="font-size: 12px; color: #ccc;">无插件</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center;">
                  <a-button size="small" @click.stop="viewGlobalRule(gr)" title="查看"><EyeOutlined /></a-button>
                  <a-button size="small" @click.stop="editGlobalRule(cluster, gr)" title="编辑"><EditOutlined /></a-button>
                  <a-button size="small" @click.stop="deleteGlobalRule(cluster, gr)" danger title="删除"><DeleteOutlined /></a-button>
                  <span style="flex:1"></span>
                  <a-button size="small" @click.stop="publishGlobalRule(cluster, gr)">发布</a-button>
                  <a-button size="small" @click.stop="openGlobalRuleVersionManagement(cluster, gr)">版本管理</a-button>
                </div>
              </div>
              <div v-if="!cluster.global_rules || cluster.global_rules.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
                暂无全局规则，点击"添加全局规则"创建
              </div>
            </div>
          </div>
          <div v-else-if="cluster.activeTab === 'staticResources'" class="tab-content">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddStaticResource(cluster)">添加静态资源</a-button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
              <div
                v-for="sr in cluster.static_resources"
                :key="sr.id"
                class="plugin-config-card"
                :class="{ selected: cluster.selectedStaticResource?.id === sr.id }"
                @click="cluster.selectedStaticResource = sr"
                style="width: 360px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; background: #fff;"
              >
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <strong style="font-size: 14px;">{{ sr.name }}</strong>
                    <div style="font-size: 12px; color: #1890ff; margin-top: 2px;">{{ sr.url_path }}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="margin-bottom: 2px;">
                      <a-tag v-if="sr.current_version" color="green" size="small">已发布</a-tag>
                      <a-tag v-else color="orange" size="small">未发布</a-tag>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      <template v-if="sr.current_version && sr.updated_at">v{{ sr.current_version }} · {{ formatPublishDateTime(sr.updated_at) }}</template>
                      <template v-else-if="sr.current_version">v{{ sr.current_version }} · 未同步</template>
                      <template v-else>&nbsp;</template>
                    </div>
                  </div>
                </div>
                <div v-if="sr.description" style="font-size: 12px; color: #666; margin-bottom: 8px;">{{ sr.description }}</div>
                <div v-if="sr.file_size" style="font-size: 12px; color: #999; margin-bottom: 8px;">大小: {{ (sr.file_size / 1024).toFixed(1) }} KB</div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                  <a-button size="small" @click.stop="editStaticResource(cluster, sr)" title="编辑"><EditOutlined /></a-button>
                  <a-button size="small" @click.stop="uploadStaticResourceZip(sr)" :disabled="!sr.id">上传 ZIP</a-button>
                  <a-button size="small" @click.stop="publishStaticResource(cluster, sr)" :disabled="!sr.file_size">发布</a-button>
                  <a-button size="small" @click.stop="openStaticResourceVersionManagement(cluster, sr)" :disabled="!sr.current_version">版本管理</a-button>
                  <span style="flex:1"></span>
                  <a-button size="small" danger @click.stop="deleteStaticResource(cluster, sr)" title="删除"><DeleteOutlined /></a-button>
                </div>
              </div>
              <div v-if="!cluster.static_resources || cluster.static_resources.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
                暂无静态资源，点击"添加静态资源"创建
              </div>
            </div>
          </div>
          <div v-else-if="cluster.activeTab === 'globalPlugins'" class="tab-content">
            <PluginMetadata :cluster-id="cluster.id" :nodes="cluster.nodes" />
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
                  <template v-for="btnKey in nodeActionsSelected" :key="btnKey">
                    <a-button size="small" @click="handleNodeAction(cluster, record, btnKey)">
                      {{ getNodeActionButtonTitle(btnKey) }}
                    </a-button>
                  </template>
                  <a-dropdown v-if="moreNodeActions.length > 0">
                    <a-button size="small">
                      更多 <DownOutlined />
                    </a-button>
                    <template #overlay>
                      <a-menu @click="({ key }) => handleNodeAction(cluster, record, key)">
                        <a-menu-item v-for="btn in moreNodeActions" :key="btn.key">
                          {{ btn.title }}
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </template>
              </template>
            </a-table>
          </div>
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
                <a-textarea v-model:value="checksJson" :rows="6" placeholder="健康检查JSON配置" />
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
              <a-select v-model:value="routeForm.methods" mode="multiple" placeholder="可选多个方法" style="width: 300px">
                <a-select-option value="GET">GET</a-select-option>
                <a-select-option value="POST">POST</a-select-option>
                <a-select-option value="PUT">PUT</a-select-option>
                <a-select-option value="DELETE">DELETE</a-select-option>
                <a-select-option value="PATCH">PATCH</a-select-option>
                <a-select-option value="HEAD">HEAD</a-select-option>
                <a-select-option value="OPTIONS">OPTIONS</a-select-option>
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

        <a-tab-pane v-if="authStore.hasPermission('plugin_groups')" key="pluginGroups" tab="插件组">
          <div v-if="clusterPluginGroups.length === 0" style="padding: 40px 0; text-align: center; color: #999;">
            暂无插件组，请在"插件组"Tab 中创建
          </div>
          <div v-else>
            <div style="margin-bottom: 12px; font-size: 12px; color: #999;">勾选要关联到此路由的插件组，插件配置将合并到路由中</div>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <div
                v-for="pg in clusterPluginGroups"
                :key="pg.id"
                class="plugin-config-card"
                :class="{ selected: isPluginGroupSelected(pg.edge_uuid) }"
                @click="togglePluginGroup(pg)"
                style="width: 280px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s; background: #fff;"
              >
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <a-checkbox :checked="isPluginGroupSelected(pg.edge_uuid)" @click.stop="togglePluginGroup(pg)" />
                  <strong style="font-size: 13px;">{{ pg.name }}</strong>
                  <span style="font-size: 11px; color: #999;">v{{ pg.current_version || 0 }}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                  <a-tag
                    v-for="(pcfg, pname) in pg.plugins"
                    :key="pname"
                    color="blue"
                    style="font-size: 11px; cursor: pointer;"
                    @click.stop="viewPluginConfigDetail(pg, pname, pcfg)"
                  >
                    {{ pname }}
                  </a-tag>
                </div>
                <div v-if="pg.description" style="font-size: 11px; color: #999;">{{ pg.description }}</div>
              </div>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <a-modal v-model:open="pluginConfigModalVisible" :title="pluginConfigFormMode === 'add' ? '添加插件组' : '编辑插件组'" width="800px" @ok="handlePluginConfigSubmit" :ok-text="pluginConfigFormMode === 'add' ? '创建' : '保存'">
      <a-tabs v-model:activeKey="pluginConfigActiveTab">
        <a-tab-pane key="basic" tab="基础配置">
          <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入插件组名称' }]">
              <a-input v-model:value="pluginConfigFormData.name" placeholder="请输入插件组名称" />
            </a-form-item>
            <a-form-item label="描述" name="description">
              <a-textarea v-model:value="pluginConfigFormData.description" :rows="2" placeholder="可选描述" />
            </a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="plugins" tab="插件配置">
          <PluginSelector
            v-model="pluginConfigFormData.selectedPlugins"
            :plugins="availablePlugins"
          />
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <a-modal v-model:open="globalRuleModalVisible" :title="globalRuleFormMode === 'add' ? '添加全局规则' : '编辑全局规则'" width="800px" @ok="handleGlobalRuleSubmit" :ok-text="globalRuleFormMode === 'add' ? '创建' : '保存'">
      <a-tabs v-model:activeKey="globalRuleActiveTab">
        <a-tab-pane key="basic" tab="基础配置">
          <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入名称' }]">
              <a-input v-model:value="globalRuleFormData.name" placeholder="请输入名称" />
            </a-form-item>
            <a-form-item label="描述" name="description">
              <a-textarea v-model:value="globalRuleFormData.description" :rows="2" placeholder="可选描述" />
            </a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="plugins" tab="插件配置">
          <PluginSelector v-model="globalRuleFormData.selectedPlugins" :plugins="availablePlugins.filter(p => ['traceid', 'monitor'].includes(p.name))" />
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <a-modal
      v-model:open="staticResourceModalVisible"
      :title="staticResourceFormMode === 'add' ? '添加静态资源' : '编辑静态资源'"
      @ok="handleStaticResourceSubmit"
      width="600px"
      :ok-text="staticResourceFormMode === 'add' ? '创建' : '保存'"
      :ok-button-props="{ disabled: staticResourceFormMode === 'add' && !staticResourceFormValid }"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item v-if="staticResourceFormMode === 'add'" label="选择路由">
          <a-select
            v-model:value="staticResourceFormData.route_id"
            placeholder="请选择路由"
            show-search
            :filter-option="(input: string, option: any) => option.children.toLowerCase().includes(input.toLowerCase())"
            @change="onStaticResourceRouteChange"
          >
            <a-select-option v-for="r in srActiveCluster?.routes || []" :key="r.id" :value="r.id">
              {{ r.name }} ({{ r.uri }})
            </a-select-option>
          </a-select>
          <div style="margin-top: 6px; font-size: 12px;">
            <div style="color: #999;">选择路由的要求：</div>
            <div :style="{ color: !uriValid ? '#ff4d4f' : '#52c41a' }">
              {{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾
            </div>
            <div :style="{ color: !publishedValid ? '#ff4d4f' : '#52c41a' }">
              {{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点
            </div>
            <div :style="{ color: !pluginValid ? '#ff4d4f' : '#52c41a' }">
              {{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件
            </div>
          </div>
        </a-form-item>
        <a-form-item v-else label="关联路由">
          <span>{{ staticResourceFormData.name }} ({{ staticResourceFormData.url_path }})</span>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="staticResourceFormData.description" :rows="2" placeholder="可选描述" />
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

    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />

    <!-- 查看插件组 -->
    <a-drawer
      v-model:open="viewPcDrawerVisible"
      :title="`查看插件组 - ${viewingPc?.name}`"
      width="600"
      @close="viewPcDrawerVisible = false"
    >
      <div v-if="viewingPc">
        <a-descriptions :column="1" bordered>
          <a-descriptions-item label="名称">{{ viewingPc.name }}</a-descriptions-item>
          <a-descriptions-item label="描述">{{ viewingPc.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag v-if="viewingPc.current_version" color="green">已发布</a-tag>
            <a-tag v-else color="orange">未发布</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="版本" v-if="viewingPc.current_version">v{{ viewingPc.current_version }}</a-descriptions-item>
        </a-descriptions>
        <a-divider>插件配置</a-divider>
        <pre class="config-preview">{{ JSON.stringify(viewingPc.plugins, null, 2) }}</pre>
      </div>
    </a-drawer>

    <!-- 查看全局规则 -->
    <a-drawer
      v-model:open="viewGrDrawerVisible"
      :title="`查看全局规则 - ${viewingGr?.name}`"
      width="600"
      @close="viewGrDrawerVisible = false"
    >
      <div v-if="viewingGr">
        <a-descriptions :column="1" bordered>
          <a-descriptions-item label="名称">{{ viewingGr.name }}</a-descriptions-item>
          <a-descriptions-item label="描述">{{ viewingGr.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag v-if="viewingGr.current_version" color="green">已发布</a-tag>
            <a-tag v-else color="orange">未发布</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="版本" v-if="viewingGr.current_version">v{{ viewingGr.current_version }}</a-descriptions-item>
        </a-descriptions>
        <a-divider>插件配置</a-divider>
        <pre class="config-preview">{{ JSON.stringify(viewingGr.plugins, null, 2) }}</pre>
      </div>
    </a-drawer>

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
import { ref, reactive, computed, onMounted, watch, h } from 'vue'
import { message, Modal, Progress } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { CloudOutlined, TeamOutlined, CloudServerOutlined, GatewayOutlined, PlusOutlined, WarningOutlined, DownOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster, Node, Upstream, Route, Plugin, RoutePlugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PluginSelector from '@/components/PluginSelector.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import PluginMetadata from '@/components/PluginMetadata.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'

const router = useRouter()
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

function toggleExpand(clusterId: number) {
  const s = new Set(expandedIds.value)
  const order = [...expandedOrder.value]
  if (s.has(clusterId)) {
    s.delete(clusterId)
    const idx = order.indexOf(clusterId)
    if (idx > -1) order.splice(idx, 1)
  } else {
    s.add(clusterId)
    order.push(clusterId)
  }
  expandedIds.value = s
  expandedOrder.value = order
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

function isExpanded(clusterId: number): boolean {
  return expandedIds.value.has(clusterId)
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

function onDragEnd(event: DragEvent) {
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach(el => {
    el.classList.remove('drag-over', 'dragging')
  })
  draggedClusterId = null
}

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
const diffDrawerVisible = ref(false)
let diffClusterId = 0
let diffNodeId = 0

// 查看插件组 / 全局规则
const viewPcDrawerVisible = ref(false)
const viewingPc = ref<any>(null)
const viewGrDrawerVisible = ref(false)
const viewingGr = ref<any>(null)
const nameError = ref('')
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

// Plugin Config state
const pluginConfigModalVisible = ref(false)
const pluginConfigActiveTab = ref('basic')
const pluginConfigFormMode = ref<'add' | 'edit'>('add')
const pluginConfigEditingClusterId = ref<number | null>(null)
const pluginConfigEditingId = ref<number | null>(null)

const globalRuleModalVisible = ref(false)
const globalRuleActiveTab = ref('basic')
const globalRuleFormMode = ref<'add' | 'edit'>('add')
const globalRuleEditingClusterId = ref<number | null>(null)
const globalRuleEditingId = ref<number | null>(null)
const globalRuleFormData = reactive({ name: '', description: '', selectedPlugins: [] as any[] })
const pluginConfigFormData = reactive({
  name: '',
  description: '',
  selectedPlugins: [] as any[]
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

const publishStatusRender = (version: number | null, publishedAt: string | null) => {
  const published = version !== null && version !== undefined
  if (published && publishedAt) {
    return h('span', [
      h('span', {
        style: 'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
      }, `v${version}`),
      h('span', {
        style: 'font-size:11px;color:#666;margin-left:4px;cursor:help;',
        title: `发布时间: ${formatPublishDateTime(publishedAt)}`
      }, ` ${formatPublishDateTime(publishedAt)}`),
    ])
  }
  if (published) {
    return h('span', {
      style: 'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
    }, `v${version} · 未同步`)
  }
  return h('span', {
    style: 'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #d9d9d9;color:#999;background:#fafafa;',
  }, '未发布')
}

const formatPublishDate = (isoStr: string | null): string => {
  if (!isoStr) return ''
  try { return new Date(isoStr).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) } catch { return '' }
}

const formatPublishDateTime = (isoStr: string | null): string => {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  } catch { return '' }
}

const allUpstreamColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: '负载均衡', dataIndex: 'load_balance', key: 'load_balance', sorter: true, customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text) },
  { title: '描述', dataIndex: 'description', key: 'description', sorter: true },
  { title: '发布状态', key: 'publish_status', width: 140, customRender: ({ record }: any) =>
    publishStatusRender(record.current_version, record.published_at) },
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
  { title: '发布状态', key: 'publish_status', width: 140, customRender: ({ record }: any) =>
    publishStatusRender(record.current_version, record.published_at) },
  { title: '高级匹配', dataIndex: 'advanced_match_enabled', key: 'advanced_match_enabled' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '操作', key: 'actions', width: 340 }
]

const routeColumnPopoverVisible = ref(false)
const routeColumnsSelected = ref(['name', 'uri', 'publish_status', 'priority', 'actions'])
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
const upstreamColumnsSelected = ref(['name', 'load_balance', 'publish_status', 'description', 'actions'])
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
  { key: 'diff', title: '数据库对比' },
  { key: 'start', title: '启动' },
  { key: 'stop', title: '停止' },
  { key: 'status', title: '状态查询' }
]
const nodeActionsSelected = ref(['start', 'stop', 'status'])
const moreNodeActions = computed(() =>
  allNodeActionButtons.filter(b => !nodeActionsSelected.value.includes(b.key))
)

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
  status: 1,
  admin_key: '',
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
  plugins: [] as RoutePlugin[],
  plugin_config_ids: [] as string[]
})

// 开关高级配置时重置为默认值
watch(() => upstreamForm.advancedEnabled, (newVal) => {
  if (!newVal) {
    upstreamForm.checks = JSON.parse(defaultChecksJson)
    checksJson.value = defaultChecksJson
    upstreamForm.retries = undefined
    upstreamForm.retry_timeout = 0
    upstreamForm.timeout = { ...defaultTimeout }
    upstreamForm.pass_host = 'pass'
    upstreamForm.upstream_host = ''
    upstreamForm.scheme = 'http'
    upstreamForm.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
  }
})

// 开关高级匹配时重置为默认值
watch(() => routeForm.advancedMatchEnabled, (newVal) => {
  if (!newVal) {
    routeForm.advancedMatch = { vars: [] }
  }
})

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

const allMethodsSelected = computed(() => ALL_METHODS.every(m => routeForm.methods.includes(m)))

function toggleAllMethods() {
  routeForm.methods = allMethodsSelected.value ? [] : [...ALL_METHODS]
}

const currentCluster = computed(() => clusters.value.find(c => c.id === currentClusterId.value))

const clusterPluginGroups = computed(() => {
  const c = currentCluster.value
  return c?.plugin_configs || []
})

const isPluginGroupSelected = (edgeUuid: string) => {
  return routeForm.plugin_config_ids.indexOf(edgeUuid) !== -1
}

const togglePluginGroup = (pg: any) => {
  const idx = routeForm.plugin_config_ids.indexOf(pg.edge_uuid)
  if (idx !== -1) {
    routeForm.plugin_config_ids.splice(idx, 1)
  } else {
    routeForm.plugin_config_ids.push(pg.edge_uuid)
  }
}

const viewPluginConfigDetail = (pg: any, pname: string, pcfg: any) => {
  const configStr = typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)
  Modal.info({
    title: `${pg.name} - ${pname}`,
    content: h('pre', { style: 'font-size: 12px; white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px; max-height: 400px; overflow-y: auto;' }, configStr),
    okText: '关闭',
    width: 560
  })
}

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
      editNode(cluster, record)
      break
    case 'delete':
      deleteNode(cluster, record)
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
    case 'diff':
      diffClusterId = cluster.id
      diffNodeId = record.id
      diffDrawerVisible.value = true
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
  } else if (key === 'globalRules') {
    await loadGlobalRules(cluster)
  } else if (key === 'staticResources') {
    await loadStaticResources(cluster)
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

const resourceLabels: Record<string, string> = {
  nodes: 'Edge 节点',
  upstreams: '上游服务',
  routes: '路由规则',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  plugin_metadata: '插件元数据',
  config_versions: '配置版本历史',
}

// Shared delete confirmation with DB/Edge selection
function showDeleteConfirm(opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
}) {
  let deleteDb = false
  let deleteEdge = false
  const selectedNodeIds: Set<number> = new Set((opts.nodes || []).map(n => n.id))
  let confirmModal: any

  const totalCount = opts.stats ? Object.values(opts.stats).reduce((a, b) => a + b, 0) : 0

  const updateOkDisabled = () => {
    const atLeastOne = deleteDb || (deleteEdge && selectedNodeIds.size > 0)
    confirmModal.update({ okButtonProps: { disabled: !atLeastOne } })
  }

  const nodeCheckboxContent = (opts.nodes && opts.nodes.length > 0) ? h('div', {
    style: 'margin-top: 8px; margin-left: 24px; border-left: 2px solid #e8e8e8; padding-left: 12px; display: ' + (deleteEdge ? 'block' : 'none'),
  }, [
    h('div', { style: 'font-size: 12px; color: #666; margin-bottom: 4px;' }, '选择要删除的 Edge 节点：'),
    ...opts.nodes.map(n =>
      h('label', { style: 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px;' }, [
        h('input', {
          type: 'checkbox', checked: selectedNodeIds.has(n.id),
          onInput: (e: any) => {
            if (e.target.checked) selectedNodeIds.add(n.id)
            else selectedNodeIds.delete(n.id)
            updateOkDisabled()
          },
          style: 'width: 14px; height: 14px; cursor: pointer;',
        }),
        h('span', {}, `${n.ip}:${n.management_port}`),
      ])
    ),
  ]) : null

  const content = h('div', { style: 'font-size: 13px;' }, [
    h('div', { style: 'color: #ff4d4f; margin-bottom: 12px; font-weight: 500;' }, opts.title),

    // Resource stats section (only for cluster)
    ...(opts.showResourceStats && opts.stats ? [
      h('div', { style: 'background: #fafafa; border: 1px solid #e8e8e8; border-radius: 6px; padding: 12px; margin-bottom: 12px;' }, [
        h('div', { style: 'font-weight: 600; margin-bottom: 8px; color: #333;' }, '集群资源清单'),
        ...Object.entries(opts.stats).map(([k, v]) =>
          h('div', { style: 'display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f5f5f5;' }, [
            h('span', { style: 'color: #666;' }, resourceLabels[k] || k),
            h('span', { style: 'font-weight: 500;' }, String(v)),
          ])
        ),
        h('div', { style: 'display: flex; justify-content: space-between; padding: 6px 0 0; font-weight: 600; border-top: 2px solid #e8e8e8; margin-top: 4px;' }, [
          h('span', '合计'),
          h('span', `${totalCount} 条记录`),
        ]),
      ])
    ] : []),

    // Delete scope selection
    h('div', { style: 'border-top: 1px solid #e8e8e8; padding-top: 12px;' }, [
      h('label', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteDb,
          onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled() },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, '数据库'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '删除数据库中的记录'),
      ]),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteEdge,
          onInput: (e: any) => {
            deleteEdge = e.target.checked
            if (!deleteEdge) selectedNodeIds.clear()
            // update the node list visibility by re-rendering
            confirmModal.update({
              content: rebuildContent(true)
            })
            updateOkDisabled()
          },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, 'Edge 节点'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '从 Edge 节点中删除'),
      ]),
      deleteEdge && opts.nodes ? nodeCheckboxContent : null,
    ]),
  ])

  function rebuildContent(force?: boolean): any {
    const showNodes = force !== undefined ? force : deleteEdge
    const nc = (opts.nodes && opts.nodes.length > 0) ? h('div', {
      style: 'margin-top: 8px; margin-left: 24px; border-left: 2px solid #e8e8e8; padding-left: 12px; display: ' + (showNodes ? 'block' : 'none'),
    }, [
      h('div', { style: 'font-size: 12px; color: #666; margin-bottom: 4px;' }, '选择要删除的 Edge 节点：'),
      ...opts.nodes.map(n =>
        h('label', { style: 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px;' }, [
          h('input', {
            type: 'checkbox', checked: selectedNodeIds.has(n.id),
            onInput: (e: any) => {
              if (e.target.checked) selectedNodeIds.add(n.id)
              else selectedNodeIds.delete(n.id)
              updateOkDisabled()
            },
            style: 'width: 14px; height: 14px; cursor: pointer;',
          }),
          h('span', {}, `${n.ip}:${n.management_port}`),
        ])
      ),
    ]) : null

    return h('div', { style: 'font-size: 13px;' }, [
      h('div', { style: 'color: #ff4d4f; margin-bottom: 12px; font-weight: 500;' }, opts.title),
      h('div', { style: 'border-top: 1px solid #e8e8e8; padding-top: 12px;' }, [
        h('label', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;' }, [
          h('input', {
            type: 'checkbox', checked: deleteDb,
            onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled() },
            style: 'width: 16px; height: 16px; cursor: pointer;',
          }),
          h('span', { style: 'font-size: 14px;' }, '数据库'),
          h('span', { style: 'color: #999; font-size: 12px;' }, '删除数据库中的记录'),
        ]),
        h('label', { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
          h('input', {
            type: 'checkbox', checked: deleteEdge,
            onInput: (e: any) => {
              deleteEdge = e.target.checked
              if (!deleteEdge) selectedNodeIds.clear()
              confirmModal.update({ content: rebuildContent(true) })
              updateOkDisabled()
            },
            style: 'width: 16px; height: 16px; cursor: pointer;',
          }),
          h('span', { style: 'font-size: 14px;' }, 'Edge 节点'),
          h('span', { style: 'color: #999; font-size: 12px;' }, '从 Edge 节点中删除'),
        ]),
        showNodes ? nc : null,
      ]),
    ])
  }

  confirmModal = Modal.confirm({
    title: '确认删除',
    content,
    okText: '确认删除',
    okType: 'danger' as any,
    cancelText: '取消',
    okButtonProps: { disabled: true },
    onOk: () => {
      opts.onOk(deleteDb, deleteEdge, Array.from(selectedNodeIds))
    },
  })
}

const deleteCluster = async (cluster: Cluster) => {
  const clusterName = cluster.display_name || cluster.name

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
    onOk: async (deleteDb: boolean, deleteEdge: boolean) => {
      const logs: string[] = []
      const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      const progress = { percent: 0, status: 'active' as const }

      const progressModal = Modal.info({
        title: `删除集群: ${clusterName}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })
      const updateContent = () => progressModal.update({ content: buildDeleteProgressContent(progress, logs) })

      addLog(`开始删除集群: ${clusterName}`)
      progress.percent = 20
      updateContent()
      await new Promise(r => setTimeout(r, 300))

      try {
        const actions = []
        if (deleteDb) actions.push('数据库')
        if (deleteEdge) actions.push('Edge 节点')
        addLog(`删除范围: ${actions.join(' + ') || '无'}`)
        progress.percent = 40
        updateContent()

        const res = await api.delete(`/clusters/${cluster.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        } else if (deleteDb) {
          addLog('数据库: 删除失败（无返回结果）')
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          addLog('Edge 节点删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '\u2705' : '\u274C'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 节点, 成功 ${successCount}, 失败 ${failCount}`)
        } else if (deleteEdge) {
          addLog('集群下没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('\u26A0\uFE0F 部分节点删除失败，请在 Edge 节点上手动清理')
        } else {
          progress.status = 'success'
          addLog('\u2705 操作完成！')
        }
        updateContent()

        await loadClusters()
      } catch (error: any) {
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${error.response?.data?.detail || error.message || '未知错误'}`)
        updateContent()
      }

      progressModal.update({ okButtonProps: { disabled: false } })
    },
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

const editNode = (cluster: Cluster, node?: Node) => {
  const target = node || cluster.selectedNode
  if (!target) {
    message.warning('请先选择一个节点')
    return
  }
  editingNode.value = target
  currentClusterId.value = cluster.id
  nodeForm.ip = target.ip
  nodeForm.service_port = target.service_port
  nodeForm.management_port = target.management_port
  nodeForm.edge_path = target.edge_path
  nodeForm.status = target.status
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

const deleteNode = (cluster: Cluster, node?: Node) => {
  const target = node || cluster.selectedNode
  if (!target) {
    message.warning('请先选择一个节点')
    return
  }
  showDeleteConfirm({
    title: `确定要删除节点 "${target.ip}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}/nodes/${target.id}`,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      try {
        await api.delete(`/clusters/${cluster.id}/nodes/${target.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
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
    },
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
  showDeleteConfirm({
    title: `确定要删除上游 "${upstream.name}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}/upstreams/${upstream.id}`,
    nodes: cluster.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
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
        const res = await api.delete(`/clusters/${cluster.id}/upstreams/${upstream.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog('正在从数据库删除...')
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else if (deleteEdge) {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog(`⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`)
        } else {
          progress.status = 'success'
          addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
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
    },
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
    plugins: [],
    plugin_config_ids: []
  })
  routeModalActiveTab.value = 'basic'
  if (cluster.plugin_configs?.length > 0 || !cluster.plugin_configs) {
    await loadPluginConfigs(cluster)
  }
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
  await loadPluginConfigs(cluster)
  
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
  routeForm.plugin_config_ids = (routeData as any).plugin_config_ids ? [...(routeData as any).plugin_config_ids] : []
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

    if (routeForm.plugin_config_ids.length > 0) {
      payload.plugin_config_ids = routeForm.plugin_config_ids
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
  showDeleteConfirm({
    title: `确定要删除路由 "${route.name}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}/routes/${route.id}`,
    nodes: cluster.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
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
        const res = await api.delete(`/clusters/${cluster.id}/routes/${route.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog('正在从数据库删除...')
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else if (deleteEdge) {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog(`⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`)
        } else {
          progress.status = 'success'
          addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
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
    },
  })
}

const publishUpstream = async (cluster: Cluster) => {
  if (!cluster.selectedUpstream) {
    message.warning('请先选择一个上游')
    return
  }
  const nodeIds = await openPublishModal(`发布上游: ${cluster.selectedUpstream.name}`, cluster.id)
  if (!nodeIds.length) return

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

    const res = await api.post(`/clusters/${cluster.id}/upstreams/${cluster.selectedUpstream!.id}/publish`, { node_ids: nodeIds })
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
  } else if (versionModalType.value === 'global_rule') {
    await loadGlobalRules(cluster)
  }
}

const publishRoute = async (cluster: Cluster) => {
  if (!cluster.selectedRoute) {
    message.warning('请先选择一个路由')
    return
  }
  const nodeIds = await openPublishModal(`发布路由: ${cluster.selectedRoute.name}`, cluster.id)
  if (!nodeIds.length) return

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

    const res = await api.post(`/clusters/${cluster.id}/routes/${cluster.selectedRoute!.id}/publish`, { node_ids: nodeIds })
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
  const nodeIds = await openPublishModal(`发布上游: ${record.name}`, cluster.id)
  if (!nodeIds.length) return

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

    const res = await api.post(`/clusters/${cluster.id}/upstreams/${record.id}/publish`, { node_ids: nodeIds })
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

    await loadUpstreams(cluster)
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

const openUpstreamVersionManagementByRecord = (cluster: Cluster, record: Upstream) => {
  versionModalType.value = 'upstream'
  versionModalResourceId.value = record.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = record.name
  versionModalEdgeUuid.value = record.edge_uuid || ''
  versionModalVisible.value = true
}

const publishRouteByRecord = async (cluster: Cluster, record: Route) => {
  const nodeIds = await openPublishModal(`发布路由: ${record.name}`, cluster.id)
  if (!nodeIds.length) return

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

    const res = await api.post(`/clusters/${cluster.id}/routes/${record.id}/publish`, { node_ids: nodeIds })
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

    await loadRoutes(cluster)
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
  if (availablePlugins.value.length === 0) {
    await loadAvailablePlugins()
  }
  pluginConfigFormMode.value = 'add'
  pluginConfigEditingClusterId.value = cluster.id
  pluginConfigEditingId.value = null
  pluginConfigFormData.name = ''
  pluginConfigFormData.description = ''
  pluginConfigFormData.selectedPlugins = []
  pluginConfigActiveTab.value = 'basic'
  pluginConfigModalVisible.value = true
}

const viewPluginConfig = (pc: any) => {
  viewingPc.value = pc
  viewPcDrawerVisible.value = true
}

const editPluginConfig = async (cluster: Cluster, pc: any) => {
  if (availablePlugins.value.length === 0) {
    await loadAvailablePlugins()
  }
  pluginConfigFormMode.value = 'edit'
  pluginConfigEditingClusterId.value = cluster.id
  pluginConfigEditingId.value = pc.id
  pluginConfigFormData.name = pc.name || ''
  pluginConfigFormData.description = pc.description || ''
  pluginConfigFormData.selectedPlugins = Object.entries(pc.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
    plugin_name,
    config: JSON.stringify(config)
  }))
  pluginConfigActiveTab.value = 'basic'
  pluginConfigModalVisible.value = true
}

const handlePluginConfigSubmit = async () => {
  if (!pluginConfigEditingClusterId.value) return
  if (!pluginConfigFormData.name) {
    message.warning('请输入插件组名称')
    return
  }

  const plugins: Record<string, any> = {}
  for (const sp of pluginConfigFormData.selectedPlugins) {
    if (sp.config) {
      try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config }
    } else {
      plugins[sp.plugin_name] = {}
    }
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
  showDeleteConfirm({
    title: `确定要删除插件组 "${pc.name}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}/plugin_configs/${pc.id}`,
    nodes: cluster.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
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
        const res = await api.delete(`/clusters/${cluster.id}/plugin_configs/${pc.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog('正在从数据库删除...')
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else if (deleteEdge) {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog(`⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`)
        } else {
          progress.status = 'success'
          addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
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
    },
  })
}

const publishPluginConfig = async (cluster: Cluster, pc?: any) => {
  const target = pc || cluster.selectedPluginConfig
  if (!target) {
    message.warning('请先选择一个插件组')
    return
  }
  const nodeIds = await openPublishModal(`发布插件组: ${target.name}`, cluster.id)
  if (!nodeIds.length) return

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

    const res = await api.post(`/clusters/${cluster.id}/plugin_configs/${target.id}/publish`, { node_ids: nodeIds })
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
  await loadPluginConfigs(cluster)
}


const loadGlobalRules = async (cluster: Cluster) => {
  try {
    const res = await api.get(`/clusters/${cluster.id}/global_rules`)
    cluster.global_rules = res.data.items || []
  } catch {
    cluster.global_rules = []
  }
}

const showAddGlobalRule = async (cluster: Cluster) => {
  if (availablePlugins.value.length === 0) await loadAvailablePlugins()
  globalRuleFormMode.value = 'add'
  globalRuleEditingClusterId.value = cluster.id
  globalRuleEditingId.value = null
  globalRuleFormData.name = ''
  globalRuleFormData.description = ''
  globalRuleFormData.selectedPlugins = []
  globalRuleActiveTab.value = 'basic'
  globalRuleModalVisible.value = true
}

const viewGlobalRule = (gr: any) => {
  viewingGr.value = gr
  viewGrDrawerVisible.value = true
}

const editGlobalRule = async (cluster: Cluster, gr: any) => {
  if (availablePlugins.value.length === 0) await loadAvailablePlugins()
  globalRuleFormMode.value = 'edit'
  globalRuleEditingClusterId.value = cluster.id
  globalRuleEditingId.value = gr.id
  globalRuleFormData.name = gr.name || ''
  globalRuleFormData.description = gr.description || ''
  globalRuleFormData.selectedPlugins = Object.entries(gr.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
    plugin_name, config: JSON.stringify(config)
  }))
  globalRuleActiveTab.value = 'basic'
  globalRuleModalVisible.value = true
}

const handleGlobalRuleSubmit = async () => {
  if (!globalRuleEditingClusterId.value) return
  if (!globalRuleFormData.name) { message.warning('请输入名称'); return }
  const plugins: Record<string, any> = {}
  for (const sp of globalRuleFormData.selectedPlugins) {
    if (sp.config) { try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config } }
    else { plugins[sp.plugin_name] = {} }
  }
  try {
    const payload = { name: globalRuleFormData.name, description: globalRuleFormData.description, plugins }
    if (globalRuleEditingId.value) {
      await api.put(`/clusters/${globalRuleEditingClusterId.value}/global_rules/${globalRuleEditingId.value}`, payload)
      message.success('全局规则已更新')
    } else {
      await api.post(`/clusters/${globalRuleEditingClusterId.value}/global_rules`, payload)
      message.success('全局规则已添加')
    }
    globalRuleModalVisible.value = false
    const c = clusters.value.find(c => c.id === globalRuleEditingClusterId.value)
    if (c) await loadGlobalRules(c)
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const deleteGlobalRule = (cluster: Cluster, gr: any) => {
  showDeleteConfirm({
    title: `确定要删除全局规则 "${gr.name}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}/global_rules/${gr.id}`,
    nodes: cluster.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      const logs: string[] = []; const addLog = (t: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${t}`)
      const progress = { percent: 0, status: 'active' as const }
      const modal = Modal.info({ title: `删除全局规则: ${gr.name}`, width: 600, content: buildDeleteProgressContent(progress, logs), okText: '确定', okButtonProps: { disabled: true }, cancelText: '', closable: true })
      const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
      addLog(`开始删除: ${gr.name}`); progress.percent = 20; update()
      await new Promise(r => setTimeout(r, 400))
      try {
        const res = await api.delete(`/clusters/${cluster.id}/global_rules/${gr.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } }); const data = res.data
        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) { addLog('正在从数据库删除...'); addLog(`数据库: ${dbResult.message || '已删除'}`) }
        addLog('')
        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('Edge 节点同步删除结果:');
          let ok = 0, fail = 0
          for (const r of edgeResults) { r.status === 'success' ? ok++ : fail++; addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`) }
          addLog(`总计: ${edgeResults.length} 节点, 成功 ${ok}, 失败 ${fail}`)
        } else if (deleteEdge) { addLog('集群中没有活跃的 Edge 节点') }
        progress.percent = 100
        if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) { progress.status = 'success'; addLog('✅ 删除完成!') }
        else if (edgeResults.some((r: any) => r.status === 'failed')) { progress.status = 'exception'; addLog('⚠️ 部分节点删除失败') }
        else { addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`) }
        update()
      } catch (e: any) { progress.percent = 100; progress.status = 'exception'; addLog(`❌ 删除失败: ${e.response?.data?.detail || e.message}`); update() }
      modal.update({ okButtonProps: { disabled: false } })
      await loadGlobalRules(cluster)
    }
  })
}

const publishGlobalRule = async (cluster: Cluster, gr: any) => {
  const nodeIds = await openPublishModal(`发布全局规则: ${gr.name}`, cluster.id)
  if (!nodeIds.length) return

  const logs: string[] = []; const addLog = (t: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${t}`)
  const progress = { percent: 0, status: 'active' as const }
  const modal = Modal.info({ title: `发布全局规则: ${gr.name}`, width: 600, content: buildDeleteProgressContent(progress, logs), okText: '确定', okButtonProps: { disabled: true }, cancelText: '', closable: true })
  const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
  addLog(`开始发布: ${gr.name}`); progress.percent = 10; update()
  await new Promise(r => setTimeout(r, 400))
  try {
    addLog('正在构建发布配置...'); progress.percent = 30; update()
    const res = await api.post(`/clusters/${cluster.id}/global_rules/${gr.id}/publish`, { node_ids: nodeIds }); const data = res.data
    progress.percent = 70; addLog(`状态: ${data.status}`); addLog(`消息: ${data.message}`)
    if (data.results) { addLog(''); addLog('节点同步结果:'); for (const r of data.results) { addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`) } }
    progress.percent = 100
    if (data.status === 'ok') { progress.status = 'success'; addLog('✅ 发布成功!') }
    else if (data.status === 'partial') { progress.status = 'exception'; addLog('⚠️ 部分成功') }
    else { progress.status = 'exception'; addLog('❌ 发布失败') }
    update(); modal.update({ okButtonProps: { disabled: false } })
  } catch (e: any) { progress.percent = 100; progress.status = 'exception'; addLog(`❌ 发布失败: ${e.response?.data?.detail || e.message}`); update(); modal.update({ okButtonProps: { disabled: false } }) }
  await loadGlobalRules(cluster)
}

const openGlobalRuleVersionManagement = (cluster: Cluster, gr: any) => {
  versionModalType.value = 'global_rule'
  versionModalResourceId.value = gr.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = gr.name
  versionModalEdgeUuid.value = gr.edge_uuid || ''
  versionModalVisible.value = true
}

const viewGlobalRulePluginConfig = (gr: any, pname: string, pcfg: any) => {
  Modal.info({
    title: `${gr.name} - ${pname}`,
    content: h('pre', { style: 'font-size:12px;white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:4px;max-height:400px;overflow-y:auto;' }, typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)),
    okText: '关闭', width: 560
  })
}


const staticResourceFormData = reactive({
  route_id: null as number | null,
  name: '',
  url_path: '',
  description: '',
})
const staticResourceRouteInfo = ref<{ valid: boolean; msg: string } | null>(null)
const staticResourceModalVisible = ref(false)

const selectedRoute = computed(() => {
  if (!staticResourceFormData.route_id || !staticResourceEditingCluster.value) return null
  return staticResourceEditingCluster.value.routes?.find((r: any) => r.id === staticResourceFormData.route_id) || null
})
const uriValid = computed(() => {
  const r = selectedRoute.value
  return r ? (r.uri || '').trim().endsWith('/*') : false
})
const publishedValid = computed(() => {
  const r = selectedRoute.value
  return r ? !!(r.current_version || r.published_at) : false
})
const pluginValid = computed(() => {
  const r = selectedRoute.value
  if (!r) return false
  return (r.plugins || []).some((p: any) => p.plugin_name === 'static_resource')
})
const staticResourceFormValid = computed(() => {
  return staticResourceFormData.route_id && uriValid.value && publishedValid.value && pluginValid.value
})
const staticResourceFormMode = ref<'add' | 'edit'>('add')
const staticResourceEditingId = ref<number | null>(null)
const staticResourceEditingCluster = ref<Cluster | null>(null)
const srActiveCluster = computed(() => staticResourceEditingCluster.value)

const loadStaticResources = async (cluster: Cluster) => {
  try {
    cluster.staticResourcesLoading = true
    const res = await api.get(`/clusters/${cluster.id}/static-resources`)
    cluster.static_resources = res.data.items || []
  } catch {
    cluster.static_resources = []
  } finally {
    cluster.staticResourcesLoading = false
  }
}

const onStaticResourceRouteChange = (routeId: number) => {
  const cluster = staticResourceEditingCluster.value
  if (!cluster) return
  const route = cluster.routes?.find((r: any) => r.id === routeId)
  if (!route) {
    staticResourceRouteInfo.value = null
    return
  }
  const uri = (route.uri || '').trim()
  if (!uri.endsWith('/*')) {
    staticResourceRouteInfo.value = { valid: false, msg: '路由路径必须以 /* 结尾' }
    return
  }
  if (!route.current_version && !route.published_at) {
    staticResourceRouteInfo.value = { valid: false, msg: '路由必须先发布到 Edge 节点' }
    return
  }
  staticResourceRouteInfo.value = { valid: true, msg: `路由 "${route.name}" (${uri}) 验证通过` }
}

const showAddStaticResource = async (cluster: Cluster) => {
  staticResourceFormMode.value = 'add'
  staticResourceEditingCluster.value = cluster
  staticResourceEditingId.value = null
  staticResourceFormData.route_id = null
  staticResourceFormData.name = ''
  staticResourceFormData.url_path = ''
  staticResourceFormData.description = ''
  staticResourceRouteInfo.value = null
  if (!cluster.routes || cluster.routes.length === 0) {
    await loadRoutes(cluster)
  }
  staticResourceModalVisible.value = true
}

const editStaticResource = (cluster: Cluster, sr: any) => {
  staticResourceFormMode.value = 'edit'
  staticResourceEditingCluster.value = cluster
  staticResourceEditingId.value = sr.id
  staticResourceFormData.name = sr.name
  staticResourceFormData.url_path = sr.url_path
  staticResourceFormData.description = sr.description || ''
  staticResourceRouteInfo.value = null
  staticResourceModalVisible.value = true
}

const handleStaticResourceSubmit = async () => {
  const cluster = staticResourceEditingCluster.value
  if (!cluster) return

  if (staticResourceFormMode.value === 'add') {
    if (!staticResourceFormData.route_id) {
      message.warning('请选择路由')
      return
    }
    if (!staticResourceRouteInfo.value?.valid) {
      message.warning('请选择符合条件（已发布到 Edge 节点且路径以 /* 结尾）的路由')
      return
    }
  }

  try {
    if (staticResourceFormMode.value === 'add') {
      const payload = {
        route_id: staticResourceFormData.route_id,
        description: staticResourceFormData.description || undefined,
      }
      await api.post(`/clusters/${cluster.id}/static-resources`, payload)
      message.success('静态资源已创建')
    } else {
      const payload: Record<string, any> = {}
      if (staticResourceFormData.description !== undefined) {
        payload.description = staticResourceFormData.description || undefined
      }
      await api.put(`/clusters/${cluster.id}/static-resources/${staticResourceEditingId.value}`, payload)
      message.success('静态资源已更新')
    }

    staticResourceModalVisible.value = false
    await loadStaticResources(cluster)
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const deleteStaticResource = async (cluster: Cluster, sr: any) => {
  showDeleteConfirm({
    title: `确定删除静态资源 "${sr.name}"？`,
    apiEndpoint: `/clusters/${cluster.id}/static-resources/${sr.id}`,
    nodes: cluster.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      const logs: string[] = []
      const addLog = (text: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      }
      const progress = { percent: 0, status: 'active' as const }

      const modal = Modal.info({
        title: `删除静态资源: ${sr.name}`,
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

      addLog(`开始删除静态资源: ${sr.name}`)
      progress.percent = 20
      updateContent()

      await new Promise(r => setTimeout(r, 400))

      try {
        const res = await api.delete(`/clusters/${cluster.id}/static-resources/${sr.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog('正在从数据库删除...')
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80
          updateContent()

          addLog('Edge 节点同步删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
        } else if (deleteEdge) {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'success'
          addLog('✅ 删除完成!')
        } else if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog(`⚠️ 部分删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理 Edge 节点`)
        } else {
          progress.status = 'success'
          addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
        }

        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
        await loadStaticResources(cluster)
      } catch (error: any) {
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${error.response?.data?.detail || error.message}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    },
  })
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const uploadStaticResourceZip = (sr: any) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const cluster = clusters.value.find((c: Cluster) =>
      c.static_resources?.some((s: any) => s.id === sr.id)
    )
    if (!cluster) return

    const logs: string[] = []
    const addLog = (text: string) => { logs.push(`[${new Date().toLocaleTimeString()}] ${text}`) }
    const progress = { percent: 0, status: 'active' as const }
    const totalSize = file.size

    const modal = Modal.info({
      title: `上传静态资源: ${sr.name}`,
      width: 600,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })
    const updateContent = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })

    addLog(`文件: ${file.name} (${formatFileSize(totalSize)})`)
    progress.percent = 5
    updateContent()

    await new Promise(r => setTimeout(r, 200))

    try {
      const formData = new FormData()
      formData.append('file', file)

      addLog('正在上传...')
      progress.percent = 20
      updateContent()

      const res = await api.post(`/clusters/${cluster.id}/static-resources/${sr.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e: any) => {
          if (e.total) {
            const pct = Math.round(20 + (e.loaded / e.total) * 50)
            progress.percent = pct
            addLog(`上传进度: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`)
            updateContent()
          }
        },
      })

      progress.percent = 80
      addLog('上传完成')
      addLog('')
      const edgeUuid = res.data.edge_uuid || res.data.route_id || '?'
      const ver = res.data.current_version || '?'
      const serverHost = window.location.hostname
      addLog('── 上传结果 ──')
      addLog(`管理端服务器: ${serverHost}`)
      addLog(`管理端文件: ${res.data.storage_path || '未知'}`)
      addLog(`文件大小: ${res.data.file_size ? formatFileSize(res.data.file_size) : '—'}`)
      addLog(`当前版本: v${ver}`)
      addLog(`路由: ${sr.name} (${sr.url_path})`)
      progress.percent = 100
      progress.status = 'success'
      addLog('')
      addLog('✅ 上传成功')
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })

      await loadStaticResources(cluster)
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || error.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 上传失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
  }
  input.click()
}

const publishStaticResource = async (cluster: Cluster, sr: any) => {
  const nodeIds = await openPublishModal(`发布静态资源: ${sr.name}`, cluster.id)
  if (!nodeIds.length) return
  try {
    const res = await api.post(`/clusters/${cluster.id}/static-resources/${sr.id}/publish`, { node_ids: nodeIds })
    message.success('发布成功')
    await loadStaticResources(cluster)
  } catch (error: any) {
    message.error('发布失败: ' + (error.response?.data?.detail || error.message))
  }
}

const openStaticResourceVersionManagement = (cluster: Cluster, sr: any) => {
  versionModalType.value = 'static_resource'
  versionModalResourceId.value = sr.id
  versionModalClusterId.value = cluster.id
  versionModalResourceName.value = sr.name
  versionModalEdgeUuid.value = ''
  versionModalVisible.value = true
}


const openPluginConfigVersionManagement = (cluster: Cluster, pc?: any) => {
  const target = pc || cluster.selectedPluginConfig
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
  loadClusters()
})
</script>

<style scoped>
.cluster-list {
  padding: 0;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-section h2 {
  margin: 0 0 8px 0;
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
  color: #666;
  white-space: nowrap;
}

.status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.green { background: #52c41a; }
.status-dot.red { background: #ff4d4f; }
.status-dot.yellow { background: #faad14; }

.cluster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  position: relative;
}

.expanded-area {
  margin-top: 16px;
  /* Allow collapse animation — no min-height */
}

/* ===== Grid card transitions ===== */

/* Leave (card drops out of grid) */
.grid-leave-active {
  position: absolute !important;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.2s ease-in;
  width: calc(100% / 3 - 8px);
  z-index: 1;
}

/* Move (remaining cards slide to fill gap) */
.grid-move {
  transition: all 0.3s ease;
}

/* Enter (card returns to grid - pops back up) */
.grid-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.grid-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

/* ===== Expanded area transitions ===== */

/* Enter (card drops like a waterfall from above) */
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

/* Leave (card flies back up) */
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

.card-expanded {
  background: #fff;
  border-radius: 8px;
  border: 1px solid var(--p-primary, #1890ff);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: 0 3px 14px rgba(24,144,255,.16);
}
.card-expanded .card-header {
  background: #f8f9fa;
  border-bottom: 1px solid #e8e8e8;
}

.cluster-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
  transition: all 0.3s ease;
}
.cluster-card:hover {
  box-shadow: 0 3px 10px rgba(0,0,0,.08);
}

/* Header — stats + actions row */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #fff;
}

/* Expand row — name + click-zone */
.expand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
  background: #dce0e8;
  transition: background 0.15s;
}
.expand-row:hover {
  background: #cdd2dd;
}
.expand-row:active {
  background: #bec5d2;
}

.cname-wrap {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
}
.cname {
  font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chint {
  font-size: 11px; color: #999; font-weight: 400; flex-shrink: 0;
}

.stats-bar {
  display: flex; background: #f8f9fa; border-radius: 6px; overflow: hidden; flex-shrink: 0;
}
.scell {
  text-align: center; padding: 4px 10px;
}
.scell + .scell { border-left: 1px solid #eee; }
.snum { font-size: 15px; font-weight: 700; color: #1a1a1a; line-height: 1.2; }
.slbl { font-size: 10px; color: #aaa; }

.cactions {
  display: flex; gap: 3px; flex-shrink: 0;
}
.cbtn {
  padding: 2px 7px; font-size: 11px; border: 1px solid #e0e0e0;
  border-radius: 4px; background: #fff; cursor: pointer; color: #888;
}
.cbtn:hover { border-color: #1890ff; color: #1890ff; }
.cbtn.danger:hover { border-color: #ff4d4f; color: #ff4d4f; }

/* Chips */
.chips-row {
  display: flex; gap: 3px; flex-wrap: wrap; padding: 0 14px 10px;
}
.chip {
  padding: 2px 8px; border-radius: 10px; font-size: 11px;
  border: 1px solid #e8e8e8; background: #fff; color: #888;
  cursor: pointer; transition: all 0.2s;
}
.chip:hover { border-color: #1890ff; color: #1890ff; background: #e6f7ff; }
.chip.disabled { opacity: 0.4; cursor: not-allowed; }
.chip.disabled:hover { border-color: #e8e8e8; color: #888; background: #fff; }
.cb { font-size: 9px; color: #bbb; margin-left: 2px; }

/* Detail area */
.card-detail {
  border-top: 1px solid #e8e8e8;
  position: relative;
}

.dtabs {
  display: flex; background: #fff; border-bottom: 1px solid #e8e8e8;
  padding: 0 16px; overflow-x: auto;
}
.dt {
  padding: 10px 16px; font-size: 13px; color: #666; cursor: pointer;
  border-bottom: 2px solid transparent; white-space: nowrap;
  transition: all 0.2s;
}
.dt:hover { color: #1890ff; }
.dt.active { color: #1890ff; border-bottom-color: #1890ff; margin-bottom: -1px; }
.db { margin-left: 4px; padding: 1px 5px; border-radius: 8px; font-size: 10px; background: #f0f0f0; color: #999; }
.dt.active .db { background: #e6f7ff; color: #1890ff; }
.dbody { padding: 16px; }

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

/* Click zone indicator */
.click-zone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 6px;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  transition: all 0.2s;
  user-select: none;
}
.click-zone:hover {
  background: #e6f7ff;
  border-color: var(--p-primary, #1890ff);
  color: var(--p-primary, #1890ff);
}
.click-zone.on {
  background: #e6f7ff;
  border-color: var(--p-primary, #1890ff);
  color: var(--p-primary, #1890ff);
}
.click-zone .arrow {
  font-size: 12px;
  line-height: 1;
}
.click-zone .label {
  white-space: nowrap;
  line-height: 1;
}

/* Drag cursor on expanded card header */
.card-expanded .expand-row {
  background: #d4d9e3;
  border-bottom: 1px solid #d0d5df;
  cursor: grab;
  user-select: none;
}
.card-expanded .expand-row:hover {
  background: #c5cad7;
}
.card-expanded .expand-row:active {
  cursor: grabbing;
}

/* Drag states */
.card-expanded.dragging {
  opacity: 0.4;
}
.card-expanded.drag-over {
  border-color: #fa8c16 !important;
  box-shadow: 0 3px 16px rgba(250, 140, 22, 0.3) !important;
}
</style>