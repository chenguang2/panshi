<template>
  <!--
    Ansible 高级连接变量栅格：主机行（行内清单条目）与组级行（edge_cluster.vars）共用同一套字段。
    宿主只负责提供取值对象与写回回调，字段定义/帮助文案/联动禁用规则全部收敛在此。
  -->
  <div class="advanced-grid">
    <div v-for="def in ADVANCED_FIELDS" :key="def.key" class="advanced-field">
      <label class="advanced-label">
        {{ def.label }}
        <a-tooltip v-if="def.hint" :title="def.hint"><span class="hint-mark">?</span></a-tooltip>
        <a-popover v-if="def.helpRef" trigger="click" placement="bottom" overlay-class="ssh-help-popover">
          <template #content>
            <div style="max-height: 360px; overflow: auto; min-width: 360px">
              <div style="font-weight: 600; margin-bottom: 8px">常用参数速查</div>
              <table style="width: 100%; font-size: 12px; border-collapse: collapse">
                <tr style="background: #fafafa">
                  <td style="padding: 4px 8px; font-weight: 600">参数</td>
                  <td style="padding: 4px 8px">含义</td>
                </tr>
                <tr v-for="r in def.helpRef" :key="r.param" style="border-bottom: 1px solid #f0f0f0">
                  <td
                    style="padding: 4px 8px; font-family: monospace; white-space: nowrap; cursor: pointer"
                    :title="'点击复制：' + r.param"
                    @click="copyText(r.param)"
                  >
                    {{ r.param }}
                  </td>
                  <td style="padding: 4px 8px">{{ r.desc }}</td>
                </tr>
              </table>
            </div>
          </template>
          <span class="hint-mark" style="cursor: pointer">📋</span>
        </a-popover>
      </label>
      <a-input-number
        v-if="def.type === 'number'"
        :value="numValue(def.key)"
        style="width: 100%"
        :min="1"
        :max="65535"
        placeholder="未设置"
        @update:value="(v: number | null) => emit('change', def.key, v)"
      />
      <a-switch
        v-else-if="def.type === 'switch'"
        :checked="boolValue(def.key)"
        @update:checked="(v: boolean) => emit('change', def.key, v)"
      />
      <a-auto-complete
        v-else-if="def.type === 'select'"
        :value="stringValue(def.key)"
        :options="def.options?.map((o) => ({ value: o }))"
        style="width: 100%"
        placeholder="留空继承默认"
        allow-clear
        @change="(v: string) => emit('change', def.key, v)"
      />
      <a-input-password
        v-else-if="def.type === 'password'"
        :value="stringValue(def.key)"
        :placeholder="def.placeholder || '未设置'"
        :disabled="def.key === 'ansible_become_pass' && !boolValue('ansible_become')"
        allow-clear
        autocomplete="new-password"
        @change="(e: Event) => emit('change', def.key, (e.target as HTMLInputElement).value)"
      />
      <a-input
        v-else
        :value="stringValue(def.key)"
        :placeholder="def.placeholder || '未设置'"
        :disabled="def.key === 'ansible_become_user' && !boolValue('ansible_become')"
        allow-clear
        @change="(e: Event) => emit('change', def.key, (e.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue'
import { ADVANCED_FIELDS, toBool } from '@/utils/ansibleInventory'

/** 取值对象：主机行传行记录本身，组级行传 edge_cluster.vars。 */
const props = defineProps<{ values: Record<string, unknown> }>()

/** 字段写回：宿主负责落值与标脏（空值语义由宿主决定）。 */
const emit = defineEmits<{ change: [key: string, value: unknown] }>()

/** 文案展示用字符串（null/undefined → 空串；数字/布尔转字符串，源码视图可能写出字符串形态）。 */
function stringValue(key: string): string {
  const v = props.values[key]
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v : String(v)
}

/** 数字控件展示值：字符串形态（源码视图手写）也归一化，非数字回退 null。 */
function numValue(key: string): number | null {
  const v = props.values[key]
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

/** 开关展示值：兼容 yes/no/true/false 字符串形态。 */
function boolValue(key: string): boolean {
  return toBool(props.values[key])
}

/** 复制参数到剪贴板（浏览器 API）。 */
function copyText(text: string): void {
  navigator.clipboard?.writeText(text).then(() => message.success('已复制'))
}
</script>

<style scoped>
.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px 16px;
  padding: 4px 8px;
}
.advanced-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.advanced-label {
  font-size: 12px;
  color: var(--text-secondary, #888);
}
.hint-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 11px;
  cursor: help;
}
</style>
