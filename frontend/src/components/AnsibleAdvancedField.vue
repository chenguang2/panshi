<template>
  <!--
    单个高级连接变量字段（AnsibleAdvancedFields 的原子件）：
    标签 + 两枚提示图标（? 含义 / 三横线常用值速查）+ 控件 + 行内校验错误。
    父子分工：本组件只管"一个字段长什么样"，分区/子面板的排布由宿主决定。
  -->
  <div class="advanced-field" :class="{ 'has-error': !!error }">
    <label class="advanced-label">
      {{ def.label }}
      <a-tooltip v-if="def.hint" :title="def.hint"><span class="hint-mark">?</span></a-tooltip>
      <a-popover v-if="def.helpRef" trigger="click" placement="bottom">
        <template #content>
          <div style="max-height: 360px; overflow: auto; min-width: 360px">
            <div style="font-weight: 600; margin-bottom: 8px">常用参数速查</div>
            <table style="width: 100%; font-size: 12px; border-collapse: collapse">
              <tbody>
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
              </tbody>
            </table>
          </div>
        </template>
        <span class="hint-mark ref" title="常用参数速查：点击查看可选值，行可点复制"
          ><StrokeIcon name="list" :size="9"
        /></span>
      </a-popover>
    </label>
    <a-input-number
      v-if="def.type === 'number'"
      :value="numValue()"
      style="width: 100%"
      :min="1"
      :max="65535"
      placeholder="未设置"
      @update:value="(v: number | null) => emit('change', v)"
    />
    <a-switch
      v-else-if="def.type === 'switch'"
      :checked="boolValue()"
      @update:checked="(v: boolean) => emit('change', v)"
    />
    <a-auto-complete
      v-else-if="def.type === 'select'"
      :value="stringValue()"
      :options="def.options?.map((o) => ({ value: o }))"
      style="width: 100%"
      placeholder="留空继承默认"
      allow-clear
      @change="(v: string) => emit('change', v)"
    />
    <a-input-password
      v-else-if="def.type === 'password'"
      :value="stringValue()"
      :placeholder="def.placeholder || '未设置'"
      allow-clear
      autocomplete="new-password"
      @change="(e: Event) => emit('change', (e.target as HTMLInputElement).value)"
    />
    <a-input
      v-else
      :value="stringValue()"
      :placeholder="def.placeholder || '未设置'"
      allow-clear
      @change="(e: Event) => emit('change', (e.target as HTMLInputElement).value)"
    />
    <div v-if="error" class="field-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { toBool, type AdvancedFieldDef } from '@/utils/ansibleInventory'

const props = defineProps<{
  def: AdvancedFieldDef
  /** 当前取值（宿主 values 里该字段的值） */
  value: unknown
  /** 行内校验错误原因（有则该字段标红） */
  error?: string
}>()

const emit = defineEmits<{ change: [value: unknown] }>()

/** 文案展示用字符串（null/undefined → 空串；数字/布尔转字符串，源码视图可能写出字符串形态）。 */
function stringValue(): string {
  const v = props.value
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v : String(v)
}

/** 数字控件展示值：字符串形态（源码视图手写）也归一化，非数字回退 null。 */
function numValue(): number | null {
  const v = props.value
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

/** 开关展示值：兼容 yes/no/true/false 字符串形态。 */
function boolValue(): boolean {
  return toBool(props.value)
}

/** 复制参数到剪贴板（浏览器 API）。 */
function copyText(text: string): void {
  navigator.clipboard?.writeText(text).then(() => message.success('已复制'))
}
</script>

<style scoped>
.advanced-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
/* 行内校验错误（批 2）：字段容器描边 + 下方红字原因 */
.advanced-field.has-error :deep(.ant-input-number),
.advanced-field.has-error :deep(.ant-input),
.advanced-field.has-error :deep(.ant-select) {
  border-color: #ff4d4f;
}
.field-error {
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.5;
}
.advanced-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  white-space: nowrap;
}
.hint-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 11px;
  cursor: help;
}
.hint-mark:hover {
  color: var(--accent, #1677ff);
}
/* 速查图标：与「?」同尺寸同色，靠图形区分——线稿三横线（取代历史上的剪贴板 emoji） */
.hint-mark.ref svg {
  display: block;
}
</style>
