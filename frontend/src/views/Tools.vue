<template>
  <a-layout class="tools-layout">
    <!-- 左侧导航栏（图标+文字） -->
    <a-layout-sider width="132" class="tools-sider">
      <div class="icon-list">
        <div
          v-for="tool in tools"
          :key="tool.key"
          class="nav-item"
          :class="{ active: activeTool === tool.key }"
          @click="activeTool = tool.key"
        >
          <component :is="tool.icon" />
          <span class="nav-label">{{ tool.shortLabel }}</span>
        </div>
      </div>
    </a-layout-sider>

    <!-- 右侧工作区 -->
    <a-layout-content class="tools-content">
      <!-- Lua 互转 -->
      <div v-if="activeTool === 'lua'" class="tool-panel">
        <div class="tool-header">
          <span>Lua 函数 ↔ 配置字符串</span>
          <span class="tool-hint">用于插件 pre_functions 配置与 Lua 函数体的双向转换</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('lua')">清空</button>
        </div>
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
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (luaInput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="handleLuaEncode">转换为字符串 →</a-button>
            <a-button @click="handleLuaDecode">→ 转换为函数</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">配置字符串</div>
            <a-textarea v-model:value="luaOutput" :rows="textareaRows" placeholder="或在此粘贴配置字符串进行反向转换" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(luaOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (luaOutput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- URL 编解码 -->
      <div v-if="activeTool === 'url'" class="tool-panel">
        <div class="tool-header">
          <span>URL 编解码</span>
          <span class="tool-hint">encodeURIComponent 语义，适用于 URL 参数转义与还原</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('url')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="urlInput" :rows="textareaRows" placeholder="输入要编码或解码的内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(urlInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (urlInput = v), $event)"
                >粘贴</a-button
              >
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
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (urlOutput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- JSON 格式化 -->
      <div v-if="activeTool === 'json'" class="tool-panel">
        <div class="tool-header">
          <span>JSON 格式化</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('json')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入</div>
            <a-textarea
              v-model:value="jsonInput"
              :rows="textareaRows"
              placeholder='输入 JSON 字符串，例如：{"name":"test"}'
            />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (jsonInput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="jsonOutput = toolsJson.format(jsonInput)">格式化 ↓</a-button>
            <a-button @click="jsonOutput = toolsJson.minify(jsonInput)">压缩 ↓</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea
              v-model:value="jsonOutput"
              :rows="textareaRows"
              readonly
              placeholder="格式化或压缩结果将显示在此"
            />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(jsonOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (jsonOutput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- SM4 加解密 -->
      <div v-if="activeTool === 'sm4'" class="tool-panel">
        <div class="tool-header">
          <span>SM4 加解密（ECB + PKCS7）</span>
          <span class="tool-hint">用于调试平台 ↔ Edge 通道的加密链路</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('sm4')">清空</button>
        </div>
        <div v-if="sm4KeyWarn" class="sm4-warn">⚠ {{ sm4KeyWarn }}</div>
        <div class="sm4-key-row">
          <span class="key-label">密钥：</span>
          <a-input-password v-model:value="sm4Key" placeholder="SM4 密钥（16 字符）" style="width: 260px" />
          <a-button
            size="small"
            title="恢复为 Edge 通道默认 SM4 密钥（调试平台↔Edge 加密链路用）"
            @click="sm4Key = 'a16bc20453da220f'"
            >恢复默认</a-button
          >
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">明文</div>
            <a-textarea v-model:value="sm4Plaintext" :rows="textareaRows" placeholder="输入明文" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(sm4Plaintext)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (sm4Plaintext = v), $event)"
                >粘贴</a-button
              >
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
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (sm4Ciphertext = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Base64 编解码 -->
      <div v-if="activeTool === 'base64'" class="tool-panel">
        <div class="tool-header">
          <span>Base64 编解码</span>
          <span class="tool-hint">UTF-8 安全编码（btoa/unescape 链），适用于文本与密文互转</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('base64')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">原文</div>
            <a-textarea v-model:value="base64Input" :rows="textareaRows" placeholder="输入要编码或解码的内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(base64Input)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (base64Input = v), $event)"
                >粘贴</a-button
              >
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
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (base64Output = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- YAML 格式化 -->
      <div v-if="activeTool === 'yaml'" class="tool-panel">
        <div class="tool-header">
          <span>YAML 格式化</span>
          <span class="tool-hint">格式化工具有序 key 但会丢弃 YAML 注释</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('yaml')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入</div>
            <a-textarea v-model:value="yamlInput" :rows="textareaRows" placeholder="输入 YAML 内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(yamlInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (yamlInput = v), $event)"
                >粘贴</a-button
              >
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
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (yamlOutput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- JSON 对比 -->
      <div v-if="activeTool === 'diff'" class="tool-panel">
        <div class="tool-header">
          <span>JSON 数据对比</span>
          <span class="tool-hint">先格式化归一（键序无关）再逐行对比</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('diff')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">JSON A</div>
            <a-textarea v-model:value="diffInputA" :rows="textareaRows" placeholder='输入 JSON A，如 {"name":"test"}' />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(diffInputA)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (diffInputA = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
          <div class="panel-actions">
            <a-button @click="formatBoth">两边格式化</a-button>
            <a-button type="primary" @click="handleDiff" :disabled="!diffInputA || !diffInputB">对比 →</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">JSON B</div>
            <a-textarea
              v-model:value="diffInputB"
              :rows="textareaRows"
              placeholder='输入 JSON B，如 {"name":"test2"}'
            />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(diffInputB)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (diffInputB = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
        <div v-if="diffError" class="diff-error">{{ diffError }}</div>
        <div v-if="diffResultHtml" class="diff-result-box">
          <div class="panel-label" style="margin: 12px 12px 0; color: #aaa">差异结果（红=删除/旧值，绿=新增/新值）</div>
          <div class="dl-wrap" v-html="diffResultHtml"></div>
        </div>
      </div>

      <!-- 时间戳转换 -->
      <div v-if="activeTool === 'timestamp'" class="tool-panel">
        <div class="tool-header">
          <span>时间戳转换</span>
          <span class="tool-hint">无时区后缀字符串按 UTC 解析（平台存储约定）；北京时间 = UTC+8</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="fillNow">当前时间</button>
          <button class="btn-clear" @click="clearTool('timestamp')">清空</button>
        </div>
        <div class="single-input-row">
          <a-textarea
            v-model:value="tsInput"
            :rows="2"
            placeholder="粘贴 epoch（10 位秒 / 13 位毫秒）或日期时间（如 2026-10-30 08:00:00），输入即算"
          />
        </div>
        <div v-if="parsedTime.error" class="diff-error">{{ parsedTime.error }}</div>
        <div v-else-if="parsedTime.epochMs" class="result-grid">
          <div class="rg-row">
            <span class="rg-key">识别为</span><span class="rg-val">{{ parsedTime.detected }}</span>
          </div>
          <div class="rg-row rg-hl">
            <span class="rg-key">北京时间</span><span class="rg-val">{{ parsedTime.beijing }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">UTC</span><span class="rg-val">{{ parsedTime.utc }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">epoch 秒</span><span class="rg-val">{{ parsedTime.epochSec }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">epoch 毫秒</span><span class="rg-val">{{ parsedTime.epochMs }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">ISO 8601</span><span class="rg-val">{{ parsedTime.iso }}</span>
          </div>
        </div>
      </div>

      <!-- JWT 解码 -->
      <div v-if="activeTool === 'jwt'" class="tool-panel">
        <div class="tool-header">
          <span>JWT 解码</span>
          <span class="tool-hint">纯解码查看内容，不验证签名（签名校验需服务端密钥）</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('jwt')">清空</button>
        </div>
        <div class="single-input-row">
          <a-textarea v-model:value="jwtInput" :rows="3" placeholder="粘贴 JWT token（三段 . 分隔），输入即算" />
        </div>
        <div v-if="decodedJwt.error" class="diff-error">{{ decodedJwt.error }}</div>
        <template v-else-if="decodedJwt.payload">
          <div class="jwt-block">
            <div class="panel-label">Header</div>
            <pre class="jwt-pre">{{ pretty(decodedJwt.header) }}</pre>
          </div>
          <div class="jwt-block">
            <div class="panel-label">Payload</div>
            <pre class="jwt-pre">{{ pretty(decodedJwt.payload) }}</pre>
          </div>
          <div v-if="expInfo" class="result-grid">
            <div class="rg-row rg-hl">
              <span class="rg-key">exp（过期时间）</span>
              <span class="rg-val">
                {{ expInfo.beijing }}
                <span class="exp-tag" :class="expInfo.expired ? 'is-expired' : 'is-alive'">
                  {{ expInfo.expired ? '已过期' : `剩余 ${expInfo.remainMin} 分钟` }}
                </span>
              </span>
            </div>
          </div>
          <div class="tool-hint" style="margin-top: 10px">签名段已省略（验签需服务端密钥，解码用途是查看内容）</div>
        </template>
      </div>

      <!-- YAML ↔ JSON 互转 -->
      <div v-if="activeTool === 'convert'" class="tool-panel">
        <div class="tool-header">
          <span>YAML ↔ JSON 互转</span>
          <span class="tool-hint">edge.env（YAML）与插件配置（JSON）两域配置互看互转</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('convert')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">输入（YAML 或 JSON）</div>
            <a-textarea v-model:value="convertInput" :rows="textareaRows" placeholder="输入 YAML 或 JSON 内容" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(convertInput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (convertInput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="convertOutput = convertGo('yamlToJson')">YAML → JSON</a-button>
            <a-button @click="convertOutput = convertGo('jsonToYaml')">JSON → YAML</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">结果</div>
            <a-textarea v-model:value="convertOutput" :rows="textareaRows" readonly placeholder="转换结果将显示在此" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(convertOutput)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (convertOutput = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- 文本 Diff -->
      <div v-if="activeTool === 'textdiff'" class="tool-panel">
        <div class="tool-header">
          <span>文本 Diff</span>
          <span class="tool-hint">逐行对比纯文本（配置文件、清单等），不做键序归一化</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('textdiff')">清空</button>
        </div>
        <div class="dual-panel">
          <div class="panel-left">
            <div class="panel-label">文本 A</div>
            <a-textarea v-model:value="textDiffA" :rows="textareaRows" placeholder="输入原始文本" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(textDiffA)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (textDiffA = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
          <div class="panel-actions">
            <a-button type="primary" @click="handleTextDiff" :disabled="!textDiffA || !textDiffB">对比 →</a-button>
          </div>
          <div class="panel-right">
            <div class="panel-label">文本 B</div>
            <a-textarea v-model:value="textDiffB" :rows="textareaRows" placeholder="输入对比文本" />
            <div class="copy-row">
              <a-button size="small" class="copy-btn" @click="copyToClipboard(textDiffB)">复制</a-button>
              <a-button size="small" class="copy-btn" @click="pasteFromClipboard((v) => (textDiffB = v), $event)"
                >粘贴</a-button
              >
            </div>
          </div>
        </div>
        <div v-if="textDiffError" class="diff-error">{{ textDiffError }}</div>
        <div v-if="textDiffHtml" class="diff-result-box">
          <div class="panel-label" style="margin: 12px 12px 0; color: #aaa">差异结果（红=删除，绿=新增）</div>
          <div class="dl-wrap" v-html="textDiffHtml"></div>
        </div>
      </div>

      <!-- IPv4/CIDR 计算器 -->
      <div v-if="activeTool === 'ipcalc'" class="tool-panel">
        <div class="tool-header">
          <span>IPv4/CIDR 计算器</span>
          <span class="tool-hint">仅 IPv4；节点白名单、中继网段规划、子网换算</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('ipcalc')">清空</button>
        </div>
        <div class="single-input-row">
          <a-textarea
            v-model:value="ipInput"
            :rows="2"
            placeholder="输入 IPv4 地址或网段（如 192.168.1.10/24），缺省前缀按 /32，输入即算"
          />
        </div>
        <div v-if="ipResult.error" class="diff-error">{{ ipResult.error }}</div>
        <div v-else-if="ipResult.ip" class="result-grid">
          <div class="rg-row rg-hl">
            <span class="rg-key">IP / 前缀</span
            ><span class="rg-val"
              >{{ ipResult.ip }}/{{ ipResult.prefix
              }}<span v-if="ipResult.isPrivate" class="exp-tag is-alive" style="margin-left: 8px">私网段</span></span
            >
          </div>
          <div class="rg-row">
            <span class="rg-key">子网掩码</span
            ><span class="rg-val">{{ ipResult.mask }}（{{ ipResult.wildcard }}）</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">网络地址</span><span class="rg-val">{{ ipResult.network }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">广播地址</span><span class="rg-val">{{ ipResult.broadcast }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">可用主机范围</span
            ><span class="rg-val">{{ ipResult.firstHost }} - {{ ipResult.lastHost }}</span>
          </div>
          <div class="rg-row">
            <span class="rg-key">可用主机数</span
            ><span class="rg-val">{{ ipResult.usableHosts }}（共 {{ ipResult.totalHosts }} 个地址）</span>
          </div>
        </div>
      </div>

      <!-- 哈希计算 -->
      <div v-if="activeTool === 'hash'" class="tool-panel">
        <div class="tool-header">
          <span>哈希计算</span>
          <span class="tool-hint">文件/备份校验、口令指纹比对；输出小写十六进制</span>
          <span class="spacer"></span>
          <button class="btn-clear" @click="clearTool('hash')">清空</button>
        </div>
        <div class="single-input-row">
          <a-textarea v-model:value="hashInput" :rows="4" placeholder="输入要计算哈希的文本，输入即算" />
        </div>
        <div v-if="hashResults" class="result-grid">
          <div v-for="row in hashResults" :key="row.name" class="rg-row">
            <span class="rg-key">{{ row.name }}</span>
            <span class="rg-val">{{ row.value || '—' }}</span>
          </div>
        </div>
      </div>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  CodeOutlined,
  LinkOutlined,
  FileTextOutlined,
  LockOutlined,
  BlockOutlined,
  SnippetsOutlined,
  ColumnWidthOutlined,
  ClockCircleOutlined,
  KeyOutlined,
  SwapOutlined,
  DiffOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons-vue'
import { luaToConfigString, configStringToLua } from '@/utils/tools/lua'
import * as toolsUrl from '@/utils/tools/url'
import * as toolsJson from '@/utils/tools/json'
import * as toolsSm4 from '@/utils/tools/sm4'
import * as toolsBase64 from '@/utils/tools/base64'
import * as toolsYaml from '@/utils/tools/yaml'
import { renderLineDiff, sortValue, type LineDiffResult } from '@/utils/tools/diff'
import { parseTimeInput, type TimeParseResult } from '@/utils/tools/time'
import { decodeJwt } from '@/utils/tools/jwt'
import { yamlToJson, jsonToYaml } from '@/utils/tools/convert'
import { parseCidr, type CidrResult } from '@/utils/tools/ip'
import { md5, shaHex } from '@/utils/tools/hash'
import { textLineDiff } from '@/utils/tools/textdiff'

interface ToolItem {
  key: string
  label: string
  /** 导航栏短名（132px 栏宽下不折行） */
  shortLabel: string
  icon: any
}

const tools: ToolItem[] = [
  { key: 'lua', label: 'Lua 互转', shortLabel: 'Lua 互转', icon: CodeOutlined },
  { key: 'url', label: 'URL 编解码', shortLabel: 'URL', icon: LinkOutlined },
  { key: 'json', label: 'JSON 格式化', shortLabel: 'JSON', icon: FileTextOutlined },
  { key: 'sm4', label: 'SM4 加解密', shortLabel: 'SM4', icon: LockOutlined },
  { key: 'base64', label: 'Base64 编解码', shortLabel: 'Base64', icon: BlockOutlined },
  { key: 'yaml', label: 'YAML 格式化', shortLabel: 'YAML', icon: SnippetsOutlined },
  { key: 'diff', label: 'JSON 对比', shortLabel: 'JSON 对比', icon: ColumnWidthOutlined },
  { key: 'timestamp', label: '时间戳转换', shortLabel: '时间戳', icon: ClockCircleOutlined },
  { key: 'jwt', label: 'JWT 解码', shortLabel: 'JWT', icon: KeyOutlined },
  { key: 'convert', label: 'YAML↔JSON 互转', shortLabel: '互转', icon: SwapOutlined },
  { key: 'textdiff', label: '文本 Diff', shortLabel: '文本对比', icon: DiffOutlined },
  { key: 'ipcalc', label: 'IPv4/CIDR 计算器', shortLabel: 'IP/CIDR', icon: GlobalOutlined },
  { key: 'hash', label: '哈希计算', shortLabel: '哈希', icon: SafetyCertificateOutlined },
]

const TOOL_KEYS = tools.map((t) => t.key)

// 深链：?tool=<key>（tools-ux-review-fixes 2.2）——切换 replace（不污染历史），进页白名单校验回退
const route = useRoute()
const router = useRouter()
const activeTool = ref('lua')

function syncToolQuery(key: string): void {
  const v = route.query.tool
  if (v === key) return
  router.replace({ query: { ...route.query, tool: key } })
}

watch(activeTool, (key) => syncToolQuery(key))

const stopQueryWatch = watch(
  () => route.query.tool,
  (v) => {
    if (typeof v === 'string' && TOOL_KEYS.includes(v) && v !== activeTool.value) {
      activeTool.value = v
    } else if (v === undefined && activeTool.value !== 'lua') {
      // 用户手动清掉 query（浏览器返回到 /tools）→ 回默认工具
      activeTool.value = 'lua'
    }
  },
)

// 进页初始化：?tool= 白名单校验（非法/缺失回退 lua，不写 URL）
const initialTool = route.query.tool
if (typeof initialTool === 'string' && TOOL_KEYS.includes(initialTool)) {
  activeTool.value = initialTool
}

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
  stopQueryWatch()
})

// ── SM4 短密钥警告（tools-ux-review-fixes 2.3）：非 16 字节提示与通道行为差异，不阻断 ──
const sm4Key = ref('a16bc20453da220f')
const sm4KeyWarn = computed(() => {
  const bytes = new TextEncoder().encode(sm4Key.value).length
  if (bytes === 16) return ''
  return `密钥非 16 字节（实际 ${bytes} 字节），已自动补齐/截断——与 Edge 通道真实加解密行为可能不一致`
})

// ── 清空当前工具（tools-ux-review-fixes 2.4）──
const luaInput = ref('')
const luaOutput = ref('')
const urlInput = ref('')
const urlOutput = ref('')
const jsonInput = ref('')
const jsonOutput = ref('')
const sm4Plaintext = ref('')
const sm4Ciphertext = ref('')
const base64Input = ref('')
const base64Output = ref('')
const yamlInput = ref('')
const yamlOutput = ref('')
const diffInputA = ref('')
const diffInputB = ref('')
const diffResultHtml = ref('')
const diffError = ref('')

function clearTool(key: string): void {
  const clears: Record<string, () => void> = {
    lua: () => {
      luaInput.value = ''
      luaOutput.value = ''
    },
    url: () => {
      urlInput.value = ''
      urlOutput.value = ''
    },
    json: () => {
      jsonInput.value = ''
      jsonOutput.value = ''
    },
    sm4: () => {
      sm4Plaintext.value = ''
      sm4Ciphertext.value = ''
    },
    base64: () => {
      base64Input.value = ''
      base64Output.value = ''
    },
    yaml: () => {
      yamlInput.value = ''
      yamlOutput.value = ''
    },
    diff: () => {
      diffInputA.value = ''
      diffInputB.value = ''
      diffResultHtml.value = ''
      diffError.value = ''
    },
    timestamp: () => {
      tsInput.value = ''
    },
    jwt: () => {
      jwtInput.value = ''
    },
    convert: () => {
      convertInput.value = ''
      convertOutput.value = ''
    },
    textdiff: () => {
      textDiffA.value = ''
      textDiffB.value = ''
      textDiffHtml.value = ''
      textDiffError.value = ''
    },
    ipcalc: () => {
      ipInput.value = ''
    },
    hash: () => {
      hashInput.value = ''
      hashResults.value = null
    },
  }
  clears[key]?.()
}

// ── 文本 Diff（tools-new-utilities 第二批）：复用差异渲染层，无归一化 ──
const textDiffA = ref('')
const textDiffB = ref('')
const textDiffHtml = ref('')
const textDiffError = ref('')

function handleTextDiff(): void {
  textDiffError.value = ''
  textDiffHtml.value = ''
  if (!textDiffA.value.trim()) {
    textDiffError.value = '请输入文本 A'
    return
  }
  if (!textDiffB.value.trim()) {
    textDiffError.value = '请输入文本 B'
    return
  }
  const result = textLineDiff(textDiffA.value, textDiffB.value)
  textDiffHtml.value = result.html
}

// ── IPv4/CIDR 计算器：输入即算 ──
const ipInput = ref('')
const ipResult = computed(() => parseCidr(ipInput.value))

// ── 哈希计算：输入即算（MD5 同步、SHA 异步） ──
const hashInput = ref('')
const hashResults = ref<Array<{ name: string; value: string }> | null>(null)

let hashSeq = 0
watch(hashInput, async (text) => {
  if (!text) {
    hashResults.value = null
    return
  }
  const seq = ++hashSeq
  const rows: Array<{ name: string; value: string }> = [{ name: 'MD5', value: md5(text) }]
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      rows.push({ name: 'SHA-1', value: await shaHex(text, 'SHA-1') })
      rows.push({ name: 'SHA-256', value: await shaHex(text, 'SHA-256') })
      rows.push({ name: 'SHA-512', value: await shaHex(text, 'SHA-512') })
    } catch {
      // Web Crypto 异常时仅展示 MD5
    }
  }
  if (seq === hashSeq) hashResults.value = rows
})

// ── 时间戳转换（tools-new-utilities）：输入即算 ──
const tsInput = ref('')
const parsedTime = computed(() => parseTimeInput(tsInput.value))

function fillNow(): void {
  tsInput.value = String(Date.now())
}

// ── JWT 解码：输入即算 ──
const jwtInput = ref('')
const decodedJwt = computed(() => decodeJwt(jwtInput.value))
const expInfo = computed(() => {
  const exp = decodedJwt.value.payload?.exp
  if (typeof exp !== 'number') return null
  const nowSec = Date.now() / 1000
  const expired = exp <= nowSec
  return {
    beijing: epochToBeijing(exp * 1000),
    expired,
    remainMin: Math.max(0, Math.round((exp - nowSec) / 60)),
  }
})

function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2)
}

// ── YAML ↔ JSON 互转 ──
const convertInput = ref('')
const convertOutput = ref('')

function convertGo(dir: 'yamlToJson' | 'jsonToYaml'): string {
  const fn = dir === 'yamlToJson' ? yamlToJson : jsonToYaml
  const r = fn(convertInput.value)
  return r.error ?? r.text ?? ''
}

function epochToBeijing(epochMs: number): string {
  return fmtInZone(epochMs)
}

function fmtInZone(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(epochMs))
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}`
}

function handleLuaEncode() {
  luaOutput.value = luaToConfigString(luaInput.value)
}

function handleLuaDecode() {
  luaInput.value = configStringToLua(luaOutput.value)
}

function formatOne(input: string): string {
  try {
    return JSON.stringify(sortValue(JSON.parse(input)), null, 2)
  } catch {
    return input
  }
}

function formatBoth() {
  diffError.value = ''
  diffResultHtml.value = ''
  diffInputA.value = formatOne(diffInputA.value)
  diffInputB.value = formatOne(diffInputB.value)
}

function handleDiff() {
  diffError.value = ''
  diffResultHtml.value = ''
  if (!diffInputA.value.trim()) {
    diffError.value = '请输入 JSON A'
    return
  }
  if (!diffInputB.value.trim()) {
    diffError.value = '请输入 JSON B'
    return
  }

  // 先格式化
  formatBoth()
  if (!diffInputA.value.trim() || !diffInputB.value.trim()) return

  // 再对比
  const result: LineDiffResult = renderLineDiff(diffInputA.value, diffInputB.value)
  const totalDiff = result.added + result.removed + result.changed
  const summary =
    totalDiff === 0
      ? '<div class="dl-summary">✅ 两个 JSON 完全一致，无差异</div>'
      : `<div class="dl-summary">📊 共 ${totalDiff} 处差异（+${result.added} 新增, -${result.removed} 删除, ~${result.changed} 修改）</div>`
  diffResultHtml.value = summary + result.html
}

// ── 剪贴板（tools-ux-review-fixes 1.1）：clipboard API 优先，http 内网回退 execCommand ──
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    message.warning('没有可复制的内容')
    return false
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制到剪贴板')
      return true
    } catch {
      // 权限拒绝/环境异常 → 落入 execCommand 回退
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    // execCommand 不可用 → 保持 false
  }
  document.body.removeChild(ta)
  if (ok) {
    message.success('已复制到剪贴板')
    return true
  }
  message.error('复制失败：浏览器限制剪贴板访问，请手动选中文本复制')
  return false
}

async function pasteFromClipboard(setter: (text: string) => void, evt?: Event): Promise<void> {
  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        message.warning('剪贴板为空')
        return
      }
      setter(text)
      message.success('已粘贴')
      return
    } catch {
      // 权限拒绝/非 secure context → 聚焦引导 Ctrl+V
    }
  }
  // http 回退：浏览器不提供主动读取剪贴板的兼容 API，聚焦目标框引导 Ctrl+V
  const target = (evt?.currentTarget as HTMLElement | null)
    ?.closest('.panel-left, .panel-right')
    ?.querySelector('textarea, input')
  if (target instanceof HTMLElement) {
    target.focus()
  }
  message.info('浏览器限制剪贴板读取，请点击输入框后按 Ctrl+V 粘贴')
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
  align-items: stretch;
  gap: 4px;
}

/* 导航项：图标+文字（tools-ux-review-fixes 2.1，56px 纯图标辨识度不足） */
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 4px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--muted);
  font-size: 18px;
  transition: all 0.2s;
}

.nav-label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.nav-item:hover {
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
}

.nav-item.active {
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

.tool-header .spacer {
  flex: 1;
}

/* 面板清空按钮（tools-ux-review-fixes 2.4） */
.btn-clear {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
}

.btn-clear:hover {
  color: var(--danger, #dc2626);
  border-color: var(--danger, #dc2626);
}

/* SM4 短密钥警告条（tools-ux-review-fixes 2.3） */
.sm4-warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 8px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 400;
  margin-bottom: 12px;
}

/* 时间戳/JWT 单输入行（tools-new-utilities） */
.single-input-row {
  margin-bottom: 14px;
}

.single-input-row :deep(textarea) {
  font-family: ui-monospace, monospace;
  width: 100%;
}

/* 转换结果对照表（时间戳 / exp 行共用） */
.result-grid {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.rg-row {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.rg-row:last-child {
  border-bottom: none;
}

.rg-row.rg-hl {
  background: #f0f9ff;
}

.rg-key {
  width: 110px;
  flex-shrink: 0;
  color: var(--muted);
}

.rg-val {
  font-family: ui-monospace, monospace;
  word-break: break-all;
}

/* JWT 展示块 */
.jwt-block {
  margin-bottom: 14px;
}

.jwt-block .panel-label {
  margin-bottom: 6px;
}

.jwt-pre {
  background: var(--bg, #f5f7fa);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  overflow: auto;
  max-height: 220px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.exp-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
}

.exp-tag.is-expired {
  background: #fee2e2;
  color: #b91c1c;
}

.exp-tag.is-alive {
  background: #dcfce7;
  color: #15803d;
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

<!-- 非 scoped：v-html 内容不受 scoped 影响，diff 行需要 -->
<style>
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
  padding: 0;
  background: var(--bg);
  overflow: hidden;
}
.diff-result-box .dl-wrap {
  max-height: 400px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.7;
  padding: 8px 0;
}
.diff-result-box .dl-wrap .dl-line {
  padding: 0 12px;
  white-space: pre;
}
.diff-result-box .dl-same {
  color: var(--muted);
}
.diff-result-box .dl-same::before {
  content: '  ';
}
.diff-result-box .dl-added {
  color: var(--success);
  background: oklch(55% 0.15 145 / 12%);
}
.diff-result-box .dl-added::before {
  content: '+ ';
  font-weight: 700;
}
.diff-result-box .dl-removed {
  color: var(--danger);
  background: oklch(55% 0.18 28 / 10%);
}
.diff-result-box .dl-removed::before {
  content: '- ';
  font-weight: 700;
}
.diff-result-box .dl-summary {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--surface);
  color: var(--fg);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1;
}
</style>
