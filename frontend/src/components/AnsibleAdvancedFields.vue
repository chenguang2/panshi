<template>
  <!--
    Ansible 高级连接变量（主机行 / 组级行共用）——A+C 解剖（2026-11-24 用户裁决）：
    ① 「连接」「认证」两个语义分区（标题 + 上分隔线）；
    ② 「提权（sudo）」独立子面板：开关在面板头，关闭时面板体收起成一行说明
       （不再并排两个禁用空框；也不再出现"开关在行末、从属字段在下一行"的因果断裂）。
    字段本体由 AnsibleAdvancedField 渲染，本组件只负责排布与提权联动。
  -->
  <div class="advanced-wrap">
    <template v-for="sec in sections" :key="sec.key">
      <div class="adv-sec-head">
        {{ sec.title }} <span class="cnt">{{ sec.items.length }}</span>
      </div>
      <div class="adv-grid" :class="`cols-${sec.cols}`">
        <AnsibleAdvancedField
          v-for="def in sec.items"
          :key="def.key"
          :def="def"
          :value="values[def.key]"
          :error="errors?.[def.key]"
          @change="(v: unknown) => emit('change', def.key, v)"
        />
      </div>
    </template>

    <div class="adv-panel">
      <div class="adv-panel-head">
        <span class="t">提权（sudo）</span>
        <span class="adv-switch">
          <a-switch
            size="small"
            :checked="becomeOn"
            @update:checked="(v: boolean) => emit('change', 'ansible_become', v)"
          />
          <span class="sw-text">{{ becomeOn ? '开启' : '关闭' }}</span>
        </span>
      </div>
      <div v-if="becomeOn" class="adv-panel-body">
        <AnsibleAdvancedField
          v-for="def in becomeItems"
          :key="def.key"
          :def="def"
          :value="values[def.key]"
          :error="errors?.[def.key]"
          @change="(v: unknown) => emit('change', def.key, v)"
        />
      </div>
      <div v-else class="adv-collapsed">未启用提权 —— 命令以登录用户身份执行；需要 sudo 时打开开关。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AnsibleAdvancedField from '@/components/AnsibleAdvancedField.vue'
import { ADVANCED_FIELDS, toBool, type AdvancedFieldDef } from '@/utils/ansibleInventory'

/** 取值对象：主机行传行记录本身，组级行传 edge_cluster.vars。errors：字段键 → 错误原因（行内标红）。 */
const props = defineProps<{ values: Record<string, unknown>; errors?: Record<string, string> }>()

/** 字段写回：宿主负责落值与标脏（空值语义由宿主决定）。 */
const emit = defineEmits<{ change: [key: string, value: unknown] }>()

/** 分区归属（顺序即渲染顺序）：连接 4 项、认证 2 项、提权 2 项（开关在面板头，不在网格里）。 */
const CONNECT_KEYS = ['ansible_port', 'ansible_host', 'ansible_connection', 'ansible_python_interpreter']
const AUTH_KEYS = ['ansible_ssh_private_key_file', 'ansible_ssh_common_args']
const BECOME_KEYS = ['ansible_become_user', 'ansible_become_pass']

function pick(keys: string[]): AdvancedFieldDef[] {
  return keys.map((k) => ADVANCED_FIELDS.find((f) => f.key === k)).filter((f): f is AdvancedFieldDef => f !== undefined)
}

const sections = [
  { key: 'connect', title: '连接', cols: 4, items: pick(CONNECT_KEYS) },
  { key: 'auth', title: '认证', cols: 2, items: pick(AUTH_KEYS) },
]
const becomeItems = pick(BECOME_KEYS)

/** 提权开关状态（yes/no 字符串形态也归一化） */
const becomeOn = computed(() => toBool(props.values['ansible_become']))
</script>

<style scoped>
.advanced-wrap {
  padding: 4px 8px 2px;
}
/* 分区标题：11.5px 灰 + 上分隔线；首块不画线（上方本来是行分隔） */
.adv-sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  margin-bottom: 9px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.adv-sec-head:first-of-type {
  padding-top: 0;
  border-top: none;
}
.adv-sec-head .cnt {
  font-family: var(--font-mono);
  font-weight: 600;
  color: oklch(50% 0.018 240 / 55%);
}
.adv-grid {
  display: grid;
  gap: 12px 14px;
}
/* 列宽按设计页：端口窄、目标/解释器中、连接方式中；认证=私钥定宽 + 额外参数吃满 */
.adv-grid.cols-4 {
  grid-template-columns: 150px 220px 200px 220px;
}
.adv-grid.cols-2 {
  grid-template-columns: 260px minmax(0, 1fr);
}
@media (max-width: 1100px) {
  .adv-grid.cols-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .adv-grid.cols-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* 提权子面板：--surface 抬一层（高级区本身在 --bg 上），关闭时只留一行说明 */
.adv-panel {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.adv-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.adv-panel-head .t {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--fg);
}
.adv-switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.adv-switch .sw-text {
  font-size: 11.5px;
  color: var(--muted);
}
.adv-panel-body {
  display: grid;
  grid-template-columns: 200px 200px;
  gap: 12px 14px;
  margin-top: 8px;
}
@media (max-width: 1100px) {
  .adv-panel-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
.adv-collapsed {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
</style>
