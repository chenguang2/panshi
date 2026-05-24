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
              :rows="16"
              placeholder="输入完整 Lua 函数定义，例如：function(conf, ctx) ngx.log(ngx.ERR, 'hello') end"
            />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(luaInput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => luaInput = v)">粘贴</a-button>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="handleLuaEncode">转为字符串 →</a-button>
            <a-button @click="handleLuaDecode">← 还原函数</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">配置字符串</div>
            <a-textarea
              v-model:value="luaOutput"
              :rows="16"
              placeholder="或在此粘贴配置字符串进行反向转换"
            />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(luaOutput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => luaOutput = v)">粘贴</a-button>
          </div>
        </div>
      </div>

      <!-- URL 编解码 -->
      <div v-if="activeTool === 'url'" class="tool-panel">
        <div class="tool-header">URL 编解码</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="urlInput" :rows="14" placeholder="输入要编码或解码的内容" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(urlInput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => urlInput = v)">粘贴</a-button>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="urlOutput = toolsUrl.encode(urlInput)">编码 ↓</a-button>
            <a-button @click="urlOutput = toolsUrl.decode(urlInput)">解码 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="urlOutput" :rows="14" placeholder="结果将显示在此" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(urlOutput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => urlOutput = v)">粘贴</a-button>
          </div>
        </div>
      </div>

      <!-- JSON 格式化 -->
      <div v-if="activeTool === 'json'" class="tool-panel">
        <div class="tool-header">JSON 格式化</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入</div>
            <a-textarea v-model:value="jsonInput" :rows="14" placeholder='输入 JSON 字符串，例如：{"name":"test"}' />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonInput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => jsonInput = v)">粘贴</a-button>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="jsonOutput = toolsJson.format(jsonInput)">格式化 ↓</a-button>
            <a-button @click="jsonOutput = toolsJson.minify(jsonInput)">压缩 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="jsonOutput" :rows="14" readonly placeholder="格式化或压缩结果将显示在此" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonOutput)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => jsonOutput = v)">粘贴</a-button>
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
            <a-textarea v-model:value="sm4Plaintext" :rows="12" placeholder="输入明文" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(sm4Plaintext)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => sm4Plaintext = v)">粘贴</a-button>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="sm4Ciphertext = toolsSm4.encrypt(sm4Plaintext, sm4Key)">加密 →</a-button>
            <a-button @click="sm4Plaintext = toolsSm4.decrypt(sm4Ciphertext, sm4Key)">← 解密</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">密文（Base64）</div>
            <a-textarea v-model:value="sm4Ciphertext" :rows="12" placeholder="输入 Base64 密文" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(sm4Ciphertext)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => sm4Ciphertext = v)">粘贴</a-button>
          </div>
        </div>
      </div>

      <!-- Base64 编解码 -->
      <div v-if="activeTool === 'base64'" class="tool-panel">
        <div class="tool-header">Base64 编解码</div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="base64Input" :rows="14" placeholder="输入要编码或解码的内容" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(base64Input)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => base64Input = v)">粘贴</a-button>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="base64Output = toolsBase64.encode(base64Input)">编码 ↓</a-button>
            <a-button @click="base64Output = toolsBase64.decode(base64Input)">解码 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="base64Output" :rows="14" placeholder="结果将显示在此" />
            <a-button size="small" class="copy-btn" @click="copyToClipboard(base64Output)">复制</a-button>
            <a-button size="small" class="copy-btn" @click="pasteFromClipboard(v => base64Output = v)">粘贴</a-button>
          </div>
        </div>
      </div>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  CodeOutlined,
  LinkOutlined,
  FileTextOutlined,
  LockOutlined,
  BlockOutlined,
} from '@ant-design/icons-vue'
import { luaToConfigString, configStringToLua } from '@/utils/tools/lua'
import * as toolsUrl from '@/utils/tools/url'
import * as toolsJson from '@/utils/tools/json'
import * as toolsSm4 from '@/utils/tools/sm4'
import * as toolsBase64 from '@/utils/tools/base64'

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
]

const activeTool = ref('lua')

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
  height: 100%;
  background: transparent;
}

.tools-sider {
  background: var(--p-bg-hover) !important;
  border-right: 1px solid var(--p-border-default);
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
  color: var(--p-text-secondary);
  font-size: 20px;
  transition: all 0.2s;
}

.icon-item:hover {
  background: var(--p-color-primary-bg);
  color: var(--p-color-primary);
}

.icon-item.active {
  background: var(--p-color-primary);
  color: var(--p-text-inverse);
}

.tools-content {
  padding: 24px;
  overflow-y: auto;
}

.tool-header {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--p-border-divider);
  color: var(--p-text-primary);
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
  color: var(--p-text-tertiary);
  margin-bottom: 6px;
}

.copy-btn {
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

.sm4-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.key-label {
  font-size: 13px;
  color: var(--p-text-secondary);
  white-space: nowrap;
}
</style>
