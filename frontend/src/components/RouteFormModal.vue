<template>
  <a-modal v-model:open="modalOpen" :title="copyingRoute ? '复制路由' : (editingRoute ? '编辑路由' : '新建路由')" width="800px" :confirm-loading="submitting" @ok="handleSubmit">
    <a-tabs v-model:activeKey="activeTab" :lazy="true">
      <a-tab-pane key="basic" tab="基础配置">
        <a-form ref="formRef" :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入路由名称' }]">
            <a-input v-model:value="form.name" placeholder="请输入路由名称" />
          </a-form-item>
          <a-form-item label="URI" name="uri" :rules="[{ required: true, message: '请输入URI' }]">
            <a-input v-model:value="form.uri" placeholder="如: /api/*" />
          </a-form-item>
          <a-form-item label="所属集群" name="cluster_id" :rules="[{ required: true, message: '请选择所属集群' }]">
            <a-select v-model:value="form.cluster_id" :disabled="!!editingRoute && !copyingRoute">
              <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="请求方法" name="methods" :rules="[{ required: true, message: '请选择请求方法' }]">
            <a-select v-model:value="form.methods" mode="multiple" placeholder="可选多个方法" style="width: 300px">
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
            <a-select v-model:value="form.upstream_id" placeholder="请选择上游" allow-clear>
              <a-select-option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="优先级" name="priority" :rules="[{ required: true, message: '请输入优先级' }]">
            <a-input-number v-model:value="form.priority" :min="0" style="width: 100%" />
          </a-form-item>
          <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
            <a-select v-model:value="form.status">
              <a-select-option :value="1">正常</a-select-option>
              <a-select-option :value="0">禁用</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="描述" name="description">
            <a-textarea v-model:value="form.description" :rows="2" />
          </a-form-item>
          <a-form-item label="高级匹配">
            <div style="display:flex;align-items:center;gap:8px;">
              <label class="toggle"><input type="checkbox" :checked="form.advancedEnabled" @change="form.advancedEnabled = !form.advancedEnabled" /><span class="toggle-slider"></span></label>
              <span style="color:#999;font-size:12px;">开启后在"高级匹配"页配置请求条件</span>
            </div>
          </a-form-item>
        </a-form>
      </a-tab-pane>

      <a-tab-pane key="advanced" tab="高级匹配">
        <div v-if="form.advancedEnabled">
          <RouteAdvancedMatch
            :enabled="form.advancedEnabled"
            :model-value="{ vars: form.advancedMatch.vars }"
            @update:model-value="(val: any) => { form.advancedMatch.vars = val.vars || [] }"
          />
        </div>
        <div v-else class="advanced-disabled-hint">
          <WarningOutlined style="color:#faad14;margin-right:8px;" />
          高级匹配未启用，请在"基础配置"中开启
        </div>
      </a-tab-pane>

      <a-tab-pane key="plugins" tab="插件管理">
        <PluginSelector
          v-model="form.plugins"
          :plugins="availablePlugins"
        />
      </a-tab-pane>

      <!-- 插件组 -->
      <a-tab-pane key="pluginGroups" tab="插件组">
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
    <template #footer>
      <a-button @click="$emit('close')">取消</a-button>
      <a-button type="primary" :loading="submitting" @click="handleSubmit">保存</a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import PluginSelector from '@/components/PluginSelector.vue'

const props = defineProps<{
  visible: boolean
  editingRoute: any | null
  copyingRoute?: boolean
  clusters: { id: number; name: string; display_name?: string }[]
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

const modalOpen = computed({ get: () => props.visible, set: (v) => { if (!v) emit('close') } })
const formRef = ref()
const activeTab = ref('basic')
const submitting = ref(false)
const upstreams = ref<any[]>([])
const availablePlugins = ref<any[]>([])
const clusterPluginGroups = ref<any[]>([])
const pluginConfigIds = ref<string[]>([])

const form = reactive({
  name: '', uri: '', methods: [] as string[], priority: 0, status: 1,
  cluster_id: null as number | null,
  upstream_id: null as number | null,
  description: '', advancedEnabled: false,
  advancedMatch: { vars: [] as [string, string, string][] },
  plugins: [] as any[],
})

const allMethodsSelected = computed(() => form.methods.length === ALL_METHODS.length)

function toggleAllMethods() {
  form.methods = allMethodsSelected.value ? [] : [...ALL_METHODS]
}

async function loadUpstreams(cid: number) {
  try {
    const res = await api.get(`/clusters/${cid}/upstreams`, { params: { page_size: 100 } })
    upstreams.value = res.data.items || []
  } catch { upstreams.value = [] }
}

async function loadPlugins() {
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch { availablePlugins.value = [] }
}

async function loadPluginGroups(cid: number) {
  try {
    const res = await api.get(`/clusters/${cid}/plugin_configs`, { params: { page_size: 100 } })
    clusterPluginGroups.value = res.data.items || []
  } catch { clusterPluginGroups.value = [] }
}

function isPluginGroupSelected(edgeUuid: string): boolean {
  return pluginConfigIds.value.includes(edgeUuid)
}

function togglePluginGroup(pg: any) {
  const uuid = pg.edge_uuid || ''
  if (pluginConfigIds.value.includes(uuid)) {
    pluginConfigIds.value = pluginConfigIds.value.filter(id => id !== uuid)
  } else {
    pluginConfigIds.value.push(uuid)
  }
}

watch(() => form.cluster_id, (cid) => {
  if (cid) { loadUpstreams(cid); loadPluginGroups(cid) }
})

watch(() => props.visible, async (v) => {
  if (!v) return
  await loadPlugins()
  if (props.editingRoute) {
    const r = props.editingRoute
    form.name = props.copyingRoute ? `复制_${r.name}` : r.name
    form.uri = r.uri; form.priority = r.priority ?? 0; form.status = r.status ?? 1
    form.cluster_id = r.cluster_id; form.description = r.description || ''; form.upstream_id = r.upstream_id
    form.methods = (r.methods || '').split(',').filter(Boolean)
    form.advancedEnabled = !!(r.advanced_match_enabled || (r.vars && r.vars.length > 0))
    form.advancedMatch = { vars: (r.vars || []) as any }
    pluginConfigIds.value = r.plugin_config_ids || []
    // Load plugins from API
    if (r.id && r.cluster_id) {
      try {
        const res = await api.get(`/clusters/${r.cluster_id}/routes/${r.id}/plugins`)
        form.plugins = (res.data.plugins || []).map((p: any) => ({
          plugin_name: p.plugin_name,
          config: typeof p.config === 'string' ? p.config : JSON.stringify(p.config || {}),
        }))
      } catch {
        form.plugins = []
      }
    } else {
      form.plugins = []
    }
    if (r.cluster_id) { await loadUpstreams(r.cluster_id); await loadPluginGroups(r.cluster_id) }
  } else {
    form.name = ''; form.uri = ''; form.priority = 0; form.status = 1
    form.cluster_id = null; form.description = ''; form.upstream_id = null
    form.methods = []; form.advancedEnabled = false
    form.advancedMatch = { vars: [] }; form.plugins = []
  }
  activeTab.value = 'basic'
})

async function handleSubmit() {
  try { await (formRef.value as any)?.validate() } catch { return }
  submitting.value = true
  try {
    const data: Record<string, any> = {
      name: form.name, uri: form.uri,
      methods: form.methods.join(','), priority: form.priority,
      status: form.status, description: form.description,
      upstream_id: form.upstream_id,
      advanced_match_enabled: form.advancedEnabled,
    }
    if (form.advancedEnabled) data.vars = form.advancedMatch.vars
    data.plugin_config_ids = pluginConfigIds.value
    const cid = form.cluster_id
    if (props.editingRoute && !props.copyingRoute) {
      await api.put(`/clusters/${cid}/routes/${props.editingRoute.id}`, data)
      message.success('路由已更新')
    } else {
      // copy or create - always POST
      if (props.copyingRoute) {
        data.name = form.name // use the prefilled name (user can modify)
      }
      await api.post(`/clusters/${cid}/routes`, data)
      message.success(props.copyingRoute ? '路由已复制' : '路由已创建')
    }
    if (form.plugins.length > 0 && props.editingRoute?.id && !props.copyingRoute) {
      await api.put(`/clusters/${cid}/routes/${props.editingRoute.id}/plugins`, {
        plugins: form.plugins.map((p: any) => ({ plugin_name: p.plugin_name, config: p.config })),
      })
    }
    emit('saved'); emit('close')
  } catch { message.error('保存失败') }
  finally { submitting.value = false }
}
</script>

<style scoped>
.advanced-disabled-hint { padding: 24px; text-align: center; color: #999; font-size: 13px; }
.pg-empty { padding: 24px; text-align: center; color: #999; }
.pg-desc { font-size: 12px; color: #666; margin-bottom: 12px; }
.pg-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.plugin-config-card {
  border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;
  cursor: pointer; transition: all 0.2s; background: var(--surface);
}
.plugin-config-card:hover { box-shadow: var(--shadow-md); border-color: var(--accent); }
.plugin-config-card.selected { border-color: var(--accent); background: oklch(56% 0.16 210 / 6%); }
.pg-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pg-item-name { font-size: 14px; font-weight: 600; color: var(--fg); }
.pg-item-version { font-size: 11px; color: var(--muted); font-family: var(--font-mono); margin-left: auto; }
.pg-item-plugins { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.pg-item-desc { font-size: 12px; color: var(--muted); }
</style>
