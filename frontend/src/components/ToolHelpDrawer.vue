<template>
  <a-drawer :open="open" :title="`${toolLabel} · 帮助`" placement="right" :width="480" @close="emit('close')">
    <div v-if="doc" class="tool-help">
      <!-- 六段骨架（①-⑥）：字段强类型保证齐全，见 config/toolHelp.ts -->
      <section class="th-section">
        <h4 class="th-head"><span class="th-no">01</span>这是什么</h4>
        <p class="th-text">{{ doc.what }}</p>
      </section>

      <section class="th-section">
        <h4 class="th-head"><span class="th-no">02</span>为什么需要它</h4>
        <p class="th-text">{{ doc.why }}</p>
      </section>

      <section class="th-section">
        <h4 class="th-head"><span class="th-no">03</span>什么时候用</h4>
        <ul class="th-list th-ul">
          <li v-for="(w, i) in doc.when" :key="i">{{ w }}</li>
        </ul>
      </section>

      <section class="th-section">
        <h4 class="th-head"><span class="th-no">04</span>怎么用</h4>
        <ol class="th-list th-ol">
          <li v-for="(h, i) in doc.how" :key="i">{{ h }}</li>
        </ol>
      </section>

      <section class="th-section">
        <h4 class="th-head"><span class="th-no">05</span>示例</h4>
        <div class="th-example">
          <div class="th-io">
            <span class="th-io-label">输入</span>
            <pre class="th-pre">{{ doc.example.input }}</pre>
          </div>
          <div class="th-io">
            <span class="th-io-label">输出</span>
            <pre class="th-pre">{{ doc.example.output }}</pre>
          </div>
          <p v-if="doc.example.note" class="th-note">{{ doc.example.note }}</p>
        </div>
      </section>

      <section class="th-section">
        <h4 class="th-head"><span class="th-no">06</span>注意 / 坑</h4>
        <ul class="th-cautions">
          <li v-for="(c, i) in doc.cautions" :key="i">{{ c }}</li>
        </ul>
      </section>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TOOL_HELP } from '@/config/toolHelp'

const props = defineProps<{
  /** 抽屉开关 */
  open: boolean
  /** 当前工具 key（文档跟随该 key） */
  toolKey: string
  /** 抽屉标题里的工具名 */
  toolLabel: string
}>()

const emit = defineEmits<{ close: [] }>()

const doc = computed(() => TOOL_HELP[props.toolKey])
</script>

<style scoped>
.tool-help {
  font-size: 13px;
  line-height: 1.7;
}

.th-section {
  margin-bottom: 18px;
}

.th-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--fg);
}

/* 段落序号：accent 弱化小标 */
.th-no {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--mono, ui-monospace, monospace);
}

.th-text {
  margin: 0;
  color: var(--fg);
}

.th-list {
  margin: 0;
  padding-left: 20px;
}

.th-ul {
  list-style: disc;
}

.th-ol {
  list-style: decimal;
}

.th-list li {
  margin-bottom: 4px;
}

/* 示例：输入 → 输出 mono 对照块 */
.th-example {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.th-io {
  padding: 8px 12px;
}

.th-io + .th-io {
  border-top: 1px solid var(--border);
  background: var(--bg, #f5f7fa);
}

.th-io-label {
  display: inline-block;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}

.th-pre {
  margin: 0;
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--fg);
}

.th-note {
  margin: 6px 12px;
  font-size: 12px;
  color: var(--muted);
}

/* 注意/坑：琥珀警告块（与 SM4 短密钥警告同族视觉） */
.th-cautions {
  margin: 0;
  padding: 9px 14px 9px 30px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  color: #92400e;
  list-style: disc;
}

.th-cautions li {
  margin-bottom: 4px;
}

.th-cautions li:last-child {
  margin-bottom: 0;
}
</style>
