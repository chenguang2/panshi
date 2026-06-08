<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:860px;">
      <div class="modal-header">
        <h2>{{ copyingRoute ? '复制路由' : editingRoute ? '编辑路由' : '新建路由' }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'advanced' }" @click="activeTab = 'advanced'">高级匹配</button>
        <button class="tab-btn" :class="{ active: activeTab === 'plugins' }" @click="activeTab = 'plugins'">插件管理</button>
        <button class="tab-btn" :class="{ active: activeTab === 'pluginGroups' }" @click="activeTab = 'pluginGroups'">插件组</button>
      </div>

      <div class="modal-body">
        <!-- ── 基础配置 ── -->
        <div v-show="activeTab === 'basic'">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="请输入路由名称">
              <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">URI <span class="required">*</span></label>
              <input v-model="form.uri" type="text" class="form-input" placeholder="如: /api/*">
              <div v-if="formErrors.uri" class="form-error">{{ formErrors.uri }}</div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="form.cluster_id" class="form-input" :disabled="!!editingRoute && !copyingRoute">
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
            </div>
            <div class="form-group">
            <label class="form-label">请求方法 <span class="required">*</span></label>
            <div class="method-chips">
              <span
                v-for="m in ALL_METHODS"
                :key="m"
                class="method-chip"
                :class="{ selected: form.methods.includes(m) }"
                @click="toggleMethod(m)"
              >{{ m }}</span>
            </div>
            <div style="margin-top:4px;">
              <label class="checkbox-label" style="font-size:12px;">
                <input type="checkbox" :checked="allMethodsSelected" @change="toggleAllMethods">
                <span>{{ allMethodsSelected ? '取消全选' : '全选' }}</span>
              </label>
            </div>
            <div v-if="formErrors.methods" class="form-error">{{ formErrors.methods }}</div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">上游 <span class="required">*</span></label>
              <span style="display:none">{{ dbgLog('upstreams:', upstreams, 'length:', upstreams?.length) }}</span>
              <select v-model="form.upstream_id" class="form-input">
                <option value="">请选择上游</option>
                <option value="test">TEST硬编码</option>
                <option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</option>
              </select>
              <div v-if="formErrors.upstream_id" class="form-error">{{ formErrors.upstream_id }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">优先级 <span class="required">*</span></label>
              <input v-model.number="form.priority" type="number" class="form-input" :class="{ 'has-error': formErrors.priority }" min="0" placeholder="0">
              <span class="form-error" v-if="formErrors.priority">{{ formErrors.priority }}</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">状态</label>
              <select v-model="form.status" class="form-input">
                <option :value="1">正常</option>
                <option :value="0">禁用</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <input v-model="form.description" type="text" class="form-input" placeholder="描述信息">
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.advancedEnabled">
              <span>开启高级匹配</span>
            </label>
            <div class="form-hint">开启后在"高级匹配"页配置请求条件</div>
          </div>
        </div>

        <!-- ── 高级匹配 ── -->
        <div v-show="activeTab === 'advanced'">
          <template v-if="form.advancedEnabled">
            <RouteAdvancedMatch
              :enabled="form.advancedEnabled"
              :model-value="{ vars: form.advancedMatch.vars }"
              @update:model-value="(val: any) => { form.advancedMatch.vars = val.vars || [] }"
            />
          </template>
          <div v-else class="advanced-disabled-hint">
            <span class="hint-icon">&#x26A0;</span>
            高级匹配未启用，请在"基础配置"中开启
          </div>
        </div>

        <!-- ── 插件管理 ── -->
        <div v-show="activeTab === 'plugins'">
          <PluginSelector
            v-model="form.plugins"
            :plugins="availablePlugins"
          />
        </div>

        <!-- ── 插件组 ── -->
        <div v-show="activeTab === 'pluginGroups'">
          <div v-if="clusterPluginGroups.length === 0" class="advanced-disabled-hint">
            暂无插件组，请在"插件组"Tab 中创建
          </div>
          <div v-else>
            <div class="form-hint" style="margin-bottom:12px;">勾选要关联到此路由的插件组，插件配置将合并到路由中</div>
            <div class="pg-list">
              <div
                v-for="pg in clusterPluginGroups"
                :key="pg.id"
                class="plugin-config-card"
                :class="{ selected: isPluginGroupSelected(pg.edge_uuid || '') }"
                @click="togglePluginGroup(pg)"
              >
                <div class="pg-item-header">
                  <input type="checkbox" class="pg-checkbox" :checked="isPluginGroupSelected(pg.edge_uuid || '')" @click.stop="togglePluginGroup(pg)">
                  <strong class="pg-item-name">{{ pg.name }}</strong>
                  <span class="pg-item-version">v{{ pg.current_version || 0 }}</span>
                </div>
                <div class="pg-item-plugins">
                  <span v-for="(pcfg, pname) in pg.plugins" :key="pname" class="pg-item-tag">{{ pname }}</span>
                </div>
                <div v-if="pg.description" class="pg-item-desc">{{ pg.description }}</div>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '提交中...' : '保存' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
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

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']
const dbgLog = (...args: any[]) => console.log('[RouteFormModal/dbg]', ...args)

const activeTab = ref('basic')
const submitting = ref(false)
const formErrors = reactive<Record<string, string>>({})
const upstreams = ref<any[]>([])
const availablePlugins = ref<any[]>([])
const clusterPluginGroups = ref<any[]>([])
const pluginConfigIds = ref<string[]>([])

const form = reactive({
  name: '', uri: '', methods: [] as string[], priority: 0, status: 1,
  cluster_id: '' as number | string,
  upstream_id: '' as number | string | null,
  description: '', advancedEnabled: false,
  advancedMatch: { vars: [] as [string, string, string][] },
  plugins: [] as any[],
})

const allMethodsSelected = computed(() => form.methods.length === ALL_METHODS.length)

function toggleMethod(m: string) {
  const idx = form.methods.indexOf(m)
  if (idx >= 0) form.methods.splice(idx, 1)
  else form.methods.push(m)
}

function toggleAllMethods() {
  form.methods = allMethodsSelected.value ? [] : [...ALL_METHODS]
}

async function loadUpstreams(cid: number) {
  console.log('[RouteFormModal] loadUpstreams called with cid:', cid)
  try {
    const res = await api.get(`/clusters/${cid}/upstreams`, { params: { page_size: 100 } })
    upstreams.value = res.data.items || []
  } catch (e: any) {
    upstreams.value = []
    console.error(`加载上游列表失败 (cluster ${cid}):`, e)
  }
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
  if (cid) { loadUpstreams(Number(cid)); loadPluginGroups(Number(cid)) }
})

watch(() => props.visible, async (v) => {
  console.log('[RouteFormModal] visible changed:', v, 'editingRoute:', props.editingRoute, 'copyingRoute:', props.copyingRoute)
  if (!v) return
  formErrors.name = ''
  formErrors.uri = ''
  formErrors.cluster_id = ''
  formErrors.upstream_id = ''
  formErrors.methods = ''
  formErrors.priority = ''

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
    form.cluster_id = ''; form.description = ''; form.upstream_id = ''
    form.methods = []; form.advancedEnabled = false
    form.advancedMatch = { vars: [] }; form.plugins = []
  }
  activeTab.value = 'basic'
})

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.uri = ''
  formErrors.cluster_id = ''
  formErrors.upstream_id = ''
  formErrors.methods = ''
  formErrors.priority = ''

  if (!form.name.trim()) { formErrors.name = '请输入路由名称'; return false }
  if (!form.uri.trim()) { formErrors.uri = '请输入URI'; return false }
  if (!form.uri.startsWith('/')) { formErrors.uri = 'URI 必须以 / 开头'; return false }
  if (!form.cluster_id) { formErrors.cluster_id = '请选择所属集群'; return false }
  if (!form.upstream_id) { formErrors.upstream_id = '请选择上游'; return false }
  if (form.methods.length === 0) { formErrors.methods = '请至少选择一种请求方法'; return false }
  if (form.priority === undefined || form.priority === null || isNaN(Number(form.priority))) { formErrors.priority = '请输入有效的优先级数字'; return false }
  return true
}

async function handleSubmit() {
  if (!validateForm()) return
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
    let routeId: number | null = null
    if (props.editingRoute && !props.copyingRoute) {
      await api.put(`/clusters/${cid}/routes/${props.editingRoute.id}`, data)
      routeId = props.editingRoute.id
      message.success('路由已更新')
    } else {
      if (props.copyingRoute) data.name = form.name
      const res = await api.post(`/clusters/${cid}/routes`, data)
      routeId = res.data.id
      message.success(props.copyingRoute ? '路由已复制' : '路由已创建')
    }
    if (routeId) {
      await api.put(`/clusters/${cid}/routes/${routeId}/plugins`, {
        plugins: form.plugins.map((p: any) => ({ plugin_name: p.plugin_name, config: p.config })),
      })
    }
    emit('saved'); emit('close')
  } catch { message.error('保存失败') }
  finally { submitting.value = false }
}
</script>

<style scoped>
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
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-wide { max-width: 860px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
}
.modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--fg); }

.modal-close {
  width: 28px; height: 28px;
  border: none; background: transparent;
  font-size: 20px; cursor: pointer;
  color: var(--muted); border-radius: var(--radius-sm);
}
.modal-close:hover { background: var(--bg); color: var(--fg); }

/* ── Tab Bar ── */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  background: var(--surface);
}
.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  font-family: var(--font-body);
}
.tab-btn:hover { color: var(--fg); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

/* ── Modal Body ── */
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-group { flex: 1; margin-bottom: 16px; }

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required { color: var(--danger); }

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.form-error {
  font-size: 12px;
  color: var(--danger);
  margin-top: 2px;
}

.method-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.method-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 14px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  user-select: none;
  transition: all 0.15s;
  height: 28px;
}
.method-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.method-chip.selected {
  background: oklch(56% 0.16 210 / 10%);
  border-color: var(--accent);
  color: var(--accent);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

/* ── Advanced disabled hint ── */
.advanced-disabled-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
  font-size: 13px;
}
.hint-icon { font-size: 18px; margin-right: 8px; }

/* ── Plugin Groups ── */
.pg-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.plugin-config-card {
  border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;
  cursor: pointer; transition: all 0.2s; background: var(--surface);
}
.plugin-config-card:hover { box-shadow: var(--shadow-md); border-color: var(--accent); }
.plugin-config-card.selected { border-color: var(--accent); background: oklch(56% 0.16 210 / 6%); }
.pg-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pg-checkbox { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.pg-item-name { font-size: 14px; font-weight: 600; color: var(--fg); }
.pg-item-version { font-size: 11px; color: var(--muted); font-family: var(--font-mono); margin-left: auto; }
.pg-item-plugins { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.pg-item-tag {
  display: inline-block; padding: 1px 7px; border-radius: 3px;
  font-size: 10px; font-family: var(--font-mono);
  background: oklch(56% 0.16 210 / 8%); color: var(--accent);
}
.pg-item-desc { font-size: 12px; color: var(--muted); }
</style>
