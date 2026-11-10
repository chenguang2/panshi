<template>
  <div class="relay-gateways">
    <PageHeader
      title="中继区域管理"
      description="维护各局中继网关注册信息：配置网关地址与 SSH 跳板后，该局节点的管理与数据通道将经由网关中转；未配置区域的集群按直连执行。"
    >
      <template #actions>
        <button class="btn btn-secondary" :disabled="checkingAll || streamBusy" @click="handleCheckAll">
          {{ checkingAll ? '体检中…' : '全量体检' }}
        </button>
        <button class="btn btn-primary" @click="openDraftCard(true)">+ 新建区域</button>
      </template>
    </PageHeader>

    <!-- 结论式说明卡（relay-gateways-ux-redesign：证书管理 cert-banner 范式，样式对齐示例页） -->
    <div class="relay-banner">
      <span class="banner-icon">i</span>
      <div class="banner-text">
        <b>哪些局需要建中继区域？—— 局内网络与平台不互通时</b>
        <p>
          中继区域 = 一台「跳板网关机」的登记信息。建好并挂接到集群后，该集群的发布/节点任务经它两条腿进局：
          <b>HTTP 腿</b>（管理请求走网关机 8443 反向代理）与 <b>SSH 腿</b>（安装/初始化类任务先跳到网关机再进局内）。
          局内网络本就互通的，不用建——不建或禁用都按直连执行。
        </p>
        <div class="banner-steps">
          <span class="bstep"><b>①</b>登记区域<i>新建，填地址与账号</i></span>
          <span class="barrow">→</span>
          <span class="bstep"><b>②</b>初始化网关<i>首次装机，写入 8443 监听</i></span>
          <span class="barrow">→</span>
          <span class="bstep"><b>③</b>下发配置<i>推送节点白名单</i></span>
        </div>
      </div>
    </div>

    <!-- 动作对照（独立卡，默认展开：学习内容是本页核心价值之一；示例页形态） -->
    <details class="install-guide relay-guide" open>
      <summary>「初始化网关 / 下发配置 / 配置跳板转发」，何时用哪个？（点击可收起）</summary>
      <div class="guide-body">
        <div class="guide-col">
          <h4>🚀 初始化网关</h4>
          <p class="when">何时用：首次装机、网关机重装 OpenResty 后</p>
          <ul>
            <li>写入 <b>8443 监听 server 块</b> + 当前白名单</li>
            <li>校验后 reload，<b>幂等可重复执行</b></li>
            <li>要求已填 OpenResty 前缀</li>
          </ul>
        </div>
        <div class="guide-col">
          <h4>📦 下发配置</h4>
          <p class="when">何时用：集群挂接、节点增删、节点启停之后</p>
          <ul>
            <li>只推<b>节点白名单</b>（全量替换），不动 8443 监听</li>
            <li><b>幂等</b>；空名单有危险确认</li>
            <li>不执行会被网关 403 拦截</li>
          </ul>
        </div>
        <div class="guide-col">
          <h4>🔑 配置跳板转发</h4>
          <p class="when">何时用：跳板 SSH 部署且网关 sshd 默认禁转发时</p>
          <ul>
            <li>root 写 sshd drop-in 放行 <b>PermitOpen</b></li>
            <li><b>一次即可</b>；格式不兼容自动降级</li>
            <li>root 密码仅本次使用，不保存</li>
          </ul>
        </div>
        <div class="guide-symptom">
          <h5>常见症状 → 建议动作</h5>
          <table>
            <tbody>
              <tr>
                <td>HTTP 腿不可达</td>
                <td>先执行 <b>「更多 ▾ → 初始化网关」</b></td>
              </tr>
              <tr>
                <td>SSH 腿报 administratively prohibited</td>
                <td>执行 <b>「配置跳板转发」</b> 放行</td>
              </tr>
              <tr>
                <td>状态列出现「清单缺组」</td>
                <td>重新<b>保存一次该区域</b>（补齐 SSH 用户）即可重建清单组</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>

    <!-- 视图切换工具行（relay-region-topology-view D1：两视图共用页头/说明卡/动作对照） -->
    <div class="viewbar">
      <div class="view-toggle">
        <button :class="{ on: viewMode === 'topo' }" @click="switchView('topo')">拓扑视图</button>
        <button :class="{ on: viewMode === 'table' }" @click="switchView('table')">表格视图</button>
      </div>
    </div>

    <!-- 表格视图（既有内容卡逐字不动，仅包进表格分支） -->
    <div v-show="viewMode === 'table'" class="table-view-wrap">
      <div class="card">
        <div class="card-header">
          <h3>区域列表</h3>
        </div>
        <div class="card-body table-body">
          <a-table
            :columns="columns"
            :data-source="regions"
            :loading="loading"
            row-key="id"
            :pagination="false"
            class="region-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'region'">
                <div class="region-cell">
                  <b>{{ record.name }}</b>
                  <a-tag color="blue" class="mono">{{ record.code }}</a-tag>
                </div>
              </template>
              <template v-else-if="column.key === 'legs'">
                <div v-if="record.http_base_url || record.ssh_jump" class="legs-cell">
                  <span class="leg-line"
                    ><span class="leg-label">HTTP</span
                    ><span class="mono">{{ record.http_base_url || '—' }}</span></span
                  >
                  <span class="leg-line"
                    ><span class="leg-label">SSH</span><span class="mono">{{ record.ssh_jump || '—' }}</span></span
                  >
                </div>
                <template v-else>
                  <a-tag color="info">直连 · 无网关机</a-tag>
                  <div class="direct-note">两条腿均为空</div>
                </template>
              </template>
              <template v-else-if="column.key === 'status'">
                <div class="status-cell">
                  <div>
                    <span :class="record.status === 'enabled' ? 'badge badge-success' : 'badge badge-neutral'">
                      {{ record.status === 'enabled' ? '启用' : '禁用（直连回退）' }}
                    </span>
                    <!-- 清单漂移：区域已注册但 ansible inventory/gateways 缺该局主机组（init/push 前置会拦并给补齐片段） -->
                    <a-tag
                      v-if="record.inventory_group_missing"
                      color="warning"
                      title="ansible 清单 inventory/gateways 缺该局主机组，初始化/下发会被前置拦截"
                      >清单缺组</a-tag
                    >
                  </div>
                </div>
              </template>
              <template v-else-if="column.key === 'health'">
                <div class="health-cell">
                  <span class="health-state" :class="healthCls(record)" :title="healthDetail(record)">{{
                    healthText(record)
                  }}</span>
                  <span v-if="healthState[record.id]" class="health-time mono">{{ healthTime(record) }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'updated_at'">
                <span>{{ formatDateTime(record.updated_at) }}</span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="table-actions">
                  <button
                    class="btn btn-secondary btn-sm"
                    :disabled="rowBusy(record) || testing"
                    title="探测该区域两条腿，结果更新健康列；直连区域测直连可达性"
                    @click="handleTest(record)"
                  >
                    {{ testingId === record.id ? '测试中…' : '测试' }}
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="streamBusy"
                    title="把该局节点白名单推送到网关机；集群挂接、节点增删或启停后需要执行"
                    @click="handlePush(record)"
                  >
                    {{ activeId === record.id && activeKind === 'push' ? '下发中…' : '下发配置' }}
                  </button>
                  <a-dropdown :trigger="['click']">
                    <button class="btn btn-secondary btn-sm" :disabled="rowBusy(record)">更多 ▾</button>
                    <template #overlay>
                      <a-menu>
                        <a-menu-item key="edit" :disabled="rowBusy(record)" @click="openEdit(record)">
                          <div class="menu-item-stack">
                            <span>编辑</span>
                            <small>修改地址、账号与状态</small>
                          </div>
                        </a-menu-item>
                        <a-menu-item key="init" :disabled="streamBusy" @click="handleInit(record)">
                          <div class="menu-item-stack">
                            <span>{{
                              activeId === record.id && activeKind === 'init' ? '初始化中…' : '初始化网关'
                            }}</span>
                            <small>首次装机必做：写入 8443 监听（幂等可重复）</small>
                          </div>
                        </a-menu-item>
                        <a-menu-item key="sshd" :disabled="streamBusy" @click="openSshdSetup(record)">
                          <div class="menu-item-stack">
                            <span>{{
                              activeId === record.id && activeKind === 'sshd' ? '配置中…' : '配置跳板转发'
                            }}</span>
                            <small>放行网关 sshd 转发（需 root，一次即可）</small>
                          </div>
                        </a-menu-item>
                        <a-menu-item key="preview" :disabled="rowBusy(record)" @click="openConfigPreview(record)">
                          <div class="menu-item-stack">
                            <span>查看配置</span>
                            <small>预览将写入网关机的文件内容</small>
                          </div>
                        </a-menu-item>
                        <a-menu-item key="cred" :disabled="rowBusy(record)" @click="openCredential(record)">
                          <div class="menu-item-stack">
                            <span>查看凭据</span>
                            <small>查看网关机 SSH 口令（记录审计）</small>
                          </div>
                        </a-menu-item>
                        <a-menu-item key="toggle" :disabled="rowBusy(record)" @click="handleToggle(record)">
                          <div class="menu-item-stack">
                            <span>{{ record.status === 'enabled' ? '禁用' : '启用' }}</span>
                            <small>停止/恢复经网关中转，回退直连</small>
                          </div>
                        </a-menu-item>
                        <a-menu-divider />
                        <a-menu-item
                          key="delete"
                          danger
                          :disabled="rowBusy(record) || (record.attached_cluster_count || 0) > 0"
                          @click="handleDelete(record)"
                        >
                          <div class="menu-item-stack">
                            <span>删除</span>
                            <small v-if="(record.attached_cluster_count || 0) > 0">
                              已被 {{ record.attached_cluster_count }} 个集群挂接，先解挂再删除
                            </small>
                            <small v-else>未被集群挂接时可删除</small>
                          </div>
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
              </template>
            </template>
          </a-table>
          <div v-if="!loading && regions.length === 0" class="empty-hint">
            暂无区域。未配置任何区域时，全部集群按现状直连执行。点击右上角「新建区域」开始；首次装机流程：新建区域 →
            初始化网关 → 集群挂接区域 → 下发配置。
          </div>
        </div>
      </div>
    </div>

    <!-- 拓扑视图（批次三：卡上就地 popover 编辑 + 图内新建草稿卡） -->
    <div v-show="viewMode === 'topo'" class="topo-view">
      <RelayTopologyCard
        v-for="row in regions"
        :key="row.id"
        :gateway="row"
        :topo="topoByCode[row.code] || null"
        :health="healthState[row.id] || null"
        @test="handleTest(row)"
        @push="handlePush(row)"
        @sshd="openSshdSetup(row)"
        @init="(el) => openInitConfirm(row, el)"
        @menu-action="(item) => handleCardMenuAction(row, item)"
        @node-click="(node, cluster) => openNodeDetailModal(row, node, cluster)"
        @cluster-click="(cluster, el) => openClusterPopover(cluster, el)"
        @attach-click="(el) => openAttachPopover(row, el)"
        @leg-click="(kind, el) => openLegPopover(row, kind, el)"
        @name-click="(el) => openNamePopover(row, el)"
        @badge-click="(el) => openStatusPopover(row, el)"
        @node-box-click="(el) => openNodePopover(row, el, {}, true)"
      />
      <!-- 悬空区域码提示卡：集群挂了 region_code 但无注册行（防静默丢失） -->
      <div v-for="code in topology?.unregistered_bound_codes ?? []" :key="'orphan-' + code" class="orphan-card">
        <span class="tag warn">悬空挂接</span>
        <span>
          区域码 <span class="code-tag mono">{{ code }}</span> 已被
          {{ orphanClusterCount(code) }} 个集群挂接，但区域表中无注册记录 —— 该局实际按直连执行。请核对集群所属区域，或
        </span>
        <button class="btn btn-secondary btn-sm" @click="openCreate">注册该区域</button>
      </div>
      <!-- 新建区域草稿卡（批次三 3.7）：虚线卡原地展开，Esc/取消收起；开合为视图级 ref，视图切换往返保留 -->
      <div v-show="draftOpen" class="draft-card">
        <div class="d-head">
          <b>新建区域 · 必填 2 项</b>
          <span class="d-hint">SSH 账号在登记 SSH 腿时顺带收集；口令 / 高级参数后续在「更多 ▸ 编辑」补录</span>
        </div>
        <div class="draft-grid two">
          <div class="pf" :class="{ invalid: !!draftErrors.code }">
            <label>区域码 code *</label>
            <input
              type="text"
              v-model="draftForm.code"
              placeholder="jinan2"
              maxlength="32"
              @input="draftErrors.code = ''"
              @keydown.esc.stop="closeDraftCard"
              @keydown.enter.prevent="submitDraft"
            />
            <div class="ferr">{{ draftErrors.code }}</div>
          </div>
          <div class="pf" :class="{ invalid: !!draftErrors.name }">
            <label>区域名称 *</label>
            <input
              type="text"
              class="ftext"
              v-model="draftForm.name"
              placeholder="济南二局"
              maxlength="100"
              @input="draftErrors.name = ''"
              @keydown.esc.stop="closeDraftCard"
              @keydown.enter.prevent="submitDraft"
            />
            <div class="ferr">{{ draftErrors.name }}</div>
          </div>
        </div>
        <div v-if="draftServerError" class="d-error">{{ draftServerError }}</div>
        <div class="d-actions">
          <button class="btn btn-secondary btn-sm" @click="closeDraftCard">取消</button>
          <button class="btn btn-primary btn-sm" :disabled="draftSubmitting" @click="submitDraft">
            {{ draftSubmitting ? '创建中…' : '创建区域' }}
          </button>
        </div>
        <div class="d-note">
          <b>创建后</b>：原地生成本局区域卡（初始直连形态）→ 点灰色两腿 chip 登记两腿（SSH 腿登记时顺带填 SSH 账号）→
          初始化网关 → 挂接集群 → 下发配置，全程在本图完成。区域码是集群挂接的身份标识，创建后不可就地修改。
        </div>
      </div>
      <!-- 新建区域虚线卡（草稿卡展开期间隐藏，照 mockup） -->
      <div v-show="!draftOpen" class="create-card" @click="openDraftCard(false)">
        <b>+ 新建区域</b>
        <div class="steps">登记区域 → 登记两腿 → 初始化网关 → 集群挂接 → 下发配置（全程在本图完成，不进弹窗）</div>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗（视图级内联弹窗，约定 #25） -->
    <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ modal.editing ? '编辑区域' : '新建区域' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-section">
            <div class="form-section-title"><i class="sec-no">1</i>基础身份</div>
            <div class="form-section-desc">区域码是集群挂接的钥匙；展示名给人看。</div>
            <div class="form-grid">
              <div class="form-group label-top">
                <label class="form-label">区域码 <span class="required">*</span></label>
                <input
                  type="text"
                  class="form-input mono-input"
                  :class="{ 'has-error': formErrors.code }"
                  v-model="form.code"
                  :disabled="modal.editing"
                  placeholder="小写字母开头，如 luju"
                />
                <span v-if="formErrors.code" class="form-error">{{ formErrors.code }}</span>
                <span v-else class="form-hint">
                  {{
                    modal.editing
                      ? '🔒 创建后不可修改'
                      : '创建后不可修改；集群靠它挂接本区域，同时用作网关清单分组名（gateways_区域码）'
                  }}
                </span>
              </div>
              <div class="form-group label-top">
                <label class="form-label">展示名 <span class="required">*</span></label>
                <input
                  type="text"
                  class="form-input"
                  :class="{ 'has-error': formErrors.name }"
                  v-model="form.name"
                  placeholder="如：济南局"
                />
                <span v-if="formErrors.name" class="form-error">{{ formErrors.name }}</span>
                <span v-else class="form-hint">列表、弹窗与执行日志都显示它，可随时改。</span>
              </div>
              <div class="form-group label-top span-2">
                <label class="form-label">状态</label>
                <select class="form-input" v-model="form.status">
                  <option value="enabled">启用</option>
                  <option value="disabled">禁用（该区域回退直连）</option>
                </select>
                <span class="form-hint">禁用只是「改走直连」：网关机上的配置原样保留，随时可再启用。</span>
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title"><i class="sec-no">2</i>网关两腿连接</div>
            <div class="form-section-desc">
              平台到该局的两条通道。<b>两腿均留空会成为「直连区域」</b>——仅作过渡（如网关地址未定），
              一般应填写网关机地址；局内本就互通的局无需建中继区域。
            </div>
            <div class="form-grid">
              <div class="form-group label-top">
                <label class="form-label">网关 HTTP 腿 <span class="optional">选填</span></label>
                <input
                  type="text"
                  class="form-input mono-input"
                  :class="{ 'has-error': formErrors.http_base_url }"
                  v-model="form.http_base_url"
                  placeholder="如 https://10.10.1.1:8443"
                />
                <span v-if="formErrors.http_base_url" class="form-error">{{ formErrors.http_base_url }}</span>
                <span v-else class="form-hint">发布、回滚等管理请求经它进入该局（网关机 8443 反向代理）。</span>
              </div>
              <div class="form-group label-top">
                <label class="form-label">SSH 跳板 <span class="optional">选填</span></label>
                <input
                  type="text"
                  class="form-input mono-input"
                  :class="{ 'has-error': formErrors.ssh_jump }"
                  v-model="form.ssh_jump"
                  placeholder="如 tunnel@10.10.1.1:22"
                />
                <span v-if="formErrors.ssh_jump" class="form-error">{{ formErrors.ssh_jump }}</span>
                <span v-else class="form-hint"
                  >安装、初始化等 SSH
                  任务先跳到这台网关机再进局内；仅涉及网关机一台，这是通道地址，登录账号在下方「网关机 SSH
                  凭据」填写（可与跳板账号不同）。</span
                >
              </div>
              <div class="form-group label-top span-2">
                <label class="form-label">OpenResty 前缀 <span class="optional">选填</span></label>
                <input
                  type="text"
                  class="form-input mono-input"
                  :class="{ 'has-error': formErrors.openresty_prefix }"
                  v-model="form.openresty_prefix"
                  placeholder="如 /work/jboss/tunnel/openresty-1.21.4.1/nginx"
                />
                <span v-if="formErrors.openresty_prefix" class="form-error">{{ formErrors.openresty_prefix }}</span>
                <span v-else class="form-hint"
                  >网关机上 nginx 的安装目录（含
                  conf/sbin/logs）；只有要用「初始化网关」时必填，可以先建区域后补。</span
                >
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title"><i class="sec-no">3</i>网关机 SSH 凭据</div>
            <div class="form-section-desc">
              仅用于登录<b>网关机这一台机器</b>（写入网关清单），与上方「SSH
              跳板」分工：跳板是进局的通道，这里是登录网关机的账号。 局内<b>各业务节点</b>的账号/口令/端口在【Ansible
              主机清单】逐台各自配置，与本组无关。
            </div>
            <div class="form-grid">
              <div class="form-group label-top span-2">
                <label class="form-label">SSH 用户 <span class="required">*</span></label>
                <input
                  type="text"
                  class="form-input"
                  :class="{ 'has-error': formErrors.ssh_user }"
                  v-model="form.ssh_user"
                  placeholder="网关机上的账号，如 jboss / tunnel"
                />
                <span v-if="formErrors.ssh_user" class="form-error">{{ formErrors.ssh_user }}</span>
                <span v-else class="form-hint"
                  >平台用这个账号登录网关机执行配置（区别于上方只作通道的跳板账号），会写入网关清单；节点各自的账号在【Ansible
                  主机清单】配置。</span
                >
              </div>
              <div class="form-group label-top">
                <label class="form-label">SSH 口令 <span class="optional">选填</span></label>
                <input
                  type="password"
                  class="form-input"
                  v-model="form.ssh_password"
                  :placeholder="modal.editing ? '已从服务端加载（加载动作已记录审计）' : '留空 = 用密钥登录'"
                  autocomplete="new-password"
                />
                <span class="form-hint">口令不出现在列表里；编辑时自动按需加载回填，查看会记录审计。</span>
              </div>
              <div class="form-group label-top">
                <label class="form-label">SSH 端口 <span class="optional">默认 22</span></label>
                <input type="number" min="1" max="65535" class="form-input" v-model.number="form.ssh_port" />
                <span class="form-hint">网关机的 SSH 端口，改过才需要填。</span>
              </div>
            </div>
          </div>

          <details class="advanced-section">
            <summary>高级参数 <span class="adv-tip">（一般不用改）</span></summary>
            <div class="adv-body">
              <div class="form-grid">
                <div class="form-group label-top span-2">
                  <label class="form-label">Python 解释器 <span class="optional">选填</span></label>
                  <input
                    type="text"
                    class="form-input mono-input"
                    v-model="form.ansible_python_interpreter"
                    placeholder="如 /work/jboss/anaconda3/bin/python3"
                  />
                  <span class="form-hint">仅当网关机系统默认 Python 低于 3.8（老机器常见）时填写。</span>
                </div>
                <div class="form-group label-top span-2">
                  <label class="form-label">SSH 公共参数 <span class="optional">选填</span></label>
                  <input
                    type="text"
                    class="form-input mono-input"
                    v-model="form.ssh_common_args"
                    placeholder="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
                  />
                  <span class="form-hint">追加给每条 SSH 连接的参数；默认已跳过指纹确认，一般无需修改。</span>
                </div>
              </div>
            </div>
          </details>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 体检结果弹窗（单区域 / 全量共用，按区域分组；分段逐条 + 节点明细 + 可复制） -->
    <div v-if="resultModal.open" class="modal-overlay" @click.self="closeResultModal">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ resultModal.title }}</h2>
          <button class="modal-close" @click="closeResultModal">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="resultModal.loading" class="config-hint">探测中…（探测为真实网络 IO，关闭弹窗不会中断）</div>
          <template v-else>
            <div v-for="r in resultModal.results" :key="r.region" class="health-result-group">
              <div class="health-result-head">
                <span class="health-result-name">{{ regionDisplayName(r.region) }}</span>
                <span :class="r.ok ? 'badge badge-success' : 'badge badge-danger'">
                  {{ r.ok ? '✓ 可达' : '✗ 异常' }}
                </span>
              </div>
              <ul class="health-result-segs">
                <li v-for="(s, i) in r.segments" :key="i" :class="s.ok ? 'seg-ok' : 'seg-fail'">
                  <div class="seg-main">
                    <span class="seg-name">{{ s.name }}</span>
                    <span class="seg-status">{{ s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}` }}</span>
                    <span v-if="s.elapsed_ms != null" class="seg-elapsed mono">{{ s.elapsed_ms }}ms</span>
                  </div>
                  <ul v-if="(s.nodes || []).some((n) => n.note)" class="seg-notes">
                    <li v-for="n in (s.nodes || []).filter((x) => x.note)" :key="n.node">
                      └ {{ n.node }}：{{ n.note }}
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="resultModal.loading" @click="copyResult">复制结果</button>
          <button class="btn btn-secondary" @click="closeResultModal">关闭</button>
        </div>
      </div>
    </div>

    <!-- 配置预览（只读）：展示将写入网关机的文件内容，可复制；ansible 不可用时据此手工配置 -->
    <!-- 查看凭据弹窗（口令单查入口；后端已记录 view_credential 审计） -->
    <div v-if="credModal.open" class="modal-overlay" @click.self="credModal.open = false">
      <div class="modal cred-modal">
        <div class="modal-header">
          <h2>查看凭据 — {{ credModal.regionName }}</h2>
          <button class="modal-close" @click="credModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="credModal.loading" class="cred-loading">加载中…</div>
          <template v-else>
            <div class="cred-row">
              <span class="cred-label">SSH 用户</span>
              <span class="mono">{{ credModal.sshUser || '—' }}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">SSH 口令</span>
              <span class="mono cred-pass">{{ credModal.password || '未设置口令（密钥认证）' }}</span>
              <button v-if="credModal.password" class="btn btn-secondary btn-sm" @click="copyText(credModal.password!)">
                复制
              </button>
            </div>
            <p class="form-hint">本次查看已记录审计日志（谁在何时查看了该网关的口令）；口令不出现在列表接口中。</p>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="credModal.open = false">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="configModal.open" class="modal-overlay" @click.self="configModal.open = false">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>配置预览 · {{ configModal.regionName }}</h2>
          <button class="modal-close" @click="configModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="configModal.loading" class="config-hint">加载中…</div>
          <template v-else-if="configModal.data">
            <p class="config-hint">
              区域 <a-tag color="blue">{{ configModal.data.region_code }}</a-tag> OpenResty 前缀
              <code>{{ configModal.data.openresty_prefix }}</code> · 监听端口 {{ configModal.data.listen_port }}
            </p>
            <div v-for="f in configModal.data.files" :key="f.path" class="config-file">
              <div class="config-file-head">
                <div class="config-file-meta">
                  <div class="config-file-path">{{ f.path }}</div>
                  <div class="config-file-purpose">{{ f.purpose }}</div>
                </div>
                <button class="btn btn-secondary btn-sm" @click="copyText(f.content)">复制</button>
              </div>
              <pre class="config-pre">{{ f.content }}</pre>
            </div>
            <ul class="config-notes">
              <li v-for="(n, i) in configModal.data.notes" :key="i">{{ n }}</li>
            </ul>
          </template>
          <div v-else class="config-hint">加载失败，请重试</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="configModal.open = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 配置网关 sshd 跳板转发（需 root；凭据仅本次使用，不保存） -->
    <div v-if="sshdModal.open" class="modal-overlay" @click.self="closeSshdSetup">
      <div class="modal">
        <div class="modal-header">
          <h2>配置跳板转发 · {{ sshdModal.record?.name }}</h2>
          <button class="modal-close" @click="closeSshdSetup">&times;</button>
        </div>
        <div class="modal-body">
          <p class="config-hint">
            网关 sshd 默认禁止 TCP 转发（跳板查询会报 <code>administratively prohibited</code>）。此处以 root
            在网关机写入 <code>/etc/ssh/sshd_config.d/relay-tunnel.conf</code>
            （放行转发 + 仅允许连本局节点 SSH 端口）并重载 sshd；校验失败会自动回滚，不影响正在运行的 sshd。 若网关 sshd
            不接受端口白名单格式（部分系统如 LinxOS），将自动降级为仅放行转发并回显原因；校验失败会自动回滚。
          </p>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">root 账号</label>
              <input type="text" class="form-input" v-model="sshdModal.root_user" placeholder="root" />
            </div>
          </div>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">root 密码</label>
              <input
                type="password"
                class="form-input"
                v-model="sshdModal.root_password"
                placeholder="请输入 root 密码（仅本次使用，不保存）"
              />
            </div>
            <span class="form-hint">仅本次注入网关清单用于连接，跑完立即还原；不落库、不打日志</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeSshdSetup">取消</button>
          <button class="btn btn-primary" :disabled="!sshdModal.root_password" @click="submitSshdSetup">
            开始配置
          </button>
        </div>
      </div>
    </div>

    <!-- 执行过程抽屉：复用节点管理同款（实时 stdout + 进度 + 终态） -->
    <NodeExecutionResultDrawer
      v-model:visible="execDrawerVisible"
      :title="execDrawerTitle"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="null"
      :installing="execInstalling"
      :stream-error="execError"
      :stream-status="execStreamStatus"
      @cancel="cancelExec"
    />

    <!-- 就地 popover（批次三 3.1 引擎；Teleport 到 body：fixed 定位锚定图元，视口边缘避让） -->
    <Teleport to="body">
      <div
        v-if="pop.open"
        :ref="pop.setPopEl"
        class="topo-pop"
        :style="{ left: pop.pos.left, top: pop.pos.top }"
        @click.stop
      >
        <template v-if="pop.config">
          <p class="p-title">{{ pop.config.title }}</p>
          <p v-if="pop.config.sub" class="p-sub">{{ pop.config.sub }}</p>
          <div v-for="f in pop.config.fields" :key="f.key" class="pf" :class="{ invalid: !!pop.fieldErrors[f.key] }">
            <label>{{ f.label }}</label>
            <select v-if="f.options" v-model="pop.values[f.key]">
              <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-else
              type="text"
              :class="{ ftext: !f.mono }"
              v-model="pop.values[f.key]"
              :placeholder="f.placeholder"
              @blur="pop.validateField(f)"
              @input="pop.clearFieldError(f.key)"
              @keydown.enter.prevent="submitPopover"
            />
            <div class="ferr">{{ pop.fieldErrors[f.key] }}</div>
          </div>
          <div v-if="pop.submitError" class="p-error">{{ pop.submitError }}</div>
          <div class="p-actions">
            <button v-if="pop.config.link" class="p-link" @click="pop.config.link.onClick()">
              {{ pop.config.link.label }}
            </button>
            <button
              v-if="pop.config.chain && pop.config.altSave"
              class="only-save"
              :disabled="pop.busy"
              @click="applySave"
            >
              {{ pop.config.altSave }}
            </button>
            <button class="btn btn-secondary btn-sm" :disabled="pop.busy" @click="pop.close()">取消</button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="pop.busy || pop.config.primaryDisabled"
              @click="applyPrimary"
            >
              {{ pop.busy ? '处理中…' : pop.config.primaryLabel || '保存' }}
            </button>
          </div>
          <!-- 注记文案为本仓库常量（mockup 同款加粗强调），非用户输入 -->
          <div v-if="pop.config.note" class="p-note" v-html="pop.config.note"></div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import RelayTopologyCard from '@/components/RelayTopologyCard.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { useInstallStream } from '@/composables/useInstallStream'
import {
  RELAY_CODE_ERROR_MSG,
  RELAY_CODE_PATTERN,
  RELAY_HTTP_BASE_URL_ERROR_MSG,
  RELAY_HTTP_BASE_URL_PATTERN,
  RELAY_OPENRESTY_PREFIX_ERROR_MSG,
  RELAY_SSH_JUMP_ERROR_MSG,
  RELAY_SSH_JUMP_PATTERN,
  useTopologyPopover,
  type TopoPopoverConfig,
  type TopoPopoverField,
} from '@/composables/useTopologyPopover'
import { updateClusterRegion } from '@/api/clusters'
import {
  createRelayGateway,
  deleteRelayGateway,
  fetchRelayTopology,
  getRelayConfigPreview,
  listRelayGateways,
  relayHealthCheck,
  relayInitStreamUrl,
  relayPushStreamUrl,
  relaySshdSetupStreamUrl,
  updateRelayGateway,
  fetchGatewayCredential,
  type RelayConfigPreview,
  type RelayGateway,
  type RelayGatewayPayload,
  type RelayHealthResult,
  type RelayTopologyCluster,
  type RelayTopologyNode,
  type RelayTopologyOut,
  type RelayTopologyRegion,
} from '@/api/relay'
import { getApiErrorMessage } from '@/utils/error'
import { formatDateTime } from '@/utils/format'

const CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
// 与后端 schemas/relay.py 同规则的格式硬校验（前端 inline + 后端 400/422 双层）
const HTTP_BASE_URL_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/
const SSH_JUMP_PATTERN = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:\d{1,5})?$/

const regions = ref<RelayGateway[]>([])
const loading = ref(false)
const testing = ref(false)
const testingId = ref<number | null>(null)
const checkingAll = ref(false)
const activeKind = ref<'init' | 'push' | 'sshd' | null>(null)
const activeId = ref<number | null>(null)

// 执行过程抽屉：复用节点管理同款 NodeExecutionResultDrawer + useInstallStream（SSE），
// 与「安装 OpenResty」一致，可实时看到 stdout 行、进度与终态。
const installStream = useInstallStream()
const { installing: execInstalling, error: execError, status: execStreamStatus } = installStream
// execInstalling 来自组合式函数（测试劫持时是 {value} 形对象，非真 ref）：
// 模板直接引用不会被解包（始终真值→按钮恒禁用，2026-11-03 实测），统一经 computed 包装。
const streamBusy = computed(() => execInstalling.value === true)
const execDrawerVisible = ref(false)
const execDrawerTitle = ref('执行结果')

// 配置跳板转发（需 root）：root 凭据仅本次使用、提交后立即清空，不落库、不持久化
const sshdModal = reactive({
  open: false,
  record: null as RelayGateway | null,
  root_user: 'root',
  root_password: '',
})
const execProgress = reactive({ percent: 0, status: 'active' as 'active' | 'success' | 'exception' })
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
const execHighlights = ref<string[]>([])
let finalEvent: Record<string, unknown> | null = null
let elapsedTimer: number | undefined

const columns = [
  { title: '区域', key: 'region' },
  { title: '网关两腿', key: 'legs' },
  { title: '状态', key: 'status' },
  { title: '健康', key: 'health', width: 170 },
  { title: '更新时间', key: 'updated_at' },
  { title: '操作', key: 'actions', width: 230 },
]

// ── 区域健康状态（组件态：体检是只读时点探测，不落库；刷新后回落「未检测」） ──
interface HealthMeta {
  result: RelayHealthResult
  checkedAt: string
}
const healthState: Record<number, HealthMeta> = reactive({})

/** busy 精确语义（D6）：流式操作（init/push/sshd）全局串行（单执行抽屉约束），
 * 非流式操作（编辑/测试/预览/启停/删除）按行禁用——仅正在执行的行被整体禁用，
 * 其他区域操作不受牵连，与后端 _INFLIGHT 按区域守卫的并发语义对齐。 */
function rowBusy(record: RelayGateway): boolean {
  return execInstalling.value && activeId.value === record.id
}

const modal = reactive({ open: false, editing: false })
const submitting = ref(false)
const form = reactive({
  id: 0,
  code: '',
  name: '',
  http_base_url: '',
  ssh_jump: '',
  openresty_prefix: '',
  status: 'enabled',
  ssh_user: '',
  ssh_password: '',
  ssh_port: 22,
  ansible_python_interpreter: '',
  ssh_common_args: '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null',
})

const formErrors = reactive({
  code: '',
  name: '',
  http_base_url: '',
  ssh_jump: '',
  openresty_prefix: '',
  ssh_user: '',
})

// 配置预览弹窗（只读）：内容由后端用与下发相同的渲染函数产出
const configModal = reactive({
  open: false,
  loading: false,
  regionName: '',
  data: null as RelayConfigPreview | null,
})

// 查看凭据弹窗（relay-gateways-ux-redesign 迭代）：口令不出列表——仅此单查入口（后端记录 view_credential 审计）
const credModal = reactive({
  open: false,
  loading: false,
  regionName: '',
  sshUser: '',
  password: null as string | null,
})

async function openCredential(record: RelayGateway) {
  credModal.open = true
  credModal.loading = true
  credModal.regionName = record.name
  credModal.sshUser = record.ssh_user || ''
  credModal.password = null
  try {
    const res = await fetchGatewayCredential(record.id)
    credModal.password = res.data.ssh_password
  } catch (e) {
    message.error(getApiErrorMessage(e))
    credModal.open = false
  } finally {
    credModal.loading = false
  }
}

// 体检结果弹窗（单区域 / 全量共用）：探测期间即打开（loading），完成后填充并更新健康列；
// 用户提前关闭不中断探测（resultDismissed），完成时仅补一行终态 message、不再弹回。
const resultModal = reactive({
  open: false,
  loading: false,
  title: '',
  results: [] as RelayHealthResult[],
})
let resultDismissed = false

function closeResultModal() {
  resultModal.open = false
  resultDismissed = true
}

function regionDisplayName(code: string): string {
  const row = regions.value.find((r) => r.code === code)
  return row ? `「${row.name}」（${code}）` : code
}

function buildResultText(results: RelayHealthResult[]): string {
  return results
    .map((r) => {
      const segLines = r.segments.map((s) => {
        const head = `${s.name}：${s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}`}`
        const notes = (s.nodes || []).filter((n) => n.note).map((n) => `  └ ${n.node}：${n.note}`)
        return [head, ...notes].join('\n')
      })
      return `${regionDisplayName(r.region)}\n${segLines.join('\n')}`
    })
    .join('\n\n')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动选择文本复制')
  }
}

async function copyResult() {
  const text = buildResultText(resultModal.results)
  if (text) await copyText(text)
}

async function openConfigPreview(record: RelayGateway) {
  configModal.open = true
  configModal.loading = true
  configModal.regionName = record.name
  configModal.data = null
  try {
    const res = await getRelayConfigPreview(record.id)
    configModal.data = res.data
  } catch (e) {
    message.error(getApiErrorMessage(e))
    configModal.open = false
  } finally {
    configModal.loading = false
  }
}

async function load() {
  loading.value = true
  try {
    const res = await listRelayGateways()
    regions.value = res.data
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

// ── 视图切换（relay-region-topology-view D1：拓扑为默认，表格保留；local ref 不持久化） ──
const viewMode = ref<'topo' | 'table'>('topo')

function switchView(mode: 'topo' | 'table') {
  viewMode.value = mode
}

// 拓扑明细（GET /relay/topology）：与列表行同源；按区域码索引供链路卡消费
const topology = ref<RelayTopologyOut | null>(null)

const topoByCode = computed<Record<string, RelayTopologyRegion>>(() => {
  const map: Record<string, RelayTopologyRegion> = {}
  for (const region of topology.value?.regions ?? []) map[region.code] = region
  return map
})

/** 拓扑加载失败静默降级：链路卡退化为仅列表行数据渲染（列表 load() 已有错误提示，不重复弹）。 */
async function loadTopology() {
  try {
    const res = await fetchRelayTopology()
    topology.value = res.data
  } catch {
    topology.value = null
  }
}

/** 两视图同源刷新：任何写操作/执行完成后统一走本函数（约定 #51：改一处不够时先找齐消费点）。 */
async function refreshAll() {
  await Promise.all([load(), loadTopology()])
}

/** 悬空区域码的挂接集群数（detachable 为全部集群轻量引用） */
function orphanClusterCount(code: string): number {
  return (topology.value?.detachable ?? []).filter((c) => c.region_code === code).length
}

/** 拓扑卡「更多 ▾」动作分发：复用表格视图的既有 handlers（同一实现，不复制逻辑）。
 * 批次三注：case 'init'（重新初始化，重操作）保持既有确认弹窗；框上「初始化网关」按钮走轻确认 popover（openInitConfirm），
 * case 'edit' 保持旧弹窗（口令与高级参数编辑在弹窗内）。 */
function handleCardMenuAction(record: RelayGateway, item: string) {
  switch (item) {
    case 'edit':
      openEdit(record)
      break
    case 'init':
      handleInit(record)
      break
    case 'sshd':
      openSshdSetup(record)
      break
    case 'preview':
      openConfigPreview(record)
      break
    case 'cred':
      openCredential(record)
      break
    case 'toggle':
      handleToggle(record)
      break
    case 'delete':
      handleDelete(record)
      break
  }
}

// ══ 批次三：图内编辑与新建（就地 popover 体系，design D5/D6/D7）══

const router = useRouter()

/** 就地 popover 引擎实例（锚定定位 / Esc·点空白关闭 / 同点收起 / 即时校验 / 链式主按钮） */
const pop = useTopologyPopover()

function applyPrimary() {
  void pop.apply('primary')
}

function applySave() {
  void pop.apply('save')
}

/** 输入框 Enter 等价主按钮（mockup 语义：有链式走链式，否则普通保存） */
function submitPopover() {
  void pop.apply(pop.config?.chain ? 'primary' : 'save')
}

/** 阶段机输入源：拓扑明细优先，缺失回退列表行（与链路卡 stageSource 同源） */
function regionSource(record: RelayGateway): RelayTopologyRegion | RelayGateway {
  return topoByCode.value[record.code] ?? record
}

/**
 * D5 保存语义（防覆盖并发写）：把 popover 中编辑的字段 + 最新行其余字段合并回填，
 * 走既有 PUT /relay/gateways/{id}（后端 exclude_unset 部分更新）。ssh_password 有意不携带——
 * 口令永不出列表，缺省即后端不动口令（与编辑弹窗「按需单查回填」不同源但更安全）。
 */
async function saveRelayFields(record: RelayGateway, edited: Partial<RelayGatewayPayload>) {
  const row = regions.value.find((r) => r.id === record.id) || record
  await updateRelayGateway(row.id, {
    name: edited.name ?? row.name,
    http_base_url: edited.http_base_url !== undefined ? edited.http_base_url || null : row.http_base_url || null,
    ssh_jump: edited.ssh_jump !== undefined ? edited.ssh_jump || null : row.ssh_jump || null,
    openresty_prefix:
      edited.openresty_prefix !== undefined ? edited.openresty_prefix || null : row.openresty_prefix || null,
    status: row.status,
    ssh_user: edited.ssh_user !== undefined ? edited.ssh_user : row.ssh_user || '',
    ssh_port: edited.ssh_port !== undefined ? edited.ssh_port : row.ssh_port || 22,
    ansible_python_interpreter: row.ansible_python_interpreter || null,
    ssh_common_args: row.ssh_common_args || null,
  })
  await refreshAll()
}

/** 统一保存 + 刷新 + 无链式时的「已保存」toast（链式主按钮由接续动作自带反馈） */
async function applyRelaySave(
  record: RelayGateway,
  edited: Partial<RelayGatewayPayload>,
  opts: { chained?: boolean } = {},
) {
  await saveRelayFields(record, edited)
  if (!opts.chained) message.success('已保存')
}

// ── 3.2 两腿 chip popover：编辑态「保存并测试」+「仅保存」；登记态「保存登记」（SSH 腿顺带收集账号） ──
function openLegPopover(record: RelayGateway, kind: 'http' | 'ssh', anchor: HTMLElement) {
  const isHttp = kind === 'http'
  const src = regionSource(record)
  const current = String((isHttp ? src.http_base_url : src.ssh_jump) || '')
  const empty = !current
  const fieldKey = isHttp ? 'http_base_url' : 'ssh_jump'
  const fields: TopoPopoverField[] = [
    {
      key: fieldKey,
      label: isHttp ? '网关 HTTP 腿地址' : 'SSH 跳板',
      value: current,
      placeholder: isHttp ? 'http://10.10.1.1:8443' : 'tunnel@10.10.1.1:22',
      validate: (v) => {
        if (!v) return null
        return isHttp
          ? RELAY_HTTP_BASE_URL_PATTERN.test(v)
            ? null
            : RELAY_HTTP_BASE_URL_ERROR_MSG
          : RELAY_SSH_JUMP_PATTERN.test(v)
            ? null
            : RELAY_SSH_JUMP_ERROR_MSG
      },
    },
  ]
  const needUser = !isHttp && !src.ssh_user
  if (needUser) {
    fields.push({
      key: 'ssh_user',
      label: 'SSH 账号（登录网关机，初始化 / 下发用）',
      value: '',
      placeholder: 'jboss',
      mono: false,
      validate: (v) => (v ? null : 'SSH 账号不能为空'),
    })
  }
  const chained = !empty
  const chain = chained
    ? () => {
        const latest = regions.value.find((r) => r.id === record.id)
        void handleTest(latest || record)
      }
    : undefined
  pop.togglePopover(anchor, {
    title: `${empty ? '登记' : '编辑'}${isHttp ? ' HTTP 腿' : ' SSH 跳板'} · ${record.name}`,
    sub: isHttp ? '发布、回滚等管理请求经它进入该局' : '安装、初始化等 SSH 任务先跳到网关机再进局内',
    fields,
    primaryLabel: empty ? '保存登记' : '保存并测试',
    altSave: chained ? '仅保存' : undefined,
    chain,
    note: empty
      ? isHttp
        ? '<b>登记后动作</b>：登记 SSH 腿 → 初始化网关 → 集群挂接 → 下发配置，全程在本图完成。'
        : '<b>登记后动作</b>：初始化网关（缺 OpenResty 前缀时会在点击初始化时收集）→ 集群挂接 → 下发配置。'
      : isHttp
        ? '<b>改后需初始化网关</b>：HTTP 腿地址变更须经「初始化网关」重写 8443 监听后才对网关机生效。'
        : '<b>改后需测试</b>：SSH 跳板变更建议立即「测试」验证；若网关 sshd 默认禁转发，还需「配置跳板转发」放行。',
    onApply: async (vals) => {
      const edited: Partial<RelayGatewayPayload> = { [fieldKey]: vals[fieldKey].trim() || null }
      if (needUser) edited.ssh_user = vals.ssh_user.trim()
      await applyRelaySave(record, edited, { chained })
    },
  })
}

// ── 3.3 网关机节点 popover（SSH 账号 / 端口 / OpenResty 前缀三字段；前缀直接编辑可空、初始化链内必填） ──
interface NodePopoverOpts {
  requirePrefix?: boolean
  focusPrefix?: boolean
  title?: string
  primaryLabel?: string
  note?: string
  chain?: () => void
}

function openNodePopover(record: RelayGateway, anchor: HTMLElement, opts: NodePopoverOpts = {}, toggle = false) {
  const src = regionSource(record)
  const cfg: TopoPopoverConfig = {
    title: opts.title || `编辑网关机连接 · ${record.name}`,
    sub: '口令与高级参数（Python 解释器 / SSH 参数）请用「更多 ▸ 编辑」弹窗',
    fields: [
      {
        key: 'ssh_user',
        label: 'SSH 账号',
        value: String(src.ssh_user ?? ''),
        placeholder: 'jboss',
        mono: false,
        validate: (v) => (v ? null : 'SSH 账号不能为空'),
      },
      {
        key: 'ssh_port',
        label: 'SSH 端口',
        value: String(src.ssh_port ?? 22),
        placeholder: '22',
        validate: (v) =>
          /^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? null : '端口须为 1–65535 的整数',
      },
      {
        key: 'openresty_prefix',
        label: 'OpenResty 前缀',
        value: String(src.openresty_prefix ?? ''),
        placeholder: '/work/jboss/tunnel/openresty-1.21.4.1/nginx',
        validate: opts.requirePrefix
          ? (v) => {
              if (!v) return '初始化网关需要 OpenResty 前缀'
              return v.startsWith('/') ? null : RELAY_OPENRESTY_PREFIX_ERROR_MSG
            }
          : (v) => (!v || v.startsWith('/') ? null : RELAY_OPENRESTY_PREFIX_ERROR_MSG),
      },
    ],
    primaryLabel: opts.primaryLabel || '保存',
    altSave: opts.chain ? '仅保存' : undefined,
    focusLast: opts.focusPrefix,
    chain: opts.chain,
    note: opts.note || '前缀留空时「初始化网关」会被拒绝（要求已填前缀）。',
    onApply: async (vals) => {
      await applyRelaySave(
        record,
        {
          ssh_user: vals.ssh_user.trim(),
          ssh_port: Number(vals.ssh_port),
          openresty_prefix: vals.openresty_prefix.trim() || null,
        },
        { chained: !!opts.chain },
      )
    },
  }
  if (toggle) pop.togglePopover(anchor, cfg)
  else pop.openPopover(anchor, cfg)
}

// ── 3.4 卡头名称就地改名 + 状态徽章切换确认 ──
function openNamePopover(record: RelayGateway, anchor: HTMLElement) {
  pop.togglePopover(anchor, {
    title: `重命名区域 · ${record.name}`,
    fields: [
      {
        key: 'name',
        label: '区域名称',
        value: record.name,
        mono: false,
        validate: (v) => (v ? null : '区域名称不能为空'),
      },
    ],
    onApply: async (vals) => {
      await applyRelaySave(record, { name: vals.name.trim() })
    },
  })
}

/** 启用/禁用共享实现：表格「更多」菜单与拓扑状态徽章 popover 同走此函数（PUT + 两视图刷新） */
async function toggleRegionStatus(record: RelayGateway, next: 'enabled' | 'disabled') {
  await updateRelayGateway(record.id, { status: next })
  await refreshAll()
}

function openStatusPopover(record: RelayGateway, anchor: HTMLElement) {
  const disabling = record.status === 'enabled'
  pop.togglePopover(anchor, {
    title: `${disabling ? '禁用区域' : '启用区域'} · ${record.name}`,
    fields: [],
    primaryLabel: disabling ? '确认禁用' : '确认启用',
    note: disabling
      ? '禁用后该局<b>全部挂接集群回退直连执行</b>（两腿配置保留，随时可再启用）。'
      : '启用后按已登记两腿经中继进局；<b>启用后建议先「测试」</b>确认两腿可达。',
    onApply: async () => {
      try {
        await toggleRegionStatus(record, disabling ? 'disabled' : 'enabled')
        message.success(disabling ? '已禁用：该局集群回退直连' : '已启用：建议执行「测试」验证两腿')
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

// ── 3.5 集群挂接 / 解挂（PUT /clusters/{id} 的 region_code，空串 = 解挂） ──
function regionLabelByCode(code: string | null | undefined): string {
  if (!code) return '未挂接'
  const row = regions.value.find((r) => r.code === code)
  return row ? row.name : code
}

function openClusterPopover(cluster: RelayTopologyCluster, anchor: HTMLElement) {
  const current = topology.value?.detachable.find((c) => c.id === cluster.id)?.region_code ?? ''
  pop.togglePopover(anchor, {
    title: `挂接 / 解挂 · ${cluster.display_name || cluster.name}`,
    sub: '选择所属中继区域；不挂接则该集群按直连执行',
    fields: [
      {
        key: 'region_code',
        label: '所属区域',
        value: current,
        options: [
          { value: '', label: '不挂接（直连）' },
          ...regions.value.map((r) => ({ value: r.code, label: `${r.name}（${r.code}）` })),
        ],
      },
    ],
    primaryLabel: '保存',
    link: { label: '打开集群 ›', onClick: () => void router.push('/clusters') },
    note: '解挂 = 选择「不挂接（直连）」后保存；保存后自动刷新拓扑与网关路由。',
    onApply: async (vals) => {
      await updateClusterRegion(cluster.id, vals.region_code)
      await refreshAll()
      message.success(vals.region_code ? '已挂接。下一步：该区域「下发配置」后网关才放行' : '已解挂：该集群回直连')
    },
  })
}

function openAttachPopover(record: RelayGateway, anchor: HTMLElement) {
  const candidates = (topology.value?.detachable ?? []).filter((c) => c.region_code !== record.code)
  pop.togglePopover(anchor, {
    title: `挂接集群 · ${record.name}`,
    sub: '下拉列出未挂接本区域的集群（含其当前区域归属）',
    fields: [
      {
        key: 'cluster_id',
        label: '选择集群',
        value: String(candidates[0]?.id ?? ''),
        options: candidates.map((c) => ({
          value: String(c.id),
          label: `${c.display_name || c.name}（当前：${regionLabelByCode(c.region_code)}）`,
        })),
      },
    ],
    primaryLabel: '挂接',
    primaryDisabled: candidates.length === 0,
    note: candidates.length ? '' : '当前没有可挂接的集群。',
    onApply: async (vals) => {
      const clusterId = Number(vals.cluster_id)
      const cluster = candidates.find((c) => c.id === clusterId)
      await updateClusterRegion(clusterId, record.code)
      await refreshAll()
      message.success(
        `已挂接「${cluster?.display_name || cluster?.name || vals.cluster_id}」至 ${record.name}。下一步：下发配置后网关才放行其节点`,
      )
    },
  })
}

// ── 3.6 节点行只读详情（信息弹窗：状态 / 白名单同步态 / 体检明细 / 打开节点管理） ──
const WL_STATE_TEXT: Record<string, string> = {
  synced: '已同步',
  pending_add: '未下发',
  pending_remove: '待移除',
  off: '已停用',
}

function openNodeDetailModal(record: RelayGateway, node: RelayTopologyNode, cluster: RelayTopologyCluster) {
  const health = healthState[record.id] || null
  const entry = health?.result.segments?.[2]?.nodes?.find((n) => n.node === node.ip)
  const healthLine = !health
    ? '未检测'
    : !entry
      ? '未检测'
      : entry.ok
        ? entry.note || '体检正常'
        : [entry.error, entry.note].filter(Boolean).join('；')
  const detailRow = (label: string, value: string) =>
    h('div', { class: 'cred-row' }, [h('span', { class: 'cred-label' }, label), h('span', { class: 'mono' }, value)])
  showOverlayModal({
    title: `节点 ${node.ip}:${node.management_port}`,
    content: h('div', null, [
      detailRow('状态', node.status === 1 ? '启用' : '停用'),
      detailRow('白名单同步', WL_STATE_TEXT[node.whitelist_state] || node.whitelist_state),
      detailRow('体检', healthLine),
      h('p', { class: 'form-hint', style: 'margin-top:10px' }, '节点增删与启停请到集群节点列表操作。'),
    ]),
    okText: '打开节点管理',
    cancelText: '关闭',
    onOk: () => {
      void router.push({ path: '/nodes', query: { cluster_id: String(cluster.id) } })
    },
  })
}

// ── 3.8 初始化轻确认 + 链式「保存并初始化」 ──

/** 链式收尾：拿刷新后的最新行走既有 SSE 初始化流（轻确认已由 popover 承担，一气呵成不再二次确认） */
function startExecLatest(record: RelayGateway) {
  const latest = regions.value.find((r) => r.id === record.id) || record
  startExec(latest, 'init')
}

function openInitConfirm(record: RelayGateway, anchor: HTMLElement) {
  const src = regionSource(record)
  const preOk = !!src.openresty_prefix
  const hasUser = !!src.ssh_user
  pop.openPopover(anchor, {
    title: `初始化网关 · ${record.name}`,
    fields: [],
    primaryLabel: preOk ? '确认初始化' : '填写前缀并初始化',
    note:
      '将向网关机写入 <b>8443 监听 server 块 + 当前白名单</b>，校验后 reload。<b>幂等可重复执行</b>。<br>' +
      `前置：SSH 腿 ✓ · SSH 账号 ${hasUser ? '✓' : '<span class="st-miss">缺失（先补账号）</span>'} · OpenResty 前缀 ${
        preOk ? '✓' : '<span class="st-miss">未填（下一步收集）</span>'
      }`,
    onApply: () => {
      if (preOk) {
        startExecLatest(record)
        return
      }
      openNodePopover(record, anchor, {
        title: `初始化前置 · OpenResty 前缀 · ${record.name}`,
        primaryLabel: '保存并初始化',
        focusPrefix: true,
        requirePrefix: true,
        note: '填完保存即自动开始初始化（写入 8443 监听并 reload）。',
        chain: () => startExecLatest(record),
      })
    },
  })
}

// ── 3.7 新建区域草稿卡（design D6：必填仅 code+name；SSH 账号在登记 SSH 腿时顺带收集） ──
const draftOpen = ref(false)
const draftForm = reactive({ code: '', name: '' })
const draftErrors = reactive({ code: '', name: '' })
const draftServerError = ref('')
const draftSubmitting = ref(false)

function openDraftCard(scroll: boolean) {
  draftOpen.value = true
  if (scroll) {
    void nextTick().then(() => {
      const el = document.querySelector('.draft-card')
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }
}

function closeDraftCard() {
  draftOpen.value = false
  draftForm.code = ''
  draftForm.name = ''
  draftErrors.code = ''
  draftErrors.name = ''
  draftServerError.value = ''
}

async function submitDraft() {
  const code = draftForm.code.trim()
  const name = draftForm.name.trim()
  draftErrors.code = RELAY_CODE_PATTERN.test(code) ? '' : RELAY_CODE_ERROR_MSG
  draftErrors.name = name ? '' : '区域名称不能为空'
  if (draftErrors.code || draftErrors.name) return
  draftSubmitting.value = true
  draftServerError.value = ''
  try {
    await createRelayGateway({ code, name })
    closeDraftCard()
    await refreshAll()
    message.success(
      `已创建「${name}」（${code}）：初始直连形态。下一步：点该卡灰色两腿 chip 登记两腿（SSH 腿登记时顺带填 SSH 账号）`,
    )
    // 新区域卡滚动到位（拓扑明细刷新后渲染）
    await nextTick()
    const card = document.querySelector(`.topo-card[data-code="${code}"]`)
    if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch (e) {
    // 后端 400（查重/格式）就地红字展示，不弹 toast
    const msg = getApiErrorMessage(e)
    if (msg.includes('code')) draftErrors.code = msg
    else draftServerError.value = msg
  } finally {
    draftSubmitting.value = false
  }
}

/** Esc 收起草稿卡（草稿输入框内 Esc 经 .stop 就地处理；此处兜底输入框外按键） */
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && draftOpen.value) closeDraftCard()
}

function openCreate() {
  modal.editing = false
  modal.open = true
  form.id = 0
  form.code = ''
  form.name = ''
  form.http_base_url = ''
  form.ssh_jump = ''
  form.openresty_prefix = ''
  form.status = 'enabled'
  form.ssh_user = ''
  form.ssh_password = ''
  form.ssh_port = 22
  form.ansible_python_interpreter = ''
  form.ssh_common_args = '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
  clearFormErrors()
}

function openEdit(record: RelayGateway) {
  modal.editing = true
  modal.open = true
  form.id = record.id
  form.code = record.code
  form.name = record.name
  form.http_base_url = record.http_base_url || ''
  form.ssh_jump = record.ssh_jump || ''
  form.openresty_prefix = record.openresty_prefix || ''
  form.status = record.status
  form.ssh_user = record.ssh_user || ''
  form.ssh_password = ''
  form.ssh_port = record.ssh_port || 22
  form.ansible_python_interpreter = record.ansible_python_interpreter || ''
  form.ssh_common_args = record.ssh_common_args || '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
  clearFormErrors()
  // 口令不出列表：编辑时按需单查（单查走审计）
  fetchGatewayCredential(record.id)
    .then((r: { data: { ssh_password: string | null } }) => {
      form.ssh_password = r.data.ssh_password || ''
    })
    .catch(() => {
      /* 拉取失败不阻断编辑，保存空口令 = 密钥认证语义 */
    })
}

function closeModal() {
  modal.open = false
}

function clearFormErrors() {
  formErrors.code = ''
  formErrors.name = ''
  formErrors.http_base_url = ''
  formErrors.ssh_jump = ''
  formErrors.openresty_prefix = ''
  formErrors.ssh_user = ''
}

function validateForm(): boolean {
  clearFormErrors()
  let ok = true
  if (!CODE_PATTERN.test(form.code)) {
    formErrors.code = '区域码格式错误：小写字母开头，仅含小写字母/数字/中划线，长度 2-32'
    ok = false
  }
  if (!form.name.trim()) {
    formErrors.name = '请输入展示名'
    ok = false
  }
  const http = form.http_base_url.trim()
  if (http && !HTTP_BASE_URL_PATTERN.test(http)) {
    formErrors.http_base_url = '网关 HTTP 腿格式错误：须以 http:// 或 https:// 开头，如 http://10.10.1.1:8443'
    ok = false
  }
  if (!form.ssh_user.trim()) {
    formErrors.ssh_user = '请输入 SSH 用户'
    ok = false
  }
  const jump = form.ssh_jump.trim()
  if (jump && !SSH_JUMP_PATTERN.test(jump)) {
    formErrors.ssh_jump = 'SSH 跳板格式错误：须为 账号@主机[:端口]，如 tunnel@10.10.1.1:22'
    ok = false
  }
  const prefix = form.openresty_prefix.trim()
  if (prefix && !prefix.startsWith('/')) {
    formErrors.openresty_prefix =
      'OpenResty 前缀格式错误：须为以 / 开头的绝对路径，如 /work/jboss/tunnel/openresty-1.21.4.1/nginx'
    ok = false
  }
  return ok
}

async function handleSubmit() {
  if (!validateForm()) return
  // 直连语义（relay-gateways-ux-redesign D2 修订）：无分段选择——两腿全空即直连区域，
  // 允许保存但一次性提示，避免误留空
  if (!form.http_base_url.trim() && !form.ssh_jump.trim()) {
    message.info('两腿均为空，将按直连区域保存')
  }
  submitting.value = true
  try {
    if (modal.editing) {
      await updateRelayGateway(form.id, {
        name: form.name.trim(),
        http_base_url: form.http_base_url.trim() || null,
        ssh_jump: form.ssh_jump.trim() || null,
        openresty_prefix: form.openresty_prefix.trim() || null,
        status: form.status,
        ssh_user: form.ssh_user.trim(),
        ssh_password: form.ssh_password || null,
        ssh_port: form.ssh_port || 22,
        ansible_python_interpreter: form.ansible_python_interpreter.trim() || null,
        ssh_common_args: form.ssh_common_args.trim() || null,
      })
      message.success('区域已更新')
    } else {
      await createRelayGateway({
        code: form.code,
        name: form.name.trim(),
        http_base_url: form.http_base_url.trim() || null,
        ssh_jump: form.ssh_jump.trim() || null,
        openresty_prefix: form.openresty_prefix.trim() || null,
        status: form.status,
        ssh_user: form.ssh_user.trim(),
        ssh_password: form.ssh_password || null,
        ssh_port: form.ssh_port || 22,
        ansible_python_interpreter: form.ansible_python_interpreter.trim() || null,
        ssh_common_args: form.ssh_common_args.trim() || null,
      })
      message.success('区域已创建')
    }
    modal.open = false
    await refreshAll()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}

function handleToggle(record: RelayGateway) {
  const next = record.status === 'enabled' ? 'disabled' : 'enabled'
  showOverlayModal({
    title: next === 'disabled' ? '禁用区域' : '启用区域',
    content: h(
      'p',
      null,
      next === 'disabled'
        ? `禁用后「${record.name}」区域的节点不再经网关中转，将按直连路径执行（跨中心场景通常不可达，相关操作会失败）。确认禁用？`
        : `启用后「${record.name}」的节点将按网关路由执行。确认启用？`,
    ),
    okText: '确认',
    onOk: async () => {
      try {
        await toggleRegionStatus(record, next)
        message.success(next === 'disabled' ? '区域已禁用' : '区域已启用')
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

// ── 区域体检：单区域「连通性测试」与页头「全量体检」共用结果弹窗与健康列更新 ──
function applyHealthResult(result: RelayHealthResult, checkedAt: string) {
  const row = regions.value.find((r) => r.code === result.region)
  if (row) healthState[row.id] = { result, checkedAt }
}

function healthCls(record: RelayGateway): string {
  const hs = healthState[record.id]
  if (!hs) return 'is-unknown'
  return hs.result.ok ? 'is-ok' : 'is-fail'
}

function healthText(record: RelayGateway): string {
  const hs = healthState[record.id]
  if (!hs) return '未检测'
  if (hs.result.ok) return '✓ 正常'
  const failed = hs.result.segments.find((s) => !s.ok)
  return failed ? `✗ ${failed.name}不可达` : '✗ 异常'
}

function healthDetail(record: RelayGateway): string {
  const hs = healthState[record.id]
  if (!hs) return ''
  const lines = hs.result.segments.map((s) => `${s.name}：${s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}`}`)
  if (hs.result.error) lines.push(`错误：${hs.result.error}`)
  return `体检时间 ${formatDateTime(hs.checkedAt)}\n${lines.join('\n')}`
}

function healthTime(record: RelayGateway): string {
  const hs = healthState[record.id]
  return hs ? formatDateTime(hs.checkedAt) : ''
}

async function handleTest(record: RelayGateway) {
  testing.value = true
  testingId.value = record.id
  resultDismissed = false
  resultModal.open = true
  resultModal.loading = true
  resultModal.title = `体检结果 · ${record.name}`
  resultModal.results = []
  try {
    const res = await relayHealthCheck(record.code)
    const result = res.data as RelayHealthResult
    applyHealthResult(result, new Date().toISOString())
    resultModal.loading = false
    resultModal.results = [result]
    resultModal.open = !resultDismissed
    if (result.ok) message.success(`「${record.name}」连通性测试通过`)
    else message.warning(`「${record.name}」连通性异常，详见体检结果`)
  } catch (e) {
    resultModal.open = false
    message.error(getApiErrorMessage(e))
  } finally {
    testing.value = false
    testingId.value = null
  }
}

async function handleCheckAll() {
  checkingAll.value = true
  resultDismissed = false
  resultModal.open = true
  resultModal.loading = true
  resultModal.title = '全量体检结果'
  resultModal.results = []
  try {
    const res = await relayHealthCheck()
    const data = res.data as { regions: RelayHealthResult[] }
    const checkedAt = new Date().toISOString()
    data.regions.forEach((r) => applyHealthResult(r, checkedAt))
    resultModal.loading = false
    resultModal.results = data.regions
    resultModal.open = !resultDismissed
    const okCount = data.regions.filter((r) => r.ok).length
    if (okCount === data.regions.length) message.success(`全量体检完成：${okCount} 个区域可达`)
    else message.warning(`全量体检完成：${okCount}/${data.regions.length} 个区域可达，详见体检结果`)
  } catch (e) {
    resultModal.open = false
    message.error(getApiErrorMessage(e))
  } finally {
    checkingAll.value = false
  }
}

function startElapsedTimer() {
  const startedAt = Date.now()
  execElapsed.value = 0
  elapsedTimer = window.setInterval(() => {
    execElapsed.value = Math.floor((Date.now() - startedAt) / 1000)
    // 无真实进度时按用时兜底推进进度条（同 NodeList.vue 的安装弹窗）
    const pct = Math.min(Math.round(((execElapsed.value ?? 0) / 200) * 100), 99)
    if (pct > execProgress.percent) execProgress.percent = pct
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer !== undefined) {
    window.clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }
}

/** 结束执行态：恢复行内按钮文案/禁用（activeKind/activeId 必须清空，否则按钮停留在「初始化中...」）。 */
function resetActiveState() {
  activeKind.value = null
  activeId.value = null
}

/** 打开执行过程抽屉并开始 SSE 流（复用节点安装的流式模型）。 */
function startExec(record: RelayGateway, kind: 'init' | 'push' | 'sshd', body: Record<string, unknown> = {}) {
  const isInit = kind === 'init'
  const label = { init: '初始化网关', push: '下发配置', sshd: '配置跳板转发' }[kind]
  const url =
    kind === 'init'
      ? relayInitStreamUrl(record.id)
      : kind === 'push'
        ? relayPushStreamUrl(record.id)
        : relaySshdSetupStreamUrl(record.id)
  activeKind.value = kind
  activeId.value = record.id
  finalEvent = null
  execDrawerTitle.value = `${label} - ${record.name}`
  execDrawerVisible.value = true
  execLogs.value = []
  execHighlights.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(url, body, {
    onLine: (line: string) => {
      // useInstallStream 对无 line 字段的结构化事件以 JSON 字符串转发；此处仅捕获终态
      // 事件（含 rc/status/hosts_pattern/listen_port），不混入日志。
      if (line.startsWith('{"')) {
        try {
          finalEvent = JSON.parse(line) as Record<string, unknown>
          return
        } catch {
          /* 非 JSON：按普通日志处理 */
        }
      }
      execLogs.value = [...execLogs.value, line]
    },
    onProgress: (percent: number) => {
      if (percent > execProgress.percent) execProgress.percent = percent
    },
    onComplete: (rc: number, status: string) => {
      // 收到终态事件即结束加载态/恢复按钮（不等底层流关闭，避免按钮卡在「初始化中...」）
      installStream.forceComplete()
      stopElapsedTimer()
      resetActiveState()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: '', rc }
      const hosts = (finalEvent?.hosts_pattern as string) || `gateways_${record.code}`
      const port = (finalEvent?.listen_port as number) || 8443
      execHighlights.value =
        rc === 0
          ? kind === 'init'
            ? [`初始化完成：${hosts}，监听 ${port}`]
            : kind === 'push'
              ? [`下发完成：${hosts}`]
              : [`sshd 跳板转发配置完成：${hosts}`]
          : [`执行失败（rc=${rc}，${status}）`]
      if (rc === 0) {
        message.success(
          kind === 'init'
            ? `初始化完成（${hosts}，监听 ${port}）`
            : kind === 'sshd'
              ? `跳板转发配置完成（${hosts}），正在自动复检…`
              : `配置已下发（${hosts}）`,
        )
      } else {
        message.error(`${isInit ? '初始化' : '下发'}失败（rc=${rc}），详见执行日志`)
      }
      refreshAll()
      // B″ 跳板框完成即隐：配置成功后自动复检，刷新体检快照（证据清零 → 橙框消失）
      if (kind === 'sshd' && rc === 0) void recheckAfterSshd(record)
    },
    onError: (err: string) => {
      stopElapsedTimer()
      resetActiveState()
      execProgress.status = 'exception'
      execError.value = err
      execLogs.value = [...execLogs.value, `❌ ${err}`]
      message.error(err)
    },
  })
}

function cancelExec() {
  installStream.cancel()
  stopElapsedTimer()
  resetActiveState()
  execProgress.status = 'exception'
}

/** 跳板转发配置成功后自动复检：刷新体检快照（applyHealthResult 原地更新），
 * 让「跳板转发待配置」框完成即隐；复检异常不打扰（框保留旧证据，可手动「测试」）。 */
async function recheckAfterSshd(record: RelayGateway) {
  try {
    const res = await relayHealthCheck(record.code)
    applyHealthResult(res.data as RelayHealthResult, new Date().toISOString())
  } catch {
    // 静默：保持既有体检快照
  }
}

function handleInit(record: RelayGateway) {
  showOverlayModal({
    title: '初始化网关',
    content: h('div', null, [
      h(
        'p',
        null,
        `将 8443 监听 server 块与当前白名单写入「${record.name}」网关机（OpenResty 前缀：${record.openresty_prefix || '未配置'}），校验后启动/重载。`,
      ),
      h(
        'p',
        { style: 'color: var(--muted); font-size: 12px' },
        '幂等可重复执行；首次装机必做，后续白名单变更走「下发配置」。确认后打开执行日志，可实时查看过程。',
      ),
    ]),
    okText: '开始初始化',
    onOk: () => {
      if (!record.openresty_prefix) {
        message.error('区域未配置 OpenResty 前缀，请先编辑区域填写')
        return
      }
      startExec(record, 'init')
    },
  })
}

function openSshdSetup(record: RelayGateway) {
  sshdModal.record = record
  sshdModal.root_user = 'root'
  sshdModal.root_password = ''
  sshdModal.open = true
}

function closeSshdSetup() {
  sshdModal.open = false
  sshdModal.root_password = '' // 凭据不留存
  sshdModal.record = null
}

function submitSshdSetup() {
  const record = sshdModal.record
  if (!record) return
  if (!sshdModal.root_password) {
    message.warning('请输入 root 密码')
    return
  }
  const body = { root_user: sshdModal.root_user || 'root', root_password: sshdModal.root_password }
  closeSshdSetup()
  startExec(record, 'sshd', body)
}

function handlePush(record: RelayGateway) {
  // 空名单防护（openspec: relay-push-empty-whitelist-guard）：0 启用节点时危险确认，
  // 显式携带 allow_empty 才放行；正常路径展示本次白名单规模与全量替换语义。
  const enabledCount = record.enabled_node_count ?? 0
  if (enabledCount === 0) {
    showOverlayModal({
      title: '下发网关配置',
      content: h('div', null, [
        h(
          'p',
          null,
          '该区域当前没有启用节点，下发将把该局网关白名单清空，该局所有经网关的发布/节点任务将被 403 拒绝。',
        ),
        h(
          'p',
          { style: 'color: var(--muted); font-size: 12px' },
          '若为误操作，请先到集群节点列表将节点状态改为「启用」，再重新下发；确要清空（如区域下线）再继续。',
        ),
      ]),
      okText: '仍要下发（白名单为空）',
      okDanger: true,
      onOk: () => startExec(record, 'push', { allow_empty: true }),
    })
    return
  }
  showOverlayModal({
    title: '下发网关配置',
    content: h('div', null, [
      h(
        'p',
        null,
        `将「${record.name}」的节点白名单推送到该局全部网关机：本次将下发 ${enabledCount} 个启用节点（共 ${record.total_node_count ?? enabledCount} 个节点；全量替换，未启用的节点将从白名单移除）。`,
      ),
      // 下发漂移（openspec: relay-push-drift-preview）：相对快照的将新增/将移除提示
      pushDriftLine(record),
      h(
        'p',
        { style: 'color: var(--muted); font-size: 12px' },
        '该局全部网关机都下发成功才算成功；sshd PermitOpen 腿不随本次下发（由「更多 ▾ → 配置跳板转发」单独配置）。确认后打开执行日志，可实时查看过程。',
      ),
    ]),
    okText: driftOkText(record),
    onOk: () => startExec(record, 'push'),
  })
}

const DRIFT_LIST_LIMIT = 10

function driftFmt(list: string[]): string {
  return list.length > DRIFT_LIST_LIMIT ? `${list.slice(0, DRIFT_LIST_LIMIT).join('、')} 等` : list.join('、')
}

function pushDriftLine(record: RelayGateway): VNode | null {
  const drift = record.push_drift
  if (!drift) {
    return h('p', { style: 'color: var(--muted); font-size: 12px' }, '该区域尚无成功下发记录，本次为首次写入白名单。')
  }
  if (drift.removed.length > 0) {
    return h(
      'p',
      { style: 'color: #d48806; font-size: 12px' },
      `与上次成功下发（${formatDateTime(record.last_pushed_at)}）相比，本次将移除 ${drift.removed.length} 个节点：${driftFmt(drift.removed)}。`,
    )
  }
  if (drift.added.length > 0) {
    return h(
      'p',
      { style: 'color: var(--muted); font-size: 12px' },
      `较上次成功下发将新增 ${drift.added.length} 个节点：${driftFmt(drift.added)}。`,
    )
  }
  return null
}

function driftOkText(record: RelayGateway): string {
  const removed = record.push_drift?.removed.length ?? 0
  return removed > 0 ? `开始下发（将移除 ${removed} 个节点）` : '开始下发'
}

function handleDelete(record: RelayGateway) {
  showOverlayModal({
    title: '删除区域',
    content: h('p', null, `确认删除区域「${record.name}」（${record.code}）？仍被集群挂接时将拒绝删除。`),
    okText: '确认删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteRelayGateway(record.id)
        message.success('区域已删除')
        await refreshAll()
      } catch (e) {
        const msg = getApiErrorMessage(e)
        if (msg.includes('仍被集群挂接') || msg.includes('无法删除')) {
          message.error(`${msg}。请先到【统一管理】或【集群管理】把相关集群的所属区域改为其他区域（或清空）再删除`)
        } else {
          message.error(msg)
        }
      }
    },
  })
}

onMounted(() => {
  void refreshAll()
  document.addEventListener('keydown', onGlobalKeydown)
})

// 离开页面时停掉计时器、主动中止 SSE、移除全局监听，避免后台残留定时器/连接
onUnmounted(() => {
  stopElapsedTimer()
  installStream.cancel()
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style scoped>
.relay-gateways {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 区域列表表格 ── */
.mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px;
}
.table-body {
  padding: 0;
}
.region-table :deep(.ant-table) {
  background: transparent;
}
.region-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 2px solid var(--accent);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 8px;
  white-space: nowrap;
}
.region-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.region-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.region-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
.region-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg);
}
/* 状态列：启用状态 + 健康态两行；nowrap 全表一致（统一标准 #54） */
.region-table :deep(td .status-cell) {
  white-space: nowrap;
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.empty-hint {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}

/* ── 状态列健康态（最近一次体检结果 + 体检时间） ── */
.health-line {
  margin-top: 4px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.health-state {
  cursor: default;
}
.health-state.is-ok {
  color: var(--success, #16a34a);
}
.health-state.is-fail {
  color: var(--danger, #dc2626);
}
.health-state.is-unknown {
  color: var(--muted);
  opacity: 0.75;
}
.health-time {
  color: var(--muted);
  font-size: 11px;
}

/* ── 弹窗表单：标签与输入同行（同 ClickHouse 配置页） ── */
.field-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.field-inline .form-label {
  margin-bottom: 0;
  white-space: nowrap;
}
.field-inline .form-input {
  flex: 1 1 140px;
  min-width: 0;
}

/* ── 体检结果弹窗（单区域 / 全量共用） ── */
.health-result-group {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.health-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.health-result-name {
  font-weight: 600;
}
.health-result-segs {
  list-style: none;
  margin: 0;
  padding: 0;
}
.health-result-segs > li {
  padding: 4px 0;
  border-top: 1px dashed var(--border);
}
.health-result-segs > li:first-child {
  border-top: none;
}
.seg-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.seg-name {
  color: var(--muted);
}
.seg-status {
  font-weight: 600;
}
.seg-ok .seg-status {
  color: var(--success, #16a34a);
}
.seg-fail .seg-status {
  color: var(--danger, #dc2626);
}
.seg-elapsed {
  color: var(--muted);
  font-size: 12px;
}
.seg-notes {
  margin: 4px 0 0;
  padding-left: 16px;
  color: var(--muted);
  font-size: 12px;
  list-style: none;
}

/* ── 配置预览弹窗内容 ── */
.config-hint {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 12px;
}
.config-file {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.config-file-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg);
}
.config-file-path {
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}
.config-file-purpose {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.config-pre {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 240px;
  overflow: auto;
  white-space: pre;
}
.config-notes {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
  padding-left: 18px;
}
.config-notes li {
  margin-bottom: 4px;
}

/* ── relay-gateways-ux-redesign：视觉体系对齐示例页（mockup.html 移植，oklch 令牌取自 theme.css） ── */
.relay-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--accent-bg);
  border: 1px solid oklch(56% 0.16 210 / 28%);
}
.relay-banner .banner-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  margin-top: 1px;
  font-style: normal;
}
.relay-banner .banner-text {
  font-size: 13px;
  line-height: 1.65;
  color: oklch(30% 0.06 230);
}
.relay-banner .banner-text b {
  color: oklch(30% 0.1 220);
}
.relay-banner .banner-text p {
  margin: 2px 0 0;
}
.banner-steps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.bstep {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  background: var(--surface);
  border: 1px solid oklch(56% 0.16 210 / 30%);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
}
.bstep b {
  color: var(--accent);
  font-family: var(--font-mono);
}
.bstep i {
  color: var(--muted);
  font-style: normal;
}
.barrow {
  color: var(--accent);
  font-weight: 600;
  padding: 0 2px;
}

/* 折叠对照表（install-guide 范式） */
.relay-guide {
  margin: 16px 0 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.relay-guide > summary {
  list-style: none;
  cursor: pointer;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}
.relay-guide > summary::-webkit-details-marker {
  display: none;
}
.relay-guide > summary::before {
  content: '▸';
  transition: transform 0.15s;
  font-size: 11px;
}
.relay-guide[open] > summary::before {
  transform: rotate(90deg);
}
.relay-guide .guide-body {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  border-top: 1px dashed var(--border);
  padding: 14px 16px 0;
}
.guide-col h4 {
  font-size: 13px;
  margin: 0 0 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-weight: 700;
}
.guide-col .when {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  margin: 0 0 6px;
}
.guide-col ul {
  padding-left: 16px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
  margin: 0;
}
.guide-col ul b {
  color: var(--fg);
  font-weight: 500;
}
.guide-symptom {
  grid-column: 1 / -1;
  margin: 2px 0 16px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.guide-symptom h5 {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--muted);
}
.guide-symptom table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.guide-symptom td {
  padding: 4px 8px 4px 0;
  vertical-align: top;
  color: var(--muted);
}
.guide-symptom td:first-child {
  color: var(--danger);
  white-space: nowrap;
  padding-right: 16px;
}
.guide-symptom td:last-child b {
  color: var(--accent);
  font-weight: 600;
}

/* 表格：两腿/区域/健康单元格 */
.region-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.region-cell b {
  font-weight: 600;
  color: var(--fg);
  font-size: 13px;
}
.legs-cell {
  display: flex;
  flex-direction: column;
}
.leg-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.leg-line + .leg-line {
  margin-top: 3px;
}
.leg-label {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.8;
  width: 32px;
  flex-shrink: 0;
}
.direct-note {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}
.health-cell {
  display: flex;
  flex-direction: column;
}

/* 菜单二级描述（scoped 属性随 teleport vnode 保留，样式生效） */
/* 弹窗：分组编号圈 + 竖排表单 */
.form-section {
  padding: 12px 0 4px;
}
.form-section + .form-section {
  border-top: 1px dashed var(--border);
}
.form-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}
.form-section-title .sec-no,
.sec-no {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
}
.form-section-desc {
  font-size: 12px;
  color: var(--muted);
  margin: 2px 0 10px;
}
.form-group.label-top {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.form-group.label-top .form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}
.form-group.label-top .form-hint {
  margin-top: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.55;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}
.form-grid .span-2 {
  grid-column: span 2;
}
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-grid .span-2 {
    grid-column: span 1;
  }
}
.form-input.mono-input {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.form-label .optional {
  color: var(--muted);
  font-weight: 400;
  font-size: 11px;
  margin-left: 4px;
}
.cred-modal {
  max-width: 460px;
}
.cred-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.cred-label {
  width: 80px;
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
}
.cred-pass {
  flex: 1;
  word-break: break-all;
}
.cred-loading {
  color: var(--muted);
  font-size: 13px;
  padding: 8px 0;
}
.advanced-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 12px;
  overflow: hidden;
}
.advanced-section > summary {
  list-style: none;
  cursor: pointer;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}
.advanced-section > summary::-webkit-details-marker {
  display: none;
}
.advanced-section > summary::before {
  content: '▸';
  transition: transform 0.15s;
  font-size: 10px;
}
.advanced-section[open] > summary::before {
  transform: rotate(90deg);
}
.advanced-section > summary .adv-tip {
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
  opacity: 0.85;
}
.advanced-section .adv-body {
  padding: 2px 12px 12px;
  border-top: 1px dashed var(--border);
}

/* 表头强化（antd 深度选择） */
.region-table :deep(thead th) {
  background: var(--accent-bg);
  border-bottom: 2px solid var(--accent);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

/* ── 视图切换工具行（relay-region-topology-view D1，mockup 移植） ── */
.viewbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.view-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}
.view-toggle button {
  border: none;
  background: transparent;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--muted);
}
.view-toggle button.on {
  background: var(--accent);
  color: #fff;
}
.topo-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 悬空区域码提示卡（mockup orphan-card 移植） */
.topo-view .code-tag {
  background: var(--accent-bg);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 7px;
  font-weight: 600;
}
.orphan-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid oklch(80% 0.15 85 / 55%);
  background: oklch(80% 0.15 85 / 10%);
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
}
.orphan-card .tag.warn {
  background: oklch(80% 0.15 85 / 22%);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

/* 新建区域虚线卡（点击展开草稿卡，批次三接线） */
.create-card {
  border: 2px dashed oklch(74% 0.02 240);
  border-radius: 10px;
  padding: 22px;
  text-align: center;
  color: var(--muted);
  background: transparent;
  transition: border-color 0.15s;
  cursor: pointer;
}
.create-card:hover {
  border-color: var(--accent);
}
.create-card b {
  font-size: 14px;
}
.create-card .steps {
  font-size: 12px;
  margin-top: 4px;
}

/* ── 新建区域草稿卡（批次三 3.7，mockup .draft-card 移植） ── */
.draft-card {
  border: 2px dashed var(--accent);
  border-radius: 10px;
  padding: 16px 18px 14px;
  background: var(--surface);
}
.draft-card .d-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.draft-card .d-head b {
  font-size: 14px;
  color: var(--fg);
}
.draft-card .d-head .d-hint {
  font-size: 12px;
  color: var(--muted);
}
.draft-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 1fr 0.6fr;
  gap: 10px 12px;
  margin-top: 10px;
}
.draft-grid.two {
  grid-template-columns: 1fr 1.4fr;
}
.draft-grid .pf label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 3px;
}
.draft-grid .pf input {
  width: 100%;
  border: 1px solid oklch(74% 0.02 240);
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 13px;
  font-family: var(--font-mono);
  background: var(--surface);
  color: var(--fg);
}
.draft-grid .pf input.ftext {
  font-family: inherit;
}
.draft-grid .pf input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-bg);
}
.draft-grid .pf .ferr {
  display: none;
  color: var(--danger);
  font-size: 12px;
  margin-top: 3px;
  line-height: 1.5;
}
.draft-grid .pf.invalid input {
  border-color: var(--danger);
}
.draft-grid .pf.invalid .ferr {
  display: block;
}
.draft-card .d-error {
  margin-top: 8px;
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
}
.draft-card .d-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.draft-card .d-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  background: var(--bg);
  border: 1px dashed oklch(74% 0.02 240);
  border-radius: 6px;
  padding: 7px 9px;
}
.draft-card .d-note b {
  color: var(--fg);
  font-weight: 600;
}

/* ── 就地 popover（批次三 3.1 引擎，mockup .pop 移植；Teleport 到 body，
      scoped 属性随 vnode 保留；v-html 注记内的元素无 scope 属性，须 :deep()） ── */
.topo-pop {
  position: fixed;
  z-index: 60;
  width: 330px;
  max-width: calc(100vw - 24px);
  background: var(--surface);
  border: 1px solid oklch(74% 0.02 240);
  border-radius: 10px;
  box-shadow: 0 10px 34px oklch(20% 0.02 240 / 22%);
  padding: 12px 14px;
}
.topo-pop .p-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}
.topo-pop .p-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.topo-pop .pf {
  margin-top: 10px;
}
.topo-pop .pf label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 3px;
}
.topo-pop .pf input,
.topo-pop .pf select {
  width: 100%;
  border: 1px solid oklch(74% 0.02 240);
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 13px;
  font-family: var(--font-mono);
  background: var(--surface);
  color: var(--fg);
}
.topo-pop .pf select,
.topo-pop .pf input.ftext {
  font-family: inherit;
}
.topo-pop .pf input:focus,
.topo-pop .pf select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-bg);
}
.topo-pop .pf .ferr {
  display: none;
  color: var(--danger);
  font-size: 12px;
  margin-top: 3px;
  line-height: 1.5;
}
.topo-pop .pf.invalid input {
  border-color: var(--danger);
}
.topo-pop .pf.invalid .ferr {
  display: block;
}
.topo-pop .p-error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
}
.topo-pop .p-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.topo-pop .p-actions .only-save {
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  margin-right: auto;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.topo-pop .p-actions .only-save:hover {
  color: var(--fg);
}
.topo-pop .p-actions .p-link {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  margin-right: auto;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.topo-pop .p-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  background: var(--bg);
  border: 1px dashed oklch(74% 0.02 240);
  border-radius: 6px;
  padding: 7px 9px;
}
.topo-pop .p-note :deep(b) {
  color: var(--fg);
  font-weight: 600;
}
.topo-pop .p-note :deep(.st-miss) {
  color: var(--warning);
}
</style>
