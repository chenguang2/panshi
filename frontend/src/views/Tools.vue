<template>
  <div class="tools-page">
    <PageHeader
      title="工具箱"
      description="日常开发调试的本地工具集：编解码、格式化、对比与配置生成，全部在浏览器本地完成，输入不出本机。"
    >
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
    </PageHeader>

    <!-- 工作台：工具栏 + 工作区同卡一体（proposal-c/tools.html 解剖，tools-page-restyle） -->
    <div class="l5-card tb-workbench">
      <aside class="tb-rail">
        <div
          v-for="tool in tools"
          :key="tool.key"
          class="tb-tool"
          :class="{ active: activeTool === tool.key }"
          :title="tool.label"
          @click="activeTool = tool.key"
        >
          <StrokeIcon :name="tool.icon" :size="17" />
          <span class="tb-tlabel">{{ tool.shortLabel }}</span>
        </div>
      </aside>

      <section class="tb-stage">
        <!-- Lua 互转 -->
        <div v-if="activeTool === 'lua'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">Lua 函数 ↔ 配置字符串</span>
              <span class="tb-hint">用于插件 pre_functions 配置与 Lua 函数体的双向转换</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('lua')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">Lua 函数体</div>
              <a-textarea
                v-model:value="luaInput"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="输入完整 Lua 函数定义，例如：function(conf, ctx) ngx.log(ngx.ERR, 'hello') end"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(luaInput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (luaInput = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="handleLuaEncode">转换为字符串 →</button>
              <button class="btn btn-secondary" @click="handleLuaDecode">← 转换为函数</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">配置字符串</div>
              <a-textarea
                v-model:value="luaOutput"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="或在此粘贴配置字符串进行反向转换"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(luaOutput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (luaOutput = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- URL 编解码 -->
        <div v-if="activeTool === 'url'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">URL 编解码</span>
              <span class="tb-hint">encodeURIComponent 语义，适用于 URL 参数转义与还原</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('url')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">原文</div>
              <a-textarea v-model:value="urlInput" :rows="textareaRows" class="tb-ta" placeholder="粘贴原文进行编码" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(urlInput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (urlInput = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="urlOutput = toolsUrl.encode(urlInput)">编码 →</button>
              <button class="btn btn-secondary" @click="urlInput = toolsUrl.decode(urlOutput)">← 解码</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">编码串</div>
              <a-textarea
                v-model:value="urlOutput"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="粘贴编码串进行反向解码"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(urlOutput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (urlOutput = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- JSON 格式化 -->
        <div v-if="activeTool === 'json'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">JSON 格式化</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('json')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">输入</div>
              <a-textarea
                v-model:value="jsonInput"
                :rows="textareaRows"
                class="tb-ta"
                placeholder='输入 JSON 字符串，例如：{"name":"test"}'
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(jsonInput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (jsonInput = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="jsonOutput = toolsJson.format(jsonInput)">格式化 →</button>
              <button class="btn btn-secondary" @click="jsonOutput = toolsJson.minify(jsonInput)">压缩 →</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">结果</div>
              <a-textarea
                v-model:value="jsonOutput"
                :rows="textareaRows"
                class="tb-ta"
                readonly
                placeholder="格式化或压缩结果将显示在此"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(jsonOutput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (jsonOutput = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SM4 加解密 -->
        <div v-if="activeTool === 'sm4'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">SM4 加解密（ECB + PKCS7）</span>
              <span class="tb-hint">用于调试平台 ↔ Edge 通道的加密链路</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('sm4')">清空</button>
          </div>
          <div v-if="sm4KeyWarn" class="tb-warn">
            <StrokeIcon name="warnOutline" :size="14" />
            <span>{{ sm4KeyWarn }}</span>
          </div>
          <div class="tb-keyrow">
            <span class="key-label">密钥：</span>
            <a-input-password v-model:value="sm4Key" placeholder="SM4 密钥（16 字符）" class="tb-keyinp" />
            <button
              class="tb-mini"
              title="恢复为 Edge 通道默认 SM4 密钥（调试平台↔Edge 加密链路用）"
              @click="sm4Key = 'a16bc20453da220f'"
            >
              恢复默认
            </button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">明文</div>
              <a-textarea v-model:value="sm4Plaintext" :rows="textareaRows" class="tb-ta" placeholder="输入明文" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(sm4Plaintext)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (sm4Plaintext = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="sm4Ciphertext = toolsSm4.encrypt(sm4Plaintext, sm4Key)">
                加密 →
              </button>
              <button class="btn btn-secondary" @click="sm4Plaintext = toolsSm4.decrypt(sm4Ciphertext, sm4Key)">
                ← 解密
              </button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">密文（Base64）</div>
              <a-textarea
                v-model:value="sm4Ciphertext"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="输入 Base64 密文"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(sm4Ciphertext)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (sm4Ciphertext = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Base64 编解码 -->
        <div v-if="activeTool === 'base64'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">Base64 编解码</span>
              <span class="tb-hint">UTF-8 安全编码（btoa/unescape 链），适用于文本与密文互转</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('base64')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">原文</div>
              <a-textarea
                v-model:value="base64Input"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="粘贴原文进行编码"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(base64Input)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (base64Input = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="base64Output = toolsBase64.encode(base64Input)">编码 →</button>
              <button class="btn btn-secondary" @click="base64Input = toolsBase64.decode(base64Output)">← 解码</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">编码串</div>
              <a-textarea
                v-model:value="base64Output"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="粘贴编码串进行反向解码"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(base64Output)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (base64Output = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- YAML 格式化 -->
        <div v-if="activeTool === 'yaml'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">YAML 格式化</span>
              <span class="tb-hint">格式化工具有序 key 但会丢弃 YAML 注释</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('yaml')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">输入</div>
              <a-textarea v-model:value="yamlInput" :rows="textareaRows" class="tb-ta" placeholder="输入 YAML 内容" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(yamlInput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (yamlInput = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="yamlOutput = toolsYaml.format(yamlInput)">格式化 →</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">结果</div>
              <a-textarea
                v-model:value="yamlOutput"
                :rows="textareaRows"
                class="tb-ta"
                readonly
                placeholder="格式化结果将显示在此"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(yamlOutput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (yamlOutput = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- JSON 对比 -->
        <div v-if="activeTool === 'diff'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">JSON 数据对比</span>
              <span class="tb-hint">先格式化归一（键序无关）再逐行对比</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('diff')">清空</button>
          </div>
          <div class="tb-dual tb-dual-diff">
            <div class="tb-pane">
              <div class="tb-plabel">JSON A</div>
              <a-textarea
                v-model:value="diffInputA"
                :rows="textareaRows"
                class="tb-ta"
                placeholder='输入 JSON A，如 {"name":"test"}'
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(diffInputA)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (diffInputA = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-secondary" @click="formatBoth">两边格式化</button>
              <button class="btn btn-primary" :disabled="!diffInputA || !diffInputB" @click="handleDiff">对比</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">JSON B</div>
              <a-textarea
                v-model:value="diffInputB"
                :rows="textareaRows"
                class="tb-ta"
                placeholder='输入 JSON B，如 {"name":"test2"}'
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(diffInputB)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (diffInputB = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
          <div v-if="diffError" class="diff-error">{{ diffError }}</div>
          <div v-if="diffResultHtml" class="diff-result-box">
            <div class="tb-difflegend">差异结果（红=删除/旧值，绿=新增/新值）</div>
            <div class="dl-wrap" v-html="diffResultHtml"></div>
          </div>
        </div>

        <!-- 时间戳转换 -->
        <div v-if="activeTool === 'timestamp'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">时间戳转换</span>
              <span class="tb-hint">无时区后缀字符串按 UTC 解析（平台存储约定）；北京时间 = UTC+8</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-ghost" @click="fillNow">当前时间</button>
            <button class="tb-btn-clear" @click="clearTool('timestamp')">清空</button>
          </div>
          <div class="tb-single">
            <a-textarea
              v-model:value="tsInput"
              :rows="2"
              class="tb-ta tb-ta-fixed"
              placeholder="粘贴 epoch（10 位秒 / 13 位毫秒）或日期时间（如 2026-10-30 08:00:00），输入即算"
            />
          </div>
          <div v-if="parsedTime.error" class="diff-error">{{ parsedTime.error }}</div>
          <div v-else-if="parsedTime.epochMs" class="tb-result">
            <div class="tb-rg">
              <span class="rg-k">识别为</span><span class="rg-v">{{ parsedTime.detected }}</span>
            </div>
            <div class="tb-rg rg-hl">
              <span class="rg-k">北京时间</span><span class="rg-v">{{ parsedTime.beijing }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">UTC</span><span class="rg-v">{{ parsedTime.utc }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">epoch 秒</span><span class="rg-v">{{ parsedTime.epochSec }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">epoch 毫秒</span><span class="rg-v">{{ parsedTime.epochMs }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">ISO 8601</span><span class="rg-v">{{ parsedTime.iso }}</span>
            </div>
          </div>
        </div>

        <!-- JWT 解码 -->
        <div v-if="activeTool === 'jwt'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">JWT 解码</span>
              <span class="tb-hint">纯解码查看内容，不验证签名（签名校验需服务端密钥）</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('jwt')">清空</button>
          </div>
          <div class="tb-single">
            <a-textarea
              v-model:value="jwtInput"
              :rows="3"
              class="tb-ta tb-ta-fixed"
              placeholder="粘贴 JWT token（三段 . 分隔），输入即算"
            />
          </div>
          <div v-if="decodedJwt.error" class="diff-error">{{ decodedJwt.error }}</div>
          <template v-else-if="decodedJwt.payload">
            <div class="tb-block">
              <div class="tb-plabel">Header</div>
              <pre class="tb-pre">{{ pretty(decodedJwt.header) }}</pre>
            </div>
            <div class="tb-block">
              <div class="tb-plabel">Payload</div>
              <pre class="tb-pre">{{ pretty(decodedJwt.payload) }}</pre>
            </div>
            <div v-if="expInfo" class="tb-result tb-exprow">
              <div class="tb-rg rg-hl">
                <span class="rg-k">exp（过期时间）</span>
                <span class="rg-v">
                  {{ expInfo.beijing }}
                  <span class="exp-tag" :class="expInfo.expired ? 'is-expired' : 'is-alive'">
                    {{ expInfo.expired ? '已过期' : `剩余 ${expInfo.remainMin} 分钟` }}
                  </span>
                </span>
              </div>
            </div>
            <div class="tool-hint tb-foot-hint">签名段已省略（验签需服务端密钥，解码用途是查看内容）</div>
          </template>
        </div>

        <!-- YAML ↔ JSON 互转 -->
        <div v-if="activeTool === 'convert'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">YAML ↔ JSON 互转</span>
              <span class="tb-hint">edge.env（YAML）与插件配置（JSON）两域配置互看互转</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('convert')">清空</button>
          </div>
          <div class="tb-dual">
            <div class="tb-pane">
              <div class="tb-plabel">YAML</div>
              <a-textarea v-model:value="convertInput" :rows="textareaRows" class="tb-ta" placeholder="在此粘贴 YAML" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(convertInput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (convertInput = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" @click="convertToJson">转 JSON →</button>
              <button class="btn btn-secondary" @click="convertToYaml">← 转 YAML</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">JSON</div>
              <a-textarea
                v-model:value="convertOutput"
                :rows="textareaRows"
                class="tb-ta"
                placeholder="在此粘贴 JSON"
              />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(convertOutput)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (convertOutput = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 文本 Diff -->
        <div v-if="activeTool === 'textdiff'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">文本 Diff</span>
              <span class="tb-hint">逐行对比纯文本（配置文件、清单等），不做键序归一化</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('textdiff')">清空</button>
          </div>
          <div class="tb-dual tb-dual-diff">
            <div class="tb-pane">
              <div class="tb-plabel">文本 A</div>
              <a-textarea v-model:value="textDiffA" :rows="textareaRows" class="tb-ta" placeholder="输入原始文本" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(textDiffA)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (textDiffA = v), $event)">粘贴</button>
              </div>
            </div>
            <div class="tb-mid">
              <button class="btn btn-primary" :disabled="!textDiffA || !textDiffB" @click="handleTextDiff">对比</button>
            </div>
            <div class="tb-pane">
              <div class="tb-plabel">文本 B</div>
              <a-textarea v-model:value="textDiffB" :rows="textareaRows" class="tb-ta" placeholder="输入对比文本" />
              <div class="tb-copyrow">
                <button class="tb-mini" @click="copyToClipboard(textDiffB)">复制</button>
                <button class="tb-mini" @click="pasteFromClipboard((v) => (textDiffB = v), $event)">粘贴</button>
              </div>
            </div>
          </div>
          <div v-if="textDiffError" class="diff-error">{{ textDiffError }}</div>
          <div v-if="textDiffHtml" class="diff-result-box">
            <div class="tb-difflegend">差异结果（红=删除，绿=新增）</div>
            <div class="dl-wrap" v-html="textDiffHtml"></div>
          </div>
        </div>

        <!-- IPv4/CIDR 计算器 -->
        <div v-if="activeTool === 'ipcalc'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">IPv4/CIDR 计算器</span>
              <span class="tb-hint">仅 IPv4；节点白名单、中继网段规划、子网换算</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('ipcalc')">清空</button>
          </div>
          <div class="tb-single">
            <a-textarea
              v-model:value="ipInput"
              :rows="2"
              class="tb-ta tb-ta-fixed"
              placeholder="输入 IPv4 地址或网段（如 192.168.1.10/24），缺省前缀按 /32，输入即算"
            />
          </div>
          <div v-if="ipResult.error" class="diff-error">{{ ipResult.error }}</div>
          <div v-else-if="ipResult.ip" class="tb-result">
            <div class="tb-rg rg-hl">
              <span class="rg-k">IP / 前缀</span
              ><span class="rg-v"
                >{{ ipResult.ip }}/{{ ipResult.prefix
                }}<span v-if="ipResult.isPrivate" class="exp-tag is-alive tb-inline-tag">私网段</span></span
              >
            </div>
            <div class="tb-rg">
              <span class="rg-k">子网掩码</span><span class="rg-v">{{ ipResult.mask }}（{{ ipResult.wildcard }}）</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">网络地址</span><span class="rg-v">{{ ipResult.network }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">广播地址</span><span class="rg-v">{{ ipResult.broadcast }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">可用主机范围</span
              ><span class="rg-v">{{ ipResult.firstHost }} - {{ ipResult.lastHost }}</span>
            </div>
            <div class="tb-rg">
              <span class="rg-k">可用主机数</span
              ><span class="rg-v">{{ ipResult.usableHosts }}（共 {{ ipResult.totalHosts }} 个地址）</span>
            </div>
          </div>
        </div>

        <!-- 哈希计算 -->
        <div v-if="activeTool === 'hash'" class="tb-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">哈希计算</span>
              <span class="tb-hint">文件/备份校验、口令指纹比对；输出小写十六进制</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('hash')">清空</button>
          </div>
          <div class="tb-single">
            <a-textarea
              v-model:value="hashInput"
              :rows="4"
              class="tb-ta tb-ta-fixed"
              placeholder="输入要计算哈希的文本，输入即算"
            />
          </div>
          <div v-if="hashResults" class="tb-result">
            <div v-for="row in hashResults" :key="row.name" class="tb-rg">
              <span class="rg-k">{{ row.name }}</span>
              <span class="rg-v">{{ row.value || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Keepalived 配置生成 -->
        <div v-if="activeTool === 'keepalived'" class="tb-view ka-view">
          <div class="tb-head">
            <div class="tb-headline">
              <span class="tb-title">Keepalived 配置生成</span>
              <span class="tb-hint">多节点 VRRP 高可用（单播 + VIP）全套配置与部署命令，纯前端生成</span>
            </div>
            <span class="t-spacer"></span>
            <button class="tb-btn-help" @click="openHelp"><StrokeIcon name="help" :size="13" />帮助</button>
            <button class="tb-btn-clear" @click="clearTool('keepalived')">清空</button>
          </div>

          <div class="tb-kaform">
            <div class="tb-field tb-field-vip">
              <label>VIP 地址</label>
              <a-input v-model:value="kaVip" placeholder="10.128.216.154" />
            </div>
            <div class="tb-field">
              <label>节点 IP 列表（每行一条：节点IP 网卡名，空格分隔，2–8 个）</label>
              <a-textarea
                v-model:value="kaNodesText"
                :rows="4"
                class="tb-ta tb-ta-fixed tb-nodes"
                placeholder="10.128.216.160 ens7&#10;10.128.216.161 eth1&#10;10.128.216.162 bond0"
              />
            </div>
            <a-checkbox v-model:checked="kaAdvanced">高级参数</a-checkbox>
            <div v-show="kaAdvanced" class="tb-grid3">
              <div class="tb-field">
                <label>VIP 掩码位</label>
                <a-input-number v-model:value="kaMaskBits" :min="8" :max="32" />
              </div>
              <div class="tb-field">
                <label>VRRP 组 ID</label>
                <a-input-number v-model:value="kaVrrpId" :min="1" :max="255" />
              </div>
              <div class="tb-field">
                <label>认证密码（前 8 字符生效）</label>
                <a-input v-model:value="kaAuthPass" placeholder="12345678" />
              </div>
              <div class="tb-field">
                <label>优先级起始</label>
                <a-input-number v-model:value="kaPriorityStart" :min="1" :max="255" />
              </div>
              <div class="tb-field">
                <label>优先级步长</label>
                <a-input-number v-model:value="kaPriorityStep" :min="1" :max="50" />
              </div>
              <div class="tb-field">
                <label>router_id 前缀</label>
                <a-input v-model:value="kaRouterIdPrefix" placeholder="EDGE_DNS_" />
              </div>
              <div class="tb-field">
                <label>健康检查端口</label>
                <a-input-number v-model:value="kaCheckPort" :min="1" :max="65535" />
              </div>
            </div>
          </div>

          <div v-for="e in kaValidation.errors" :key="'e' + e" class="diff-error">{{ e }}</div>
          <div v-for="w in kaValidation.warnings" :key="'w' + w" class="tb-warnline">
            <StrokeIcon name="warnOutline" :size="13" />
            <span>{{ w }}</span>
          </div>

          <template v-if="kaResult">
            <div class="tb-group-title">共用脚本<span class="g-note">所有节点一致，写入 /etc/keepalived/</span></div>
            <div v-for="f in kaSharedFiles" :key="f.key" class="tb-file">
              <div class="tb-file-head">
                <span class="tb-fname">{{ f.filename }} · {{ f.title }}</span>
                <span class="t-spacer"></span>
                <button class="tb-mini" @click="copyToClipboard(f.content)">复制</button>
                <button class="tb-mini" @click="downloadFile(f.filename, f.content)">下载</button>
              </div>
              <pre class="tb-pre tb-file-pre">{{ f.content }}</pre>
            </div>

            <div class="tb-group-title">
              各节点配置（{{ kaNodes.length }} 节点；conf 差异仅五处：router_id / priority / unicast_src_ip /
              unicast_peer / 网卡名）
            </div>
            <a-collapse>
              <a-collapse-panel
                v-for="n in kaNodeGroups"
                :key="n.ip"
                :header="`Edge-${n.index + 1} · ${n.ip}（conf + 防火墙放行）`"
              >
                <div v-for="f in n.files" :key="f.key" class="tb-file">
                  <div class="tb-file-head">
                    <span class="tb-fname">{{ f.filename }}</span>
                    <span class="t-spacer"></span>
                    <button class="tb-mini" @click="copyToClipboard(f.content)">复制</button>
                    <button class="tb-mini" @click="downloadFile(f.filename, f.content)">下载</button>
                  </div>
                  <pre class="tb-pre tb-file-pre">{{ f.content }}</pre>
                </div>
              </a-collapse-panel>
            </a-collapse>

            <div class="tb-group-title">部署手册<span class="g-note">所有节点</span></div>
            <div class="tb-file">
              <div class="tb-file-head">
                <span class="tb-fname">keepalived-deploy-manual.md</span>
                <span class="t-spacer"></span>
                <button class="tb-mini" @click="copyToClipboard(kaResult.handbook)">复制</button>
                <button class="tb-mini" @click="downloadFile('keepalived-deploy-manual.md', kaResult.handbook)">
                  下载
                </button>
              </div>
              <pre class="tb-pre tb-file-pre">{{ kaResult.handbook }}</pre>
            </div>
          </template>
        </div>

        <!-- 帮助抽屉（tools-help-drawer）：文档跟随 activeTool，关闭回到操作现场 -->
        <ToolHelpDrawer
          :open="helpOpen"
          :tool-key="activeTool"
          :tool-label="activeToolLabel"
          @close="helpOpen = false"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
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
import ToolHelpDrawer from '@/components/ToolHelpDrawer.vue'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import type { StrokeIconName } from '@/components/StrokeIcon.vue'
import {
  KEEPALIVED_DEFAULTS,
  generateKeepalivedConfig,
  parseKeepalivedNodesText,
  validateKeepalivedInput,
  type KeepalivedGenInput,
} from '@/utils/tools/keepalived'

interface ToolItem {
  key: string
  label: string
  /** 导航栏短名（132px 栏宽下不折行） */
  shortLabel: string
  /** StrokeIcon 设计线稿图标名（tools-page-restyle：antd 圈形图标退场） */
  icon: StrokeIconName
}

const tools: ToolItem[] = [
  { key: 'lua', label: 'Lua 互转', shortLabel: 'Lua 互转', icon: 'code' },
  { key: 'url', label: 'URL 编解码', shortLabel: 'URL', icon: 'link' },
  { key: 'json', label: 'JSON 格式化', shortLabel: 'JSON', icon: 'braces' },
  { key: 'sm4', label: 'SM4 加解密', shortLabel: 'SM4', icon: 'lock' },
  { key: 'base64', label: 'Base64 编解码', shortLabel: 'Base64', icon: 'blocks' },
  { key: 'yaml', label: 'YAML 格式化', shortLabel: 'YAML', icon: 'fileText' },
  { key: 'diff', label: 'JSON 对比', shortLabel: 'JSON 对比', icon: 'columns' },
  { key: 'timestamp', label: '时间戳转换', shortLabel: '时间戳', icon: 'clock' },
  { key: 'jwt', label: 'JWT 解码', shortLabel: 'JWT', icon: 'key' },
  { key: 'convert', label: 'YAML↔JSON 互转', shortLabel: '互转', icon: 'swap' },
  { key: 'textdiff', label: '文本 Diff', shortLabel: '文本对比', icon: 'fileDiff' },
  { key: 'ipcalc', label: 'IPv4/CIDR 计算器', shortLabel: 'IP/CIDR', icon: 'globe' },
  { key: 'hash', label: '哈希计算', shortLabel: '哈希', icon: 'shieldCheck' },
  { key: 'keepalived', label: 'Keepalived 配置', shortLabel: 'Keepalived', icon: 'server' },
]

// 页头统计徽标（tools-page-restyle）：首枚 = 工具清单长度（组件保证首项 accent），
// 次枚 = 「全部工具纯本地转换、零网络请求」的静态事实，非运行时统计
const headerStatItems = computed(() => [
  { value: tools.length, label: '个工具' },
  { value: 0, label: '外发请求' },
])

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

// ── 帮助抽屉（tools-help-drawer）：文档跟随 activeTool，开关独立于工具切换 ──
const helpOpen = ref(false)
const activeToolLabel = computed(() => tools.find((t) => t.key === activeTool.value)?.label ?? '工具')

function openHelp(): void {
  helpOpen.value = true
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
    keepalived: () => {
      kaVip.value = ''
      kaNodesText.value = ''
      kaAdvanced.value = false
      kaMaskBits.value = KEEPALIVED_DEFAULTS.maskBits
      kaVrrpId.value = KEEPALIVED_DEFAULTS.vrrpId
      kaAuthPass.value = KEEPALIVED_DEFAULTS.authPass
      kaPriorityStart.value = KEEPALIVED_DEFAULTS.priorityStart
      kaPriorityStep.value = KEEPALIVED_DEFAULTS.priorityStep
      kaRouterIdPrefix.value = KEEPALIVED_DEFAULTS.routerIdPrefix
      kaCheckPort.value = KEEPALIVED_DEFAULTS.checkPort
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

// ── Keepalived 配置生成（tools-keepalived-generator）：纯前端模板渲染，样例逐字回归见 utils 单测 ──
const kaVip = ref('')
const kaNodesText = ref('')
const kaAdvanced = ref(false)
const kaMaskBits = ref<number | null>(KEEPALIVED_DEFAULTS.maskBits)
const kaVrrpId = ref<number | null>(KEEPALIVED_DEFAULTS.vrrpId)
const kaAuthPass = ref(KEEPALIVED_DEFAULTS.authPass)
const kaPriorityStart = ref<number | null>(KEEPALIVED_DEFAULTS.priorityStart)
const kaPriorityStep = ref<number | null>(KEEPALIVED_DEFAULTS.priorityStep)
const kaRouterIdPrefix = ref(KEEPALIVED_DEFAULTS.routerIdPrefix)
const kaCheckPort = ref<number | null>(KEEPALIVED_DEFAULTS.checkPort)

const kaNodes = computed(() => kaParsedNodes.value.nodes)

// 行解析：每行「节点IP 网卡名」，行级红字（缺网卡名/多余列/非法字符）带行号
const kaParsedNodes = computed(() => parseKeepalivedNodesText(kaNodesText.value))

const kaInput = computed<KeepalivedGenInput>(() => ({
  vip: kaVip.value.trim(),
  nodes: kaParsedNodes.value.nodes,
  maskBits: kaMaskBits.value ?? KEEPALIVED_DEFAULTS.maskBits,
  vrrpId: kaVrrpId.value ?? KEEPALIVED_DEFAULTS.vrrpId,
  authPass: kaAuthPass.value,
  priorityStart: kaPriorityStart.value ?? KEEPALIVED_DEFAULTS.priorityStart,
  priorityStep: kaPriorityStep.value ?? KEEPALIVED_DEFAULTS.priorityStep,
  routerIdPrefix: kaRouterIdPrefix.value,
  checkPort: kaCheckPort.value ?? KEEPALIVED_DEFAULTS.checkPort,
}))

const kaValidation = computed(() => {
  const v = validateKeepalivedInput(kaInput.value)
  return { errors: [...kaParsedNodes.value.errors, ...v.errors], warnings: v.warnings }
})

const kaResult = computed(() => {
  if (kaValidation.value.errors.length > 0) return null
  if (!kaInput.value.vip || kaInput.value.nodes.length === 0) return null
  return generateKeepalivedConfig(kaInput.value)
})

const kaSharedFiles = computed(() => kaResult.value?.files.filter((f) => f.group === 'shared') ?? [])
const kaNodeGroups = computed(() => {
  const r = kaResult.value
  if (!r) return []
  return kaInput.value.nodes.map((n, index) => ({
    ip: n.ip,
    index,
    files: r.files.filter((f) => f.group === `node-${n.ip}`),
  }))
})

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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

// ── YAML ↔ JSON 互转（tools-two-way-panels）：两框对等，读哪侧由按钮方向决定 ──
const convertInput = ref('')
const convertOutput = ref('')

function convertToJson(): void {
  const r = yamlToJson(convertInput.value)
  convertOutput.value = r.error ?? r.text ?? ''
}

function convertToYaml(): void {
  const r = jsonToYaml(convertOutput.value)
  convertInput.value = r.error ?? r.text ?? ''
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
/* ===== 工具箱工作台（tools-page-restyle）=====
   视觉基准 docs/ui/Live-Artifact-5/proposal-c/tools.html，类名与设计页同名（tb-*）便于逐元素量测；
   守卫 mockupParity.source.test.ts tools 段。 */
.tools-page {
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 工作台外壳：工具栏 + 工作区同卡一体（单层描边，.l5-card 为全站卡片壳） */
.tb-workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}

/* 工具栏：132px 图标+文字（tools-ux-review-fixes 2.1 的 IA 不变） */
.tb-rail {
  width: 132px;
  flex-shrink: 0;
  background: var(--bg);
  border-right: 1px solid var(--border);
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
}

.tb-tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 4px 6px;
  border-radius: var(--radius-md);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.12s;
  user-select: none;
  flex-shrink: 0;
}

.tb-tool .tb-tlabel {
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.tb-tool:hover {
  background: oklch(56% 0.16 210 / 8%);
  color: var(--accent);
}

.tb-tool.active {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

/* 工作区：面板本体（外壳卡片的白色区域，不嵌第二层卡片） */
.tb-stage {
  flex: 1;
  min-width: 0;
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.tb-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 长内容工具（keepalived）：随内容自然增高，滚动交给 .tb-stage */
.tb-view.ka-view {
  flex: 0 0 auto;
}

/* 面板头：标题 + 用途提示 + 帮助 / 清空 */
.tb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
  flex-shrink: 0;
}

.tb-headline {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.tb-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
  white-space: nowrap;
}

.tb-hint {
  font-size: 12px;
  color: var(--muted);
  min-width: 0;
}

.tb-head .t-spacer {
  flex: 1 1 12px;
}

/* 三按钮语义分离：帮助=accent 弱底 / ghost=中性填充动作（当前时间等）/ clear=清空（危险色 hover） */
.tb-btn-help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.tb-btn-help:hover {
  background: oklch(56% 0.16 210 / 18%);
}

.tb-btn-ghost {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.tb-btn-ghost:hover {
  color: var(--accent);
  border-color: oklch(56% 0.16 210 / 45%);
  background: var(--accent-bg);
}

.tb-btn-clear {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.tb-btn-clear:hover {
  color: var(--danger);
  border-color: oklch(55% 0.18 28 / 45%);
  background: oklch(55% 0.18 28 / 8%);
}

/* 双栏对转 */
.tb-dual {
  display: flex;
  gap: 14px;
  align-items: stretch;
}

/* 双栏撑满工作区（文本区等高拉伸，行为同改造前） */
.tb-view .tb-dual {
  flex: 1;
  min-height: 0;
}

.tb-dual-diff {
  flex: 1 1 auto;
}

.tb-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tb-plabel {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 6px;
  flex-shrink: 0;
}

/* 文本区：机器文本一律等宽（值用 mono 约定）；两级选择器压过 antd .ant-input 同权重默认 */
.tb-ta,
.tb-view .tb-ta,
.tb-pane :deep(textarea),
.tb-single :deep(textarea) {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--fg);
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.tb-view .tb-ta:focus,
.tb-pane :deep(textarea:focus),
.tb-single :deep(textarea:focus) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

/* 输入即算类单输入：行高由 rows 决定，不参与双栏拉伸 */
.tb-single {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.tb-view .tb-pane :deep(textarea) {
  flex: 1;
  min-height: 100px;
}

/* 复制/粘贴 mini 按钮 */
.tb-copyrow {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-shrink: 0;
}

.tb-mini {
  height: 24px;
  padding: 0 10px;
  font-size: 11.5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.tb-mini:hover {
  color: var(--accent);
  border-color: oklch(56% 0.16 210 / 45%);
  background: var(--accent-bg);
}

/* 中部动作按钮列 */
.tb-mid {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding-top: 26px;
}

/* 输入即算结果格：容器化逐行分隔，主行 accent 强调 */
.tb-result {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  flex-shrink: 0;
}

.tb-rg {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}
.tb-rg:last-child {
  border-bottom: none;
}

.rg-k {
  flex: 0 0 96px;
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
}

.rg-v {
  font-family: var(--font-mono);
  color: var(--fg);
  word-break: break-all;
}

.tb-rg.rg-hl {
  background: oklch(56% 0.16 210 / 6%);
}
.tb-rg.rg-hl .rg-k {
  color: var(--accent);
  font-weight: 600;
}

.tb-exprow {
  margin-top: 12px;
}

/* JWT 解码块 */
.tb-block {
  margin-bottom: 10px;
  flex-shrink: 0;
}

.tb-pre {
  margin: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
  color: var(--fg);
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
}

.tb-file .tb-pre.tb-file-pre {
  border: none;
  border-radius: 0;
  max-height: 420px;
}

.tb-foot-hint {
  margin-top: 10px;
}

/* 徽标（exp 剩余/已过期、私网段）：token 配色 */
.exp-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.exp-tag.is-expired {
  background: oklch(55% 0.18 28 / 12%);
  color: var(--danger);
}

.exp-tag.is-alive {
  background: oklch(55% 0.15 145 / 12%);
  color: var(--success);
}

/* SM4：黄色警示条（非阻断）+ 密钥行 */
.tb-warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: var(--radius-md);
  font-size: 12.5px;
  line-height: 1.55;
  background: oklch(65% 0.15 85 / 8%);
  border: 1px solid oklch(65% 0.15 85 / 20%);
  color: oklch(57% 0.13 70);
  flex-shrink: 0;
}
.tb-warn :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.tb-keyrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.key-label {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.tb-keyrow .tb-keyinp {
  width: 260px;
}

/* 差异结果图例行（摘要行由 v-html 的 .dl-summary 承担，见文末全局块） */
.tb-difflegend {
  font-size: 12px;
  color: var(--muted);
  padding: 12px 12px 0;
}

/* Keepalived 生成器表单 */
.tb-kaform {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.tb-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.tb-field > label {
  font-size: 11.5px;
  color: var(--muted);
}

.tb-field-vip :deep(.ant-input) {
  width: 280px;
}

.tb-nodes {
  height: 84px;
  min-height: 84px;
}

.tb-grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 14px;
}

.tb-grid3 :deep(.ant-input-number) {
  width: 100%;
}

.tb-warnline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12.5px;
  color: oklch(57% 0.13 70);
}
.tb-warnline :deep(svg) {
  flex-shrink: 0;
}

/* 生成物分组标题 + 文件卡片 */
.tb-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--fg);
  margin: 16px 0 8px;
  flex-shrink: 0;
}

.tb-group-title .g-note {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}

.tb-file {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 10px;
  background: var(--surface);
}

.tb-file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.tb-fname {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-file-head .t-spacer {
  flex: 1;
}

/* 折叠（各节点配置）：antd 行为保留，仅对齐设计形态 */
.tb-view :deep(.ant-collapse) {
  background: transparent;
  border: none;
}

.tb-view :deep(.ant-collapse-item) {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  margin-bottom: 8px;
  overflow: hidden;
}

.tb-view :deep(.ant-collapse-header) {
  padding: 8px 10px;
  font-size: 12.5px;
  color: var(--fg);
}

.tb-view :deep(.ant-collapse-content) {
  background: var(--surface);
  border: none;
}

.tb-view :deep(.ant-collapse-content-box) {
  padding: 10px;
}

/* JWT 脚注等次要提示 */
.tool-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
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
