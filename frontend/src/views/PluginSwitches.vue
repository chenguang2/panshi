<template>
  <div class="plugin-switches">
    <div class="header-actions">
      <h2>插件管理</h2>
      <a-button type="primary" @click="saveSwitches" :loading="saving">保存设置</a-button>
    </div>

    <div class="hint">
      勾选需要启用的插件。未勾选的插件在路由和插件组中不可见。<br/>
      如果下方列表为空，系统会显示全部插件。
    </div>

    <a-table
      :dataSource="switchList"
      :columns="columns"
      :loading="loading"
      :pagination="false"
      rowKey="plugin_name"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'enabled'">
          <a-switch
            v-model:checked="record.enabled"
            checked-children="启用"
            un-checked-children="禁用"
          />
        </template>
        <template v-if="column.key === 'description'">
          <span class="plugin-desc">{{ getPluginDescription(record.plugin_name) }}</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'

interface SwitchItem {
  plugin_name: string
  enabled: boolean
}

const loading = ref(false)
const saving = ref(false)
const switchList = ref<SwitchItem[]>([])

const columns = [
  { title: '插件名称', dataIndex: 'plugin_name', key: 'plugin_name', width: 250 },
  { title: '说明', key: 'description' },
  { title: '状态', key: 'enabled', width: 120 },
]

function getPluginDescription(name: string): string {
  const map: Record<string, string> = {
    proxy_rewrite: '代理重写（修改请求 URI、Header、Host、协议）',
    response_rewrite: '响应体重写（修改状态码、Body、Header）',
    traffic_split: '流量分发（按条件将请求分发到不同的上游）',
    data_center: '数据中心（集中管理其他插件的数据属性）',
    log_process: '日志记录（将请求信息按指定格式记录到文件）',
    traffic_limit_count: '时间窗口请求数限制（按 key 计数限流）',
    pre_functions: '自定义预处理方法（在指定阶段执行 Lua 函数）',
    traceid: 'TraceID 追踪（在请求头中注入唯一追踪 ID）',
    monitor: '监控统计（收集请求指标数据）',
    static_resource: '静态资源服务',
    security_common_body: '安全 - Body 检查',
    auth_basic: 'Basic 认证',
    auth_key: 'Key 认证',
    cors: '跨域资源共享（CORS）',
    security_common_args: '安全 - 请求参数检查',
    security_common_cookie: '安全 - Cookie 检查',
    security_common_referer: '安全 - Referer 检查',
    security_common_uri: '安全 - URI 检查',
    security_common_useragent: '安全 - User-Agent 检查',
    security_restrict_ip: '安全 - IP 黑白名单',
    security_restrict_uri: '安全 - URI 白名单',
    security_restrict_form: '安全 - 表单限制',
    security_super_ip: '安全 - 高级 IP',
    security_super_user: '安全 - 高级用户',
  }
  return map[name] || name
}

async function loadSwitches() {
  loading.value = true
  try {
    const res = await api.get('/plugin-switches')
    const existing = new Map(res.data.items.map((s: any) => [s.plugin_name, s.enabled]))
    const builtin = await api.get('/plugins/builtin')
    switchList.value = builtin.data.plugins.map((p: any) => ({
      plugin_name: p.name,
      enabled: existing.has(p.name) ? existing.get(p.name) : true,
    }))
  } catch (e) {
    message.error('加载插件列表失败')
  } finally {
    loading.value = false
  }
}

async function saveSwitches() {
  saving.value = true
  try {
    await api.put('/plugin-switches', switchList.value.map(s => ({
      plugin_name: s.plugin_name,
      enabled: s.enabled,
    })))
    message.success('插件设置已保存')
  } catch (e) {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadSwitches)
</script>

<style scoped>
.plugin-switches { padding: 20px 24px; }
.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
}
.header-actions h2 { margin: 0; }
.hint {
  font-size: 12px; color: var(--p-text-tertiary);
  background: var(--p-bg-hover); padding: 10px 14px;
  border-radius: 6px; margin-bottom: 16px; line-height: 1.6;
}
.plugin-desc { font-size: 12px; color: var(--p-text-secondary); }
</style>
