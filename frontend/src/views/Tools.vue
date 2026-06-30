<template>
  <a-layout class="tools-layout">
    <!-- 左侧图标栏 -->
    <a-layout-sider width="56" class="tools-sider">
      <div class="icon-list">
        <a-tooltip v-for="tool in tools" :key="tool.key" :title="tool.label" placement="right">
          <div
            class="icon-item"
            :class="{ active: activeTool === tool.key }"
            @click="activeTool = tool.key"
          >
            <component :is="tool.icon" />
          </div>
        </a-tooltip>
      </div>
    </a-layout-sider>

    <!-- 右侧工作区 -->
    <a-layout-content class="tools-content">
      <!-- Lua 互转 -->
      <div v-if="activeTool === 'lua'" class="tool-panel">
        <div class="tool-header">Lua 函数 ↔ 配置字符串</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">Lua 函数体</div>
            <a-textarea
              v-model:value="luaInput"
              :rows="textareaRows"
              placeholder="输入完整 Lua 函数定义，例如：function(conf, ctx) ngx.log(ngx.ERR, 'hello') end"
            />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(luaInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => luaInput = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="handleLuaEncode">转为字符串 →</a-button>
            <a-button @click="handleLuaDecode">← 还原函数</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">配置字符串</div>
            <a-textarea
              v-model:value="luaOutput"
              :rows="textareaRows"
              placeholder="或在此粘贴配置字符串进行反向转换"
            />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(luaOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => luaOutput = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- URL 编解码 -->
      <div v-if="activeTool === 'url'" class="tool-panel">
        <div class="tool-header">URL 编解码</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="urlInput" :rows="textareaRows" placeholder="输入要编码或解码的内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(urlInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => urlInput = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="urlOutput = toolsUrl.encode(urlInput)">编码 ↓</a-button>
            <a-button @click="urlOutput = toolsUrl.decode(urlInput)">解码 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="urlOutput" :rows="textareaRows" placeholder="结果将显示在此" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(urlOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => urlOutput = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- JSON 格式化 -->
      <div v-if="activeTool === 'json'" class="tool-panel">
        <div class="tool-header">JSON 格式化</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入</div>
            <a-textarea v-model:value="jsonInput" :rows="textareaRows" placeholder='输入 JSON 字符串，例如：{"name":"test"}' />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => jsonInput = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="jsonOutput = toolsJson.format(jsonInput)">格式化 ↓</a-button>
            <a-button @click="jsonOutput = toolsJson.minify(jsonInput)">压缩 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="jsonOutput" :rows="textareaRows" readonly placeholder="格式化或压缩结果将显示在此" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => jsonOutput = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- SM4 加解密 -->
      <div v-if="activeTool === 'sm4'" class="tool-panel">
        <div class="tool-header">SM4 加解密（ECB + PKCS7）</div>
        <div class="sm4-key-row">
          <span class="key-label">密钥：</span>
          <a-input-password v-model:value="sm4Key" placeholder="SM4 密钥（16 字节）" style="width: 260px" />
          <a-button size="small" @click="sm4Key = 'a16bc20453da220f'">恢复默认</a-button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">明文</div>
            <a-textarea v-model:value="sm4Plaintext" :rows="textareaRows" placeholder="输入明文" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(sm4Plaintext)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => sm4Plaintext = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="sm4Ciphertext = toolsSm4.encrypt(sm4Plaintext, sm4Key)">加密 →</a-button>
            <a-button @click="sm4Plaintext = toolsSm4.decrypt(sm4Ciphertext, sm4Key)">← 解密</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">密文（Base64）</div>
            <a-textarea v-model:value="sm4Ciphertext" :rows="textareaRows" placeholder="输入 Base64 密文" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(sm4Ciphertext)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => sm4Ciphertext = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Base64 编解码 -->
      <div v-if="activeTool === 'base64'" class="tool-panel">
        <div class="tool-header">Base64 编解码</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="base64Input" :rows="textareaRows" placeholder="输入要编码或解码的内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(base64Input)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => base64Input = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="base64Output = toolsBase64.encode(base64Input)">编码 ↓</a-button>
            <a-button @click="base64Output = toolsBase64.decode(base64Input)">解码 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="base64Output" :rows="textareaRows" placeholder="结果将显示在此" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(base64Output)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => base64Output = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- YAML 格式化 -->
      <div v-if="activeTool === 'yaml'" class="tool-panel">
        <div class="tool-header">YAML 格式化 <span class="tool-hint">格式化工具有序 key 但会丢弃 YAML 注释</span></div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入</div>
            <a-textarea v-model:value="yamlInput" :rows="textareaRows" placeholder="输入 YAML 内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(yamlOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => yamlOutput = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="yamlOutput = toolsYaml.format(yamlInput)">格式化 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="yamlOutput" :rows="textareaRows" readonly placeholder="格式化结果将显示在此" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(yamlOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => yamlOutput = v)">粘贴</a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- JSON 对比 -->
      <div v-if="activeTool === 'diff'" class="tool-panel">
        <div class="tool-header">JSON 数据对比</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">JSON A</div>
            <a-textarea v-model:value="diffInputA" :rows="textareaRows" placeholder='输入 JSON A，如 {"name":"test"}' />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(diffInputA)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => diffInputA = v)">粘贴</a-button>
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="handleDiff" :disabled="!diffInputA || !diffInputB">对比 →</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">JSON B</div>
            <a-textarea v-model:value="diffInputB" :rows="textareaRows" placeholder='输入 JSON B，如 {"name":"test2"}' />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(diffInputB)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => diffInputB = v)">粘贴</a-button>
            </div>
          </div>
        </div>
        <div v-if="diffError" class="diff-error">{{ diffError }}</div>
        <div v-if="diffResultHtml" class="diff-result-box">
          <div class="panel-label" style="margin-bottom:8px;">差异结果</div>
          <div class="diff-tree" v-html="diffResultHtml"></div>
          <div class="copy-row" style="margin-top:8px;">
            <a-button size="small" class="copy-btn" @click="copyToClipboard(diffResultText)">复制结果</a-button>
          </div>
        </div>
      </div>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  CodeOutlined,
  LinkOutlined,
  FileTextOutlined,
  LockOutlined,
  BlockOutlined,
  SnippetsOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons-vue'
import { luaToConfigString, configStringToLua } from '@/utils/tools/lua'
import * as toolsUrl from '@/utils/tools/url'
import * as toolsJson from '@/utils/tools/json'
import * as toolsSm4 from '@/utils/tools/sm4'
import * as toolsBase64 from '@/utils/tools/base64'
import * as toolsYaml from '@/utils/tools/yaml'
import { computeDiff, renderDiffTree, sortValue, escapeHtml } from '@/utils/tools/diff'

interface ToolItem {
  key: string
  label: string
  icon: any
}

const tools: ToolItem[] = [
  { key: 'lua', label: 'Lua 互转', icon: CodeOutlined },
  { key: 'url', label: 'URL 编解码', icon: LinkOutlined },
  { key: 'json', label: 'JSON 格式化', icon: FileTextOutlined },
  { key: 'sm4', label: 'SM4 加解密', icon: LockOutlined },
  { key: 'base64', label: 'Base64 编解码', icon: BlockOutlined },
  { key: 'yaml', label: 'YAML 格式化', icon: SnippetsOutlined },
  { key: 'diff', label: 'JSON 对比', icon: ColumnWidthOutlined },
]

const activeTool = ref('lua')

const textareaRows = ref(20)
function updateTextareaRows() {
  textareaRows.value = Math.max(8, Math.floor((window.innerHeight - 300) / 28))
}
onMounted(() => {
  updateTextareaRows()
  window.addEventListener('resize', updateTextareaRows)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateTextareaRows)
})

// Lua — 按钮驱动双向转换
const luaInput = ref('')
const luaOutput = ref('')

function handleLuaEncode() {
  luaOutput.value = luaToConfigString(luaInput.value)
}

function handleLuaDecode() {
  luaInput.value = configStringToLua(luaOutput.value)
}

// URL
const urlInput = ref('')
const urlOutput = ref('')

// JSON
const jsonInput = ref('')
const jsonOutput = ref('')

// SM4
const sm4Key = ref('a16bc20453da220f')
const sm4Plaintext = ref('')
const sm4Ciphertext = ref('')

// Base64
const base64Input = ref('')
const base64Output = ref('')

// YAML
const yamlInput = ref('')
const yamlOutput = ref('')

// JSON Diff
const diffInputA = ref('')
const diffInputB = ref('')
const diffResultHtml = ref('')
const diffResultText = ref('')
const diffError = ref('')

function handleDiff() {
  diffError.value = ''
  diffResultHtml.value = ''
  diffResultText.value = ''
  let objA: unknown, objB: unknown
  try {
    objA = JSON.parse(diffInputA.value)
  } catch {
    diffError.value = 'JSON A 解析失败：请检查格式'
    return
  }
  try {
    objB = JSON.parse(diffInputB.value)
  } catch {
    diffError.value = 'JSON B 解析失败：请检查格式'
    return
  }
  const sortedA = sortValue(objA)
  const sortedB = sortValue(objB)
  const diff = computeDiff(sortedA, sortedB)
  diffResultHtml.value = renderDiffTree(diff)
  // Build plain-text copy
  diffResultText.value = JSON.stringify(sortedA, null, 2) + '\n\n--- 对比 ---\n\n' + JSON.stringify(sortedB, null, 2)
}

async function copyToClipboard(text: string) {
  if (!text) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function pasteFromClipboard(setter: (text: string) => void) {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) {
      message.warning('剪贴板为空')
      return
    }
    setter(text)
    message.success('已粘贴')
  } catch {
    message.error('粘贴失败，请手动 Ctrl+V')
  }
}
</script>

<style scoped>
.tools-layout {
  height: calc(100vh - 96px);
  background: transparent;
}

.tools-sider {
  background: var(--bg) !important;
  border-right: 1px solid var(--border);
  padding-top: 12px;
}

.icon-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.icon-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  color: var(--muted);
  font-size: 20px;
  transition: all 0.2s;
}

.icon-item:hover {
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
}

.icon-item.active {
  background: var(--accent);
  color: #fff;
}

.tool-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 24px;
}

.tools-content {
  padding: 24px;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
}
.tools-content .tool-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.tools-content .tool-panel .dual-panel {
  flex: 1;
  align-items: stretch;
  min-height: 0;
}
.tools-content .tool-panel .panel-left,
.tools-content .tool-panel .panel-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.tools-content .tool-panel .panel-left :deep(.ant-form-item),
.tools-content .tool-panel .panel-right :deep(.ant-form-item) {
  flex: 1;
}
.tools-content .tool-panel .panel-left :deep(textarea),
.tools-content .tool-panel .panel-right :deep(textarea) {
  flex: 1;
  min-height: 100px;
}
/* SM4 has key row above, adjust */
.tools-content .tool-panel .sm4-key-row + .dual-panel {
  flex: 1;
  min-height: 0;
}

.tool-header {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.dual-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.panel-left,
.panel-right {
  flex: 1;
  min-width: 0;
}

.panel-label {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 6px;
}

.copy-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 24px;
  flex-shrink: 0;
  align-items: center;
}

/* ── JSON Diff ── */
.diff-error {
  margin-top: 12px;
  padding: 8px 12px;
  background: oklch(55% 0.18 28 / 8%);
  border: 1px solid oklch(55% 0.18 28 / 25%);
  border-radius: 6px;
  color: var(--danger);
  font-size: 13px;
}
.diff-result-box {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  background: var(--surface);
}
.diff-result-box .diff-tree {
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  font-family: var(--font-mono, monospace);
}
.diff-result-box .diff-tree .diff-key {
  color: var(--fg);
  font-weight: 500;
}
.diff-result-box .diff-tree .diff-same {
  color: var(--muted);
}
.diff-result-box .diff-tree .diff-added {
  color: var(--success);
  background: oklch(55% 0.15 145 / 10%);
  padding: 0 4px;
  border-radius: 2px;
}
.diff-result-box .diff-tree .diff-removed {
  color: var(--danger);
  background: oklch(55% 0.18 28 / 8%);
  padding: 0 4px;
  border-radius: 2px;
  text-decoration: line-through;
}
.diff-result-box .diff-tree .diff-changed-a {
  color: var(--danger);
  background: oklch(55% 0.18 28 / 8%);
  padding: 0 4px;
  border-radius: 2px;
}
.diff-result-box .diff-tree .diff-changed-b {
  color: var(--success);
  background: oklch(55% 0.15 145 / 10%);
  padding: 0 4px;
  border-radius: 2px;
}

.sm4-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.key-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

:deep(.ant-card) {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
:deep(.ant-select-selector) {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}
:deep(.ant-select-selection-item) {
  color: var(--fg) !important;
}
</style>
