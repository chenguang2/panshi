<template>
  <div class="card db-backup-card">
    <!-- ═══ 常驻状态操作层（任何 Tab 可见；sticky 化，D2/D6：无大标题） ═══ -->
    <div class="dbb-persistent">
      <div class="dbb-persistent-main">
        <div class="dbb-stats">
          <div class="dbb-stat">
            <div class="dbb-stat-label">最近成功备份</div>
            <div class="dbb-stat-value" :class="{ 'dbb-muted': !lastSuccessAt }">
              {{ lastSuccessAt ? formatDateTime(lastSuccessAt) : '从未备份' }}
            </div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">下一轮预计</div>
            <div class="dbb-stat-value" :class="{ 'dbb-muted': !nextRunText }">{{ nextRunText }}</div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">最近状态</div>
            <div class="dbb-stat-value">
              <span v-if="inProgress" class="badge badge-warning"><span class="dbb-spin"></span>备份进行中</span>
              <span v-else-if="lastStatus" :class="statusBadgeClass(lastStatus)">{{
                statusBadgeText(lastStatus)
              }}</span>
              <span v-else class="dbb-muted">尚未运行</span>
            </div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">定时调度</div>
            <div class="dbb-stat-value">
              <span :class="enabled ? 'badge badge-success' : 'badge badge-neutral'">{{
                enabled ? '已启用' : '未启用'
              }}</span>
            </div>
          </div>
        </div>
        <div class="dbb-persistent-ops">
          <span v-if="statusHint" class="dbb-status-hint">{{ statusHint }}</span>
          <span v-if="pollHint" class="dbb-poll-hint">{{ pollHint }}</span>
          <button
            v-if="isDirty"
            class="dbb-dirty-badge"
            title="有未保存修改，点击返回「策略与保留」"
            @click="goToPolicyTab"
          >
            有未保存修改
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="configLoading" @click="requestRefresh">
            {{ configLoading ? '刷新中…' : '刷新' }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="runDisabled" @click="requestRunNow">
            {{ running ? '备份中…' : '立即备份' }}
          </button>
          <!-- 危险流入口：红色描边（向导内最终「执行恢复」为 btn-danger 实心，形成入口→确认的递进） -->
          <button class="btn btn-danger-outline btn-sm" @click="openWizard">恢复数据…</button>
        </div>
      </div>
      <div v-if="running" class="form-hint dbb-run-expectation">
        正在打包并推送到 {{ enabledTargetCount }} 个启用位置，约需 1–2 分钟，请勿离开页面
      </div>
      <div v-if="config?.last_error" class="dbb-error" :class="{ expanded: errorExpanded }">
        <div
          class="dbb-error-head"
          role="button"
          tabindex="0"
          @click="toggleError"
          @keydown.enter.prevent="toggleError"
          @keydown.space.prevent="toggleError"
        >
          <span class="dbb-error-flag">&#9888;</span>
          <span class="dbb-error-line">{{ errorHead }}</span>
          <span class="dbb-error-toggle">{{ errorExpanded ? '收起' : '展开' }}</span>
        </div>
        <pre v-if="errorExpanded" class="dbb-error-detail">{{ config.last_error }}</pre>
      </div>
    </div>

    <div class="card-body">
      <!-- 适用性空态：注册表中无 SQLite 连接时整卡不适用 -->
      <div v-if="loaded && !applicable" class="empty-state">
        <div class="empty-state-icon">&#128190;</div>
        <p>
          不适用（无已注册的 SQLite 数据库）<template v-if="statusReason">——{{ statusReason }}</template>
        </p>
      </div>

      <template v-else>
        <!-- ═══ Tab 化内容区（D1：a-tabs 默认行为 pane 不销毁；D4：默认「备份位置」，Tab 状态不进 URL） ═══ -->
        <a-tabs v-model:activeKey="activeTab" class="dbb-tabs">
          <a-tab-pane key="targets" tab="备份位置" force-render>
            <!-- ═══ 备份位置 Tab（默认页） ═══ -->
            <div class="dbb-section-title dbb-title-row">
              <span class="dbb-title-row-text">
                备份位置<span class="section-count">{{ targets.length }}</span>
              </span>
              <button class="btn btn-primary btn-sm" @click="openCreateTarget">＋ 新增位置</button>
            </div>
            <div class="dbb-zone-hint">每轮备份将同一备份包推送至所有启用位置；单个位置失败不影响其余位置</div>
            <div v-if="targets.length === 0" class="dbb-target-empty">
              尚未配置备份位置——点击「＋ 新增位置」添加第一个远端目标
            </div>
            <template v-else>
              <div class="table-shell">
                <table class="grid dbb-target-table">
                  <thead>
                    <tr>
                      <th class="col-enable">启用</th>
                      <th>名称</th>
                      <th>地址 : 端口</th>
                      <th>远端目录</th>
                      <th>最近推送</th>
                      <th class="num col-retain">保留份数</th>
                      <th class="col-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in targets" :key="t.id" :class="{ 'row-disabled': !t.enabled }">
                      <td>
                        <label
                          class="toggle dbb-row-toggle"
                          :title="t.enabled ? '停用后该位置不再接收新备份' : '启用后参与每轮备份推送'"
                        >
                          <input
                            type="checkbox"
                            :checked="t.enabled"
                            :disabled="togglingId === t.id"
                            @change="onTargetToggleChange(t, $event)"
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </td>
                      <td class="dbb-tgt-name">{{ t.name }}</td>
                      <td class="mono dbb-tgt-addr">{{ t.host }} : {{ t.port }}</td>
                      <td class="mono dbb-tgt-dir" :title="t.remote_dir">{{ t.remote_dir }}</td>
                      <td class="dbb-tgt-health">
                        <span
                          class="dbb-health-dot"
                          :class="healthDotClass(t.name)"
                          :title="healthTooltip(t.name)"
                        ></span>
                        <span v-if="recentTestText(t.name)" class="cell-meta">测试 {{ recentTestText(t.name) }}</span>
                        <span v-else class="cell-meta t-muted">测试 —</span>
                      </td>
                      <td class="num mono dbb-tgt-retain">{{ t.retain_count }}</td>
                      <td>
                        <div class="table-actions">
                          <button class="btn btn-secondary btn-sm" @click="openEditTarget(t)">编辑</button>
                          <button
                            class="btn btn-secondary btn-sm"
                            :disabled="rowTestingId === t.id"
                            title="仅校验 SSH 连通与凭据，不含目录可写与磁盘空间"
                            @click="testTargetRow(t)"
                          >
                            {{ rowTestingId === t.id ? '测试中…' : '测试' }}
                          </button>
                          <button class="btn btn-danger-outline btn-sm" @click="confirmDeleteTarget(t)">删除</button>
                        </div>
                        <!-- L2：行级测试结果与触发行视觉关联（沿用既有类名供测试断言） -->
                        <div
                          v-if="rowTestResult && rowTestResult.name === t.name"
                          class="dbb-target-testbar"
                          :class="rowTestResult.ok ? 'ok' : 'fail'"
                        >
                          「{{ t.name }}」{{ rowTestResult.ok ? '✓' : '✗' }} {{ rowTestResult.message }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <div class="form-hint dbb-actions-hint">位置的新增 / 编辑在抽屉内完成并独立保存</div>
          </a-tab-pane>
          <a-tab-pane key="policy" tab="策略与保留" force-render>
            <!-- ═══ 策略与保留（原全局配置区；dirty 徽标已上提常驻层） ═══ -->
            <div class="dbb-section-title dbb-title-row">
              <span class="dbb-title-row-text"> 备份配置（全局） </span>
              <button
                class="btn btn-sm"
                :class="isDirty ? 'btn-primary' : 'btn-secondary'"
                :disabled="saving || configLoading"
                @click="handleSave"
              >
                {{ saving ? '保存中…' : '保存全局配置' }}
              </button>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">定时备份</label>
                <div class="dbb-inline-fields">
                  <label class="toggle dbb-toggle">
                    <input type="checkbox" v-model="form.enabled" />
                    <span class="toggle-slider"></span>
                  </label>
                  <span class="dbb-enabled-text">{{ form.enabled ? '启用定时备份' : '停用定时备份' }}</span>
                  <span class="form-hint dbb-inline-hint">「立即备份」不依赖此开关</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">备份间隔（分钟）</label>
                <input
                  v-model.number="form.interval_minutes"
                  type="number"
                  class="form-input dbb-interval-input"
                  min="1"
                  max="10080"
                  placeholder="60"
                />
                <div class="form-hint">建议 5–1440 分钟；上限 10080 分钟（7 天）</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">来源标识</label>
                <a-input
                  v-model:value="form.source_name"
                  class="dbb-source-input"
                  :maxlength="64"
                  placeholder="留空自动解析（保存后回显）"
                />
                <div class="form-hint">
                  多机共享同一备份目录时，各机必须配置唯一标识；首字符须为字母或数字，可用 . _ -，最长 64 字符
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">附加数据段</label>
                <div class="dbb-inline-fields dbb-segments-fields">
                  <label class="checkbox-label dbb-segment-check">
                    <input type="checkbox" v-model="form.include_static" />
                    <span>静态资源</span>
                  </label>
                  <label class="checkbox-label dbb-segment-check">
                    <input type="checkbox" v-model="form.include_task_scripts" />
                    <span>任务脚本</span>
                  </label>
                  <label class="checkbox-label dbb-segment-check">
                    <input type="checkbox" v-model="form.include_task_logs" />
                    <span>任务日志</span>
                  </label>
                </div>
                <div class="form-hint">勾选后一并打包，恢复时将覆盖本机对应目录</div>
              </div>
            </div>
            <div class="dbb-policy-note">
              保留策略按位置生效：每个位置保留最近 N 份备份包，整体可回溯时间跨度 ≈ 份数 × 备份间隔。
              停用位置不参与新推送，但其远端已存在的备份包不受影响。
            </div>
          </a-tab-pane>
          <a-tab-pane key="history" tab="备份历史" force-render>
            <!-- ═══ 历史区 ═══ -->
            <div class="dbb-history">
              <div class="dbb-history-header">
                <h4>备份历史</h4>
                <div class="dbb-hist-toolbar">
                  <span class="dbb-history-count">{{ historyCountText }}</span>
                  <select v-model="historyFilter.status" class="form-input dbb-hist-filter">
                    <option value="all">全部状态</option>
                    <option value="success">成功</option>
                    <option value="partial">部分成功</option>
                    <option value="failed">失败</option>
                  </select>
                  <select v-model="historyFilter.trigger" class="form-input dbb-hist-filter">
                    <option value="all">全部触发</option>
                    <option value="scheduled">定时</option>
                    <option value="manual">手动</option>
                  </select>
                </div>
              </div>
              <div v-if="historyLoading" class="dbb-hist-loading">加载中…</div>
              <div v-else-if="displayedHistory.length === 0" class="dbb-target-empty">
                {{ filterActive ? '没有匹配的备份记录，请调整筛选条件' : '暂无备份历史' }}
              </div>
              <template v-else>
                <div class="table-shell">
                  <table class="grid dbb-hist-table">
                    <thead>
                      <tr>
                        <th class="col-exp"></th>
                        <th>开始时间</th>
                        <th class="col-trigger">触发</th>
                        <th>状态</th>
                        <th>包名</th>
                        <th class="num col-num">大小</th>
                        <th class="num col-num">耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="item in displayedHistory" :key="item.id">
                        <tr>
                          <td>
                            <button
                              v-if="histExpandable(item)"
                              class="exp-toggle"
                              :class="{ open: isHistExpanded(item.id) }"
                              :title="histSubCount(item) > 0 ? '展开详情' : '展开失败原因'"
                              @click="toggleHistExpand(item.id)"
                            >
                              &#9654;
                            </button>
                          </td>
                          <td class="mono t-muted">{{ formatDateTime(item.started_at) }}</td>
                          <td>
                            <span class="dbb-trigger">{{ item.trigger === 'scheduled' ? '定时' : '手动' }}</span>
                          </td>
                          <td class="dbb-hist-status">
                            <span :class="statusBadgeClass(item.status)">{{ statusBadgeText(item.status) }}</span>
                            <span v-if="histSubCount(item) > 0" class="cell-meta dbb-hist-counts"
                              >{{ histOkCount(item) }}/{{ histSubCount(item) }} 目标</span
                            >
                          </td>
                          <td>
                            <span class="dbb-pkgname">{{ item.package_name || '-' }}</span>
                            <button
                              v-if="item.package_name && targets.length > 0"
                              class="btn btn-secondary btn-sm dbb-restore-pkg-btn"
                              @click="openWizardForPackage(item)"
                            >
                              恢复此包
                            </button>
                          </td>
                          <td class="num mono t-muted">
                            {{ item.file_size != null ? formatFileSize(item.file_size) : '-' }}
                          </td>
                          <td class="num mono t-muted">{{ formatDurationMs(item.duration_ms) }}</td>
                        </tr>
                        <tr v-if="isHistExpanded(item.id)" class="expand-row">
                          <td :colspan="7">
                            <div class="hist-expand">
                              <template v-if="item.error">
                                <div class="hist-expand-title">失败原因</div>
                                <pre class="hist-error-detail">{{ item.error }}</pre>
                              </template>
                              <template v-if="histSubCount(item) > 0">
                                <div class="hist-expand-title">分目标结果</div>
                                <ul class="target-results">
                                  <li
                                    v-for="sub in item.targets || []"
                                    :key="sub.target_id ?? sub.target_name"
                                    :class="sub.status === 'success' ? 'tr-ok' : 'tr-fail'"
                                  >
                                    <span class="tr-ico">{{ sub.status === 'success' ? '✓' : '✗' }}</span>
                                    <span class="tr-name">{{ sub.target_name }}</span>
                                    <span class="tr-meta">{{ histSubMeta(sub) }}</span>
                                  </li>
                                </ul>
                              </template>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <div class="dbb-hist-pager">
                  <select
                    v-if="!filterActive"
                    class="form-input dbb-hist-pagesize"
                    :value="historyPageSize"
                    @change="onPageSizeChange"
                  >
                    <option v-for="s in [10, 20, 50]" :key="s" :value="s">{{ s }} 条/页</option>
                  </select>
                  <span v-else class="dbb-hist-pager-info">筛选视图 · {{ FILTER_PAGE_SIZE }} 条/页</span>
                  <button
                    class="btn btn-secondary btn-sm"
                    :disabled="displayPage <= 1 || historyLoading"
                    @click="prevPage"
                  >
                    ‹ 上一页
                  </button>
                  <span class="dbb-hist-pager-info">第 {{ displayPage }} / {{ pageCount }} 页</span>
                  <button
                    class="btn btn-secondary btn-sm"
                    :disabled="displayPage >= pageCount || historyLoading"
                    @click="nextPage"
                  >
                    下一页 ›
                  </button>
                </div>
              </template>
            </div>
          </a-tab-pane>
        </a-tabs>
      </template>
    </div>
  </div>

  <DbBackupRestoreWizard
    v-model:visible="wizardOpen"
    :preselect-package-name="preselectPkgName"
    :preselect-target-id="preselectTargetId"
    @restored="handleRestored"
  />

  <!-- ═══ 新增 / 编辑位置抽屉（470px 右侧） ═══ -->
  <Teleport to="body">
    <div v-if="drawerOpen" class="dbb-drawer-overlay">
      <div class="dbb-drawer-overlay-dim" @click="closeDrawer"></div>
      <aside class="dbb-drawer">
        <div class="dbb-drawer-header">
          <h2>{{ editingTarget ? '编辑备份位置' : '新增备份位置' }}</h2>
          <button class="dbb-drawer-close" @click="closeDrawer">&times;</button>
        </div>
        <div class="dbb-drawer-body">
          <div class="form-group">
            <label class="form-label">名称 <span class="required">*</span></label>
            <input
              v-model="drawerForm.name"
              type="text"
              class="form-input dbb-tf-name"
              maxlength="64"
              placeholder="如 局内DR（允许中文）"
            />
            <div class="form-hint">显示在备份位置列表与历史记录的分目标结果中</div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">地址 <span class="required">*</span></label>
              <input
                v-model="drawerForm.host"
                type="text"
                class="form-input dbb-tf-host"
                placeholder="如 192.168.1.20"
              />
            </div>
            <div class="form-group">
              <label class="form-label">端口</label>
              <input
                v-model.number="drawerForm.port"
                type="number"
                class="form-input dbb-tf-port"
                min="1"
                max="65535"
                placeholder="22"
              />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">用户名 <span class="required">*</span></label>
            <input v-model="drawerForm.username" type="text" class="form-input dbb-tf-username" placeholder="root" />
          </div>
          <div class="form-group">
            <label class="form-label">认证方式</label>
            <select v-model="drawerForm.auth_type" class="form-input dbb-tf-auth">
              <option value="password">密码认证</option>
              <option value="key">密钥认证</option>
            </select>
          </div>
          <div v-if="drawerForm.auth_type === 'password'" class="form-group">
            <label class="form-label">密码</label>
            <a-input-password
              v-model:value="drawerForm.password"
              class="dbb-tf-password"
              :placeholder="editingTarget?.has_password ? '已设置，留空表示不修改' : '请输入 SSH 密码'"
              autocomplete="new-password"
            />
          </div>
          <div v-else class="form-group">
            <label class="form-label">私钥路径</label>
            <input
              v-model="drawerForm.key_path"
              type="text"
              class="form-input dbb-tf-keypath"
              placeholder="/root/.ssh/id_ed25519"
            />
          </div>
          <div class="form-group">
            <label class="form-label">远端目录 <span class="required">*</span></label>
            <input
              v-model="drawerForm.remote_dir"
              type="text"
              class="form-input dbb-tf-dir"
              placeholder="/srv/panshi-dr"
            />
            <div class="form-hint">备份包推送到该目录并按保留份数滚动清理</div>
          </div>
          <div class="form-group">
            <label class="form-label">保留份数</label>
            <input
              v-model.number="drawerForm.retain_count"
              type="number"
              class="form-input dbb-tf-retain"
              min="1"
              placeholder="7"
            />
            <div class="form-hint">
              时间跨度 ≈ 份数 × 间隔（当前间隔 {{ form.interval_minutes || '?' }} 分钟）；仅清理本来源标识的备份包
            </div>
          </div>
          <div v-if="drawerError" class="dbb-drawer-error">{{ drawerError }}</div>
          <div class="form-hint dbb-drawer-test-hint">
            「测试连接」仅校验 SSH 连通与凭据正确性，不校验远端目录可写性与磁盘空间
          </div>
          <div v-if="drawerTestResult" class="dbb-drawer-testbar" :class="drawerTestResult.ok ? 'ok' : 'fail'">
            {{ drawerTestResult.ok ? '✓ ' : '✗ ' }}{{ drawerTestResult.message }}
          </div>
        </div>
        <div class="dbb-drawer-footer">
          <button class="btn btn-secondary" @click="closeDrawer">取消</button>
          <button class="btn btn-secondary" :disabled="drawerTesting" @click="testTargetDrawer">
            {{ drawerTesting ? '测试中…' : '测试连接' }}
          </button>
          <button class="btn btn-primary" :disabled="drawerSaving" @click="saveTarget">
            {{ drawerSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </aside>
    </div>
  </Teleport>

  <!-- ═══ 立即备份三选确认（脏状态守卫 H2，视图级内联弹窗） ═══ -->
  <Teleport to="body">
    <div v-if="runConfirmOpen" class="modal-overlay dbb-runconfirm-overlay">
      <div class="modal dbb-run-confirm">
        <div class="modal-header">
          <h2>有未保存的修改</h2>
          <button class="modal-close" @click="cancelRunConfirm">&times;</button>
        </div>
        <div class="modal-body">
          <p class="dbb-run-confirm-desc">当前全局配置有未保存修改，「立即备份」按服务端已保存配置执行。请选择：</p>
          <ul class="dbb-run-confirm-list">
            <li>保存并备份——先保存当前修改，再按新配置执行</li>
            <li>按已保存配置备份——忽略屏幕上的未保存修改</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="cancelRunConfirm">取消</button>
          <button class="btn btn-secondary" :disabled="saving" @click="runWithSavedConfig">按已保存配置备份</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveThenRun">保存并备份</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ═══ 立即备份结果弹窗（每目标子结果） ═══ -->
  <Teleport to="body">
    <div v-if="runResult" class="modal-overlay dbb-runmodal-overlay">
      <div class="modal dbb-runmodal">
        <div class="modal-header">
          <h2>备份结果</h2>
          <button class="modal-close" @click="closeRunResult">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dbb-runmodal-summary">
            <span :class="statusBadgeClass(runResult.status)">{{ statusBadgeText(runResult.status) }}</span>
            <span v-if="runSubCount(runResult) > 0" class="cell-meta dbb-hist-counts"
              >{{ runOkCount(runResult) }}/{{ runSubCount(runResult) }} 目标</span
            >
            <span v-if="runResult.duration_ms != null" class="cell-meta"
              >耗时 {{ formatDurationMs(runResult.duration_ms) }}</span
            >
            <span v-if="runResult.file_size != null" class="cell-meta">{{ formatFileSize(runResult.file_size) }}</span>
          </div>
          <div v-if="runResult.package_name" class="dbb-runmodal-pkg mono">{{ runResult.package_name }}</div>
          <div v-if="runSubCount(runResult) > 0" class="hist-expand">
            <div class="hist-expand-title">分目标结果</div>
            <ul class="target-results">
              <li
                v-for="sub in runResult.targets || []"
                :key="sub.target_id ?? sub.target_name"
                :class="sub.status === 'success' ? 'tr-ok' : 'tr-fail'"
              >
                <span class="tr-ico">{{ sub.status === 'success' ? '✓' : '✗' }}</span>
                <span class="tr-name">{{ sub.target_name }}</span>
                <span class="tr-meta">{{ histSubMeta(sub) }}</span>
              </li>
            </ul>
          </div>
          <div v-else-if="runResult.error" class="dbb-runmodal-error">{{ runResult.error }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="closeRunResult">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import DbBackupRestoreWizard from '@/components/DbBackupRestoreWizard.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { formatDateTime, formatFileSize } from '@/utils/format'
import {
  getDbBackupConfig,
  updateDbBackupConfig,
  runDbBackupNow,
  getDbBackupHistory,
  createDbBackupTarget,
  updateDbBackupTarget,
  deleteDbBackupTarget,
  testDbBackupTarget,
} from '@/api/dbBackup'
import type {
  DbBackupConfig,
  DbBackupHistoryItem,
  DbBackupHistoryPage,
  DbBackupHistoryTargetItem,
  DbBackupRunResult,
  DbBackupStatusInfo,
  DbBackupTarget,
  DbBackupTargetCreate,
} from '@/types/dbBackup'

const props = defineProps<{
  /** 深链入口：路由 query wizard=1 时挂载即打开恢复向导（「灾难恢复」入口直达） */
  initialWizard?: boolean
}>()

// ── 配置与状态 ──
const config = ref<DbBackupConfig | null>(null)
const configLoading = ref(false)
const loaded = ref(false)
const errorExpanded = ref(false)
// ── Tab 化（D4）：页内三内容页，默认「备份位置」；Tab 状态不进 URL ──
const activeTab = ref<'targets' | 'policy' | 'history'>('targets')

/** D2：常驻层 dirty 徽标点击跳回「策略与保留」Tab（pane 不销毁，表单态保留，无拦截弹窗） */
function goToPolicyTab(): void {
  activeTab.value = 'policy'
}

const wizardOpen = ref(false)

/** 全局表单（目标连接字段已迁移至位置表，此处仅全局策略） */
const form = reactive({
  enabled: false,
  interval_minutes: 60 as number | '',
  source_name: '',
  include_static: false,
  include_task_scripts: false,
  include_task_logs: false,
})

/** 已保存快照（H1：状态区展示与 dirty 判定的唯一基准；applyConfigToForm 同步刷新） */
const saved = reactive({
  enabled: false,
  interval_minutes: 60,
  source_name: '',
  include_static: false,
  include_task_scripts: false,
  include_task_logs: false,
})

/** H1/M12：dirty = 表单与已保存快照的归一化差异（来源标识 trim 后比较） */
const isDirty = computed(() => {
  return (
    form.enabled !== saved.enabled ||
    toInt(form.interval_minutes, -1) !== saved.interval_minutes ||
    form.source_name.trim() !== saved.source_name ||
    form.include_static !== saved.include_static ||
    form.include_task_scripts !== saved.include_task_scripts ||
    form.include_task_logs !== saved.include_task_logs
  )
})

const targets = computed<DbBackupTarget[]>(() => config.value?.targets ?? [])
const enabledTargetCount = computed(() => targets.value.filter((t) => t.enabled).length)

const applicable = computed(() => status.value?.applicable ?? true)
/** 状态区展示的是已保存的启用状态（表单开关是未保存的编辑值，两者分离） */
const enabled = computed(() => !!config.value?.enabled)
const statusReason = computed(() => status.value?.reason || '')
const inProgress = computed(() => status.value?.in_progress || false)
const lastSuccessAt = computed(() => config.value?.last_success_at || null)
const lastStatus = computed(() => config.value?.last_status || null)
const running = computed(() => runLoading.value || inProgress.value)
const runDisabled = computed(() => running.value || configLoading.value)

/** status.reason 同时承载「不适用原因」与「启用但配置不完整」两种语义，均作为提示展示 */
const statusHint = computed(() => {
  if (!status.value || !applicable.value) return ''
  return status.value.reason || ''
})

const nextRunText = computed(() => {
  // H1：状态区单一数据源——只读已保存配置与 status，不受未保存表单修改影响
  if (!enabled.value) return '—'
  const next = status.value?.next_run_at
  if (next) return formatDateTime(next)
  return '启用后 30 秒内首备'
})

const errorHead = computed(() => {
  const err = config.value?.last_error || ''
  return err.length > 120 ? err.slice(0, 120) + '…' : err
})

// ── 备份历史（服务端分页） ──
const history = ref<DbBackupHistoryPage>({ total: 0, page: 1, page_size: 10, items: [] })
const historyLoading = ref(false)
const historyPage = ref(1)
const historyPageSize = ref(10)
const expandedHistIds = ref<number[]>([])

const totalPages = computed(() => Math.max(1, Math.ceil(history.value.total / historyPageSize.value)))

/** 筛选/服务端两种分页口径的统一展示值（M5） */
const displayPage = computed(() => (filterActive.value ? filteredPage.value : historyPage.value))
const pageCount = computed(() => (filterActive.value ? filteredTotalPages.value : totalPages.value))

// ── 操作进行中标记 ──
const saving = ref(false)
const runLoading = ref(false)
const runConfirmOpen = ref(false)
const status = ref<DbBackupStatusInfo | null>(null)

// ── 位置抽屉 ──
const drawerOpen = ref(false)
const editingTarget = ref<DbBackupTarget | null>(null)
const drawerError = ref('')
const drawerSaving = ref(false)
const drawerTesting = ref(false)
const drawerTestResult = ref<{ ok: boolean; message: string } | null>(null)

const drawerForm = reactive({
  name: '',
  host: '',
  port: 22 as number | '',
  username: '',
  auth_type: 'password' as 'password' | 'key',
  password: '',
  key_path: '',
  remote_dir: '',
  retain_count: 7 as number | '',
  enabled: true,
})

// ── 位置行级操作 ──
const togglingId = ref<number | null>(null)
const rowTestingId = ref<number | null>(null)
const rowTestResult = ref<{ name: string; ok: boolean; message: string } | null>(null)

// ── 立即备份结果弹窗 ──
const runResult = ref<DbBackupRunResult | null>(null)

/** 取后端 detail（422 校验/409 冲突），取不到时用 fallback */
function errDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}

function toInt(v: number | string | null | undefined, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function statusBadgeClass(s: string): string {
  if (s === 'success') return 'badge badge-success'
  if (s === 'partial') return 'badge badge-warning'
  if (s === 'failed') return 'badge badge-danger'
  if (s === 'running') return 'badge badge-info'
  return 'badge badge-neutral'
}

function statusBadgeText(s: string): string {
  const labels: Record<string, string> = { success: '成功', partial: '部分成功', failed: '失败', running: '进行中' }
  return labels[s] || s
}

/** 耗时（毫秒）人类可读：<1s 显示 ms，<60s 显示秒，否则分秒 */
function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m} 分 ${String(s).padStart(2, '0')} 秒` : `${m} 分`
}

/** 子结果 meta：成功显示耗时，失败显示原因 + 耗时 */
function histSubMeta(sub: DbBackupHistoryTargetItem): string {
  const parts: string[] = []
  if (sub.status === 'failed') parts.push(sub.error || '未知错误')
  if (sub.duration_ms != null) parts.push(formatDurationMs(sub.duration_ms))
  return parts.join(' · ')
}

function histSubCount(item: { targets?: DbBackupHistoryTargetItem[] | null }): number {
  return item.targets?.length ?? 0
}

/** M5：有子结果或带失败原因的行均可展开（构建阶段失败不再只靠 hover title） */
function histExpandable(item: DbBackupHistoryItem): boolean {
  return histSubCount(item) > 0 || !!item.error
}

function histOkCount(item: { targets?: DbBackupHistoryTargetItem[] | null }): number {
  return (item.targets || []).filter((s) => s.status === 'success').length
}

function runSubCount(r: DbBackupRunResult): number {
  return r.targets?.length ?? 0
}

function runOkCount(r: DbBackupRunResult): number {
  return (r.targets || []).filter((s) => s.status === 'success').length
}

function isHistExpanded(id: number): boolean {
  return expandedHistIds.value.includes(id)
}

function toggleHistExpand(id: number): void {
  expandedHistIds.value = isHistExpanded(id)
    ? expandedHistIds.value.filter((i) => i !== id)
    : [...expandedHistIds.value, id]
}

function toggleError(): void {
  errorExpanded.value = !errorExpanded.value
}

async function loadConfig(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!opts.silent) configLoading.value = true
  try {
    const res = await getDbBackupConfig()
    config.value = res.data.config
    status.value = res.data.status
    applyConfigToForm(res.data.config)
    return true
  } catch (err: unknown) {
    // 静默模式（轮询）不弹 toast，由 pollHint 内联降级提示（M9）
    if (!opts.silent) message.error(errDetail(err, '读取备份配置失败'))
    return false
  } finally {
    if (!opts.silent) configLoading.value = false
    loaded.value = true
  }
}

function applyConfigToForm(cfg: DbBackupConfig): void {
  form.enabled = !!cfg.enabled
  form.interval_minutes = cfg.interval_minutes ?? 60
  form.source_name = cfg.source_name || ''
  form.include_static = !!cfg.include_static
  form.include_task_scripts = !!cfg.include_task_scripts
  form.include_task_logs = !!cfg.include_task_logs
  // H1：同步已保存快照（状态区与 dirty 基准）
  saved.enabled = !!cfg.enabled
  saved.interval_minutes = cfg.interval_minutes ?? 60
  saved.source_name = cfg.source_name || ''
  saved.include_static = !!cfg.include_static
  saved.include_task_scripts = !!cfg.include_task_scripts
  saved.include_task_logs = !!cfg.include_task_logs
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const res = await getDbBackupHistory(historyPage.value, historyPageSize.value)
    history.value = res.data
  } catch (err: unknown) {
    message.error(errDetail(err, '读取备份历史失败'))
  } finally {
    historyLoading.value = false
  }
}

// ── M5：历史筛选（后端无筛选参数；后端 page_size 上限 100，必要时翻页补齐至 200 上限） ──
const FILTER_PAGE_SIZE = 20
const FILTER_FETCH_LIMIT = 200
const FILTER_PAGE_REQUEST = 100
const historyFilter = reactive<{ status: string; trigger: string }>({ status: 'all', trigger: 'all' })
const filteredPool = ref<DbBackupHistoryItem[] | null>(null)
const filteredPage = ref(1)

const filterActive = computed(() => historyFilter.status !== 'all' || historyFilter.trigger !== 'all')

watch(
  () => [historyFilter.status, historyFilter.trigger] as const,
  () => {
    historyPage.value = 1
    filteredPage.value = 1
    if (!filterActive.value) {
      filteredPool.value = null
      void loadHistory()
      return
    }
    void loadFilteredHistory()
  },
)

async function loadFilteredHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const first = await getDbBackupHistory(1, FILTER_PAGE_REQUEST)
    const items = [...first.data.items]
    const total = first.data.total
    // 后端 page_size ≤ 100：total 超过单页时翻页补齐，总上限 200（与筛选视图性能预算一致）
    const maxFetch = Math.min(total, FILTER_FETCH_LIMIT)
    let page = 2
    while (items.length < maxFetch) {
      const res = await getDbBackupHistory(page, FILTER_PAGE_REQUEST)
      if (!res.data.items.length) break
      items.push(...res.data.items)
      page += 1
    }
    filteredPool.value = items
  } catch (err: unknown) {
    message.error(errDetail(err, '读取备份历史失败'))
    filteredPool.value = []
  } finally {
    historyLoading.value = false
  }
}

const filteredMatches = computed<DbBackupHistoryItem[]>(() => {
  const items = filteredPool.value || []
  return items.filter((it) => {
    if (historyFilter.status !== 'all' && it.status !== historyFilter.status) return false
    if (historyFilter.trigger !== 'all' && it.trigger !== historyFilter.trigger) return false
    return true
  })
})

const filteredTotalPages = computed(() => Math.max(1, Math.ceil(filteredMatches.value.length / FILTER_PAGE_SIZE)))

/** 筛选视图：客户端分页展示匹配记录 */
const displayedHistory = computed<DbBackupHistoryItem[]>(() => {
  if (!filterActive.value) return history.value.items
  const start = (filteredPage.value - 1) * FILTER_PAGE_SIZE
  return filteredMatches.value.slice(start, start + FILTER_PAGE_SIZE)
})

const historyCountText = computed(() =>
  filterActive.value ? `${filteredMatches.value.length} 条匹配` : `${history.value.total} 条`,
)

/** M8：从历史行发起恢复——记录预选包名并打开向导 */
const preselectPkgName = ref<string | null>(null)
/** 历史直达：该包首个成功位置 id（向导开门即自动列包；null = 通用入口 */
const preselectTargetId = ref<number | null>(null)

function openWizardForPackage(item: DbBackupHistoryItem): void {
  if (!item.package_name) return
  preselectPkgName.value = item.package_name
  preselectTargetId.value = item.targets?.find((t) => t.status === 'success')?.target_id ?? null
  wizardOpen.value = true
}

function refreshAll(): void {
  void loadConfig()
  void loadHistory()
}

function prevPage(): void {
  if (filterActive.value) {
    if (filteredPage.value > 1) filteredPage.value -= 1
    return
  }
  if (historyPage.value <= 1) return
  historyPage.value -= 1
  void loadHistory()
}

function nextPage(): void {
  if (filterActive.value) {
    if (filteredPage.value < filteredTotalPages.value) filteredPage.value += 1
    return
  }
  if (historyPage.value >= totalPages.value) return
  historyPage.value += 1
  void loadHistory()
}

function onPageSizeChange(e: Event): void {
  const val = Number((e.target as HTMLSelectElement).value)
  historyPageSize.value = Number.isFinite(val) && val > 0 ? val : 10
  historyPage.value = 1
  void loadHistory()
}

async function performSave(): Promise<boolean> {
  const interval = toInt(form.interval_minutes, 0)
  if (interval < 1) {
    message.error('备份间隔必须为不小于 1 的分钟数')
    return false
  }
  if (interval > 10080) {
    message.error('备份间隔不能超过 10080 分钟（7 天）')
    return false
  }
  saving.value = true
  try {
    const payload = {
      enabled: form.enabled,
      interval_minutes: interval,
      // 留空 = null：后端自动解析来源标识并随响应回显
      source_name: form.source_name.trim() || null,
      include_static: form.include_static,
      include_task_scripts: form.include_task_scripts,
      include_task_logs: form.include_task_logs,
    }
    const res = await updateDbBackupConfig(payload)
    config.value = res.data.config
    status.value = res.data.status
    applyConfigToForm(res.data.config)
    message.success('全局配置已保存')
    if (res.data.config.enabled && !res.data.config.last_success_at) {
      message.info('已启用，30 秒内将自动执行首次备份')
    }
    return true
  } catch (err: unknown) {
    message.error(errDetail(err, '保存失败，请检查配置'))
    return false
  } finally {
    saving.value = false
  }
}

async function handleSave(): Promise<void> {
  // M7：清空来源标识 = 后端强制重解析并变更身份，旧标识包脱离保留清理，需风险确认
  if (needsSourceClearConfirm()) {
    const ok = await new Promise<boolean>((resolve) => {
      showOverlayModal({
        title: '清空来源标识',
        content: `保存后将重新自动解析来源标识（当前「${saved.source_name}」）。来源标识变更后，旧标识的历史备份包将脱离本机的保留清理（不再自动滚动删除），需要时请手工处理。确定继续保存？`,
        okText: '继续保存',
        okDanger: true,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!ok) return
  }
  await performSave()
}

/** M7 触发条件：已保存过来源标识且表单被清空 */
function needsSourceClearConfirm(): boolean {
  return !!saved.source_name && form.source_name.trim() === ''
}

/** M6：存在未保存修改时刷新需确认丢弃 */
function requestRefresh(): void {
  if (isDirty.value) {
    showOverlayModal({
      title: '刷新将丢弃未保存修改',
      content: '当前有未保存的全局配置修改，刷新后表单将恢复为已保存配置。确定刷新？',
      okText: '丢弃并刷新',
      okDanger: true,
      onOk: () => {
        refreshAll()
      },
    })
    return
  }
  refreshAll()
}

// ── 位置抽屉逻辑 ──

/** 位置名称校验：非空、≤64、不含文件系统保留字符与控制字符、首尾无空白（允许中文） */
function targetNameError(name: string): string | null {
  if (!name.trim()) return '名称不能为空'
  if (name.length > 64) return '名称最长 64 字符'
  if (name !== name.trim()) return '名称首尾不能有空白'
  // eslint-disable-next-line no-control-regex -- 控制字符区间为有意的校验目标（对齐后端名称校验）
  if (/[/\\:*?"<>|\u0000-\u001f]/.test(name)) return '名称不能包含 / \\ : * ? " < > | 与控制字符'
  return null
}

function resetDrawerForm(): void {
  drawerForm.name = ''
  drawerForm.host = ''
  drawerForm.port = 22
  drawerForm.username = 'root'
  drawerForm.auth_type = 'password'
  drawerForm.password = ''
  drawerForm.key_path = ''
  drawerForm.remote_dir = ''
  drawerForm.retain_count = 7
  drawerForm.enabled = true
}

function openCreateTarget(): void {
  editingTarget.value = null
  resetDrawerForm()
  drawerError.value = ''
  drawerTestResult.value = null
  drawerOpen.value = true
}

function openEditTarget(t: DbBackupTarget): void {
  editingTarget.value = t
  drawerForm.name = t.name
  drawerForm.host = t.host
  drawerForm.port = t.port ?? 22
  drawerForm.username = t.username
  drawerForm.auth_type = t.auth_type === 'key' ? 'key' : 'password'
  drawerForm.password = ''
  drawerForm.key_path = t.key_path || ''
  drawerForm.remote_dir = t.remote_dir
  drawerForm.retain_count = t.retain_count ?? 7
  drawerForm.enabled = t.enabled
  drawerError.value = ''
  drawerTestResult.value = null
  drawerOpen.value = true
}

function closeDrawer(): void {
  if (drawerSaving.value || drawerTesting.value) return
  drawerOpen.value = false
}

function drawerPayload(): DbBackupTargetCreate {
  return {
    name: drawerForm.name.trim(),
    host: drawerForm.host.trim(),
    port: toInt(drawerForm.port, 22),
    username: drawerForm.username.trim(),
    auth_type: drawerForm.auth_type,
    ...(drawerForm.auth_type === 'password' && drawerForm.password ? { password: drawerForm.password } : {}),
    key_path: drawerForm.auth_type === 'key' ? drawerForm.key_path.trim() || null : null,
    remote_dir: drawerForm.remote_dir.trim(),
    retain_count: toInt(drawerForm.retain_count, 0),
    enabled: drawerForm.enabled,
  }
}

async function saveTarget(): Promise<void> {
  const nameErr = targetNameError(drawerForm.name)
  if (nameErr) {
    drawerError.value = nameErr
    return
  }
  if (!drawerForm.host.trim()) {
    drawerError.value = '地址不能为空'
    return
  }
  if (!drawerForm.username.trim()) {
    drawerError.value = '用户名不能为空'
    return
  }
  if (!drawerForm.remote_dir.trim()) {
    drawerError.value = '远端目录不能为空'
    return
  }
  if (toInt(drawerForm.retain_count, 0) < 1) {
    drawerError.value = '保留份数必须不小于 1'
    return
  }
  drawerError.value = ''
  drawerSaving.value = true
  try {
    const payload = drawerPayload()
    if (editingTarget.value) {
      await updateDbBackupTarget(editingTarget.value.id, payload)
      message.success('备份位置已更新')
    } else {
      await createDbBackupTarget(payload)
      message.success('备份位置已新增')
    }
    drawerOpen.value = false
    await loadConfig()
  } catch (err: unknown) {
    drawerError.value = errDetail(err, '保存失败，请检查配置')
  } finally {
    drawerSaving.value = false
  }
}

async function testTargetDrawer(): Promise<void> {
  if (!drawerForm.host.trim()) {
    drawerError.value = '请先填写地址再测试'
    return
  }
  drawerError.value = ''
  drawerTesting.value = true
  drawerTestResult.value = null
  try {
    const p = drawerPayload()
    const res = await testDbBackupTarget({
      host: p.host,
      port: p.port,
      username: p.username,
      auth_type: p.auth_type,
      ...(p.password ? { password: p.password } : {}),
      ...(p.key_path ? { key_path: p.key_path } : {}),
      remote_dir: p.remote_dir || null,
    })
    drawerTestResult.value = { ok: res.data.ok, message: res.data.message }
  } catch (err: unknown) {
    drawerTestResult.value = { ok: false, message: errDetail(err, '测试失败') }
  } finally {
    drawerTesting.value = false
  }
}

// ── 位置行级操作 ──

/** H5：位置健康信号——从已加载 history 的位置子结果按名称快照聚合（items 最新在前，首个出现 = 最新） */
interface TargetHealth {
  pushOk: boolean
  pushAt: string | null
  pushError: string | null
}

const targetHealth = computed<Map<string, TargetHealth>>(() => {
  const map = new Map<string, TargetHealth>()
  for (const item of history.value.items) {
    for (const sub of item.targets || []) {
      if (!map.has(sub.target_name)) {
        map.set(sub.target_name, {
          pushOk: sub.status === 'success',
          pushAt: item.started_at,
          pushError: sub.error,
        })
      }
    }
  }
  return map
})

/** 最近一次行级测连结果（前端会话内暂存，按位置名） */
const recentTests = ref<Map<string, { ok: boolean; message: string }>>(new Map())

function healthDotClass(name: string): string {
  const h = targetHealth.value.get(name)
  if (!h) return 'none'
  return h.pushOk ? 'ok' : 'fail'
}

function healthTooltip(name: string): string {
  const h = targetHealth.value.get(name)
  if (!h) return '最近推送：暂无记录（当前已加载历史内）'
  const outcome = h.pushOk ? '成功' : `失败${h.pushError ? `：${h.pushError}` : ''}`
  return `最近推送：${h.pushAt ? formatDateTime(h.pushAt) : '—'} · ${outcome}`
}

function recentTestText(name: string): string {
  const e = recentTests.value.get(name)
  return e ? `${e.ok ? '✓' : '✗'} ${e.message}` : ''
}

function recordRecentTest(name: string, ok: boolean, msg: string): void {
  const next = new Map(recentTests.value)
  next.set(name, { ok, message: msg })
  recentTests.value = next
}

function targetToPayload(t: DbBackupTarget): DbBackupTargetCreate {
  return {
    name: t.name,
    host: t.host,
    port: t.port,
    username: t.username,
    auth_type: t.auth_type,
    key_path: t.key_path,
    remote_dir: t.remote_dir,
    retain_count: t.retain_count,
    enabled: t.enabled,
  }
}

async function toggleTargetEnabled(t: DbBackupTarget, enabled: boolean): Promise<void> {
  togglingId.value = t.id
  try {
    await updateDbBackupTarget(t.id, { ...targetToPayload(t), enabled })
    await loadConfig()
  } catch (err: unknown) {
    message.error(errDetail(err, '切换启用状态失败'))
    await loadConfig()
  } finally {
    togglingId.value = null
  }
}

/** M10：停用位置 = 容灾能力降级，需确认；启用方向直通 */
function onTargetToggleChange(t: DbBackupTarget, e: Event): void {
  const checked = (e.target as HTMLInputElement).checked
  if (t.enabled && !checked) {
    showOverlayModal({
      title: '停用备份位置',
      content: `停用「${t.name}」后，该位置将不再接收新备份，容灾能力下降（远端已有的备份包不受影响）。确定停用？`,
      okText: '停用',
      okDanger: true,
      onOk: () => {
        void toggleTargetEnabled(t, false)
      },
    })
    return
  }
  void toggleTargetEnabled(t, true)
}

async function testTargetRow(t: DbBackupTarget): Promise<void> {
  rowTestingId.value = t.id
  rowTestResult.value = null
  try {
    const res = await testDbBackupTarget({
      host: t.host,
      port: t.port,
      username: t.username,
      auth_type: t.auth_type,
      key_path: t.key_path,
      remote_dir: t.remote_dir,
    })
    rowTestResult.value = { name: t.name, ok: res.data.ok, message: res.data.message }
    recordRecentTest(t.name, res.data.ok, res.data.message)
  } catch (err: unknown) {
    const msg = errDetail(err, '测试失败')
    rowTestResult.value = { name: t.name, ok: false, message: msg }
    recordRecentTest(t.name, false, msg)
  } finally {
    rowTestingId.value = null
  }
}

function confirmDeleteTarget(t: DbBackupTarget): void {
  showOverlayModal({
    title: '删除备份位置',
    content: `确定删除「${t.name}」吗？该位置将不再接收备份；其远端目录中已有的备份包不会被清理（搁浅语义，需要时请手工处理）。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteDbBackupTarget(t.id)
        message.success('备份位置已删除')
        await loadConfig()
      } catch (err: unknown) {
        message.error(errDetail(err, '删除失败'))
      }
    },
  })
}

async function doRunNow(): Promise<void> {
  runLoading.value = true
  try {
    const res = await runDbBackupNow()
    runResult.value = res.data
    await loadConfig()
    await loadHistory()
  } catch (err: unknown) {
    // 409 冲突等场景优先透传后端 detail（如「已有备份/恢复任务进行中，请稍后再试」），不静默
    message.error(errDetail(err, '备份触发失败，请稍后重试'))
    await loadConfig()
  } finally {
    runLoading.value = false
  }
}

/** H2：立即备份守卫——存在未保存修改时先弹三选确认 */
function requestRunNow(): void {
  if (running.value || configLoading.value) return
  if (isDirty.value) {
    runConfirmOpen.value = true
    return
  }
  void doRunNow()
}

function cancelRunConfirm(): void {
  if (saving.value) return
  runConfirmOpen.value = false
}

async function runWithSavedConfig(): Promise<void> {
  if (saving.value) return
  runConfirmOpen.value = false
  message.info('将按服务端已保存配置执行备份，屏幕上的未保存修改不会生效')
  await doRunNow()
}

async function saveThenRun(): Promise<void> {
  if (saving.value) return
  const ok = await performSave()
  runConfirmOpen.value = false
  if (ok) await doRunNow()
}

function closeRunResult(): void {
  runResult.value = null
}

function openWizard(): void {
  preselectPkgName.value = null
  preselectTargetId.value = null
  wizardOpen.value = true
}

/** 恢复成功后：本页数据已整体变化，刷新可见状态 */
function handleRestored(): void {
  void loadConfig()
  void loadHistory()
}

// ── 轮询策略（M9）：执行期 5s 静默降级轮询；空闲期 60s 兜底轻刷 status（两者互斥） ──
let pollTimer: ReturnType<typeof setInterval> | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null
const pollFailCount = ref(0)
const pollFailedNow = ref(false)
const pollDegraded = ref(false)

const pollHint = computed(() => {
  if (pollDegraded.value) return '自动刷新已暂停（连续失败），请点击「刷新」手动更新'
  if (pollFailedNow.value) return '状态刷新失败，正在重试…'
  return ''
})

async function pollTick(): Promise<void> {
  const ok = await loadConfig({ silent: true })
  if (!ok) {
    pollFailCount.value += 1
    pollFailedNow.value = true
    if (pollFailCount.value >= 3) {
      stopPolling()
      pollDegraded.value = true
    }
    return
  }
  pollFailCount.value = 0
  pollFailedNow.value = false
  if (!inProgress.value) {
    await loadHistory()
  }
}

function startPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void pollTick()
  }, 5000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 兜底轮询：仅页面可见且无执行中任务时轻刷 status，让定时备份完成自动反映 */
async function idleTick(): Promise<void> {
  if (document.visibilityState !== 'visible') return
  if (inProgress.value || running.value) return
  await loadConfig({ silent: true })
}

function startIdlePolling(): void {
  if (idleTimer) return
  idleTimer = setInterval(() => {
    void idleTick()
  }, 60000)
}

function stopIdlePolling(): void {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}

watch(inProgress, (busy) => {
  if (busy) {
    startPolling()
  } else {
    stopPolling()
  }
})

onMounted(() => {
  refreshAll()
  startIdlePolling()
  if (props.initialWizard) wizardOpen.value = true
})

// 深链参数在挂载后才出现（同页 query 变化）时也打开向导
watch(
  () => props.initialWizard,
  (v) => {
    if (v) wizardOpen.value = true
  },
)

onUnmounted(() => {
  stopPolling()
  stopIdlePolling()
})
</script>

<style scoped>
/* ── 状态区：四格统计条 ── */
.dbb-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--bg);
  overflow: hidden;
}
.dbb-stat {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--border);
}
.dbb-stat:last-child {
  border-right: none;
}
.dbb-stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dbb-stat-value {
  font-size: 13px;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.dbb-muted {
  color: var(--muted);
}
.dbb-spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border);
  border-top-color: var(--warning);
  border-radius: 50%;
  animation: dbb-rotate 0.8s linear infinite;
  display: inline-block;
}
@keyframes dbb-rotate {
  to {
    transform: rotate(360deg);
  }
}
.dbb-status-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--warning);
}

/* ── H1 dirty 徽标 / H2 运行预期 / M9 轮询提示 / H2 三选弹窗 ── */
.dbb-dirty-badge {
  font-size: 11px;
  line-height: 1;
  color: oklch(50% 0.13 85);
  background: oklch(70% 0.15 85 / 12%);
  border: 1px solid oklch(70% 0.15 85 / 45%);
  border-radius: 999px;
  padding: 3px 9px;
  margin-left: 8px;
  font-weight: 500;
}
.dbb-run-expectation {
  margin-left: 4px;
}
.dbb-poll-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.dbb-run-confirm {
  max-width: 480px;
}
.dbb-run-confirm-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--fg);
}
.dbb-run-confirm-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── H5 健康列 ── */
.dbb-tgt-health {
  white-space: nowrap;
}
.dbb-health-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.dbb-health-dot.ok {
  background: var(--success);
  box-shadow: 0 0 0 3px oklch(55% 0.15 145 / 15%);
}
.dbb-health-dot.fail {
  background: var(--danger);
  box-shadow: 0 0 0 3px oklch(55% 0.18 28 / 15%);
}
.dbb-health-dot.none {
  background: var(--border);
}

/* ── M5 历史筛选 / 失败原因展开 ── */
.dbb-hist-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dbb-error-head:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
.dbb-hist-filter {
  width: auto;
  padding: 4px 8px;
  font-size: 12px;
}
.hist-error-detail {
  margin: 4px 0 0;
  padding: 8px 12px;
  background: oklch(55% 0.18 28 / 6%);
  border: 1px solid oklch(55% 0.18 28 / 25%);
  border-radius: 6px;
  font-size: 12px;
  color: var(--danger);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
}

/* ── M8 恢复此包入口 ── */
.dbb-restore-pkg-btn {
  display: inline-flex;
  margin-top: 4px;
}

/* ── M10 行内开关 ── */
.dbb-row-toggle {
  vertical-align: middle;
}

/* ── 上次错误（可折叠） ── */
.dbb-error {
  margin-top: 12px;
  border: 1px solid oklch(55% 0.18 28 / 30%);
  border-radius: 8px;
  background: oklch(55% 0.18 28 / 5%);
  overflow: hidden;
}
.dbb-error-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--danger);
}
.dbb-error-flag {
  flex-shrink: 0;
}
.dbb-error-line {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dbb-error-toggle {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
}
.dbb-error-detail {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid oklch(55% 0.18 28 / 20%);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow-y: auto;
}

/* ── 配置区 ── */
.dbb-section-title {
  margin: 20px 0 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
  font-size: 14px;
  font-weight: 600;
}
.dbb-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 10px;
}
.dbb-title-row-text {
  display: inline-flex;
  align-items: center;
}
.section-count {
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  border-radius: 999px;
  padding: 3px 9px;
  font-weight: 500;
  margin-left: 8px;
}
.dbb-inline-fields {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  flex-wrap: wrap;
}
.dbb-inline-hint {
  margin-top: 0;
}
.dbb-interval-input {
  max-width: 140px;
}
.dbb-segments-fields {
  gap: 16px;
}
.dbb-segment-check {
  margin-bottom: 0;
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  accent-color: var(--accent);
}
.dbb-enabled-text {
  font-size: 13px;
  font-weight: 500;
}
/* ── Tab 化：常驻状态操作层（sticky，D3：top = DefaultLayout .app-header 高度） ── */
.dbb-persistent {
  position: sticky;
  top: 56px;
  z-index: 20;
  background: var(--surface);
  /* 底部留呼吸空间：统计条/提示行与常驻层分割条不再贴死（wrap 换行时同理） */
  padding: 12px 20px 12px;
  border-bottom: 1px solid var(--border);
}
.dbb-persistent-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.dbb-persistent-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.dbb-persistent-ops .dbb-status-hint,
.dbb-persistent-ops .dbb-poll-hint {
  margin: 0;
}
.dbb-persistent .dbb-dirty-badge {
  cursor: pointer;
}
.dbb-persistent .dbb-run-expectation {
  margin: 0;
  padding: 2px 0 4px;
}
.dbb-persistent .dbb-error {
  margin: 10px 0 0;
}

/* ── Tab 化：内容区 Tabs 与策略说明 ── */
.dbb-tabs {
  margin-top: 4px;
}

/* ── Tab 头部 folder 风格（视觉对齐 SslList 的 .dtabs/.dt；保 a-tabs 结构，pane 仍常驻挂载） ──
   几何：停用 AntDV 自带分隔线（.ant-tabs-nav::before）与墨条（ink-bar），分隔线改画在
   .ant-tabs-nav 的 border-bottom 上；每个 tab 底边下探 1px（margin-bottom: -1px）压住分隔线——
   非激活 tab 底边用 --border 与分隔线无缝衔接，激活 tab 底边用 --surface 盖住分隔线形成 folder 效果。 */
.dbb-tabs :deep(.ant-tabs-nav) {
  margin: 0 0 16px;
  padding: 8px 0 0;
  border-bottom: 1px solid var(--border);
}
.dbb-tabs :deep(.ant-tabs-nav::before) {
  display: none;
}
/* 激活页签需下探 1px 叠住分隔线，不能被 wrap 裁剪（三枚短页签无横向溢出，滚动遮罩不受影响） */
.dbb-tabs :deep(.ant-tabs-nav-wrap) {
  overflow: visible;
}
.dbb-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}
.dbb-tabs :deep(.ant-tabs-tab) {
  margin: 0 0 -1px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
  background: var(--bg);
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
  position: relative;
  user-select: none;
  transition: all 0.2s;
}
.dbb-tabs :deep(.ant-tabs-tab + .ant-tabs-tab) {
  margin-left: 4px;
}
.dbb-tabs :deep(.ant-tabs-tab .ant-tabs-tab-btn) {
  font-size: 13px;
  color: var(--muted);
  transition: color 0.2s;
}
.dbb-tabs :deep(.ant-tabs-tab:hover .ant-tabs-tab-btn) {
  color: var(--accent);
}
.dbb-tabs :deep(.ant-tabs-tab:hover) {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: var(--accent);
}
.dbb-tabs :deep(.ant-tabs-tab.ant-tabs-tab-active) {
  color: var(--accent);
  background: var(--surface);
  border-color: var(--border);
  border-bottom: 1px solid var(--surface);
  font-weight: 600;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
  z-index: 1;
}
.dbb-tabs :deep(.ant-tabs-tab.ant-tabs-tab-active)::after {
  content: '';
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 0 0 1px 1px;
}
.dbb-tabs :deep(.ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: var(--accent);
  font-weight: 600;
}
.dbb-policy-note {
  margin: 12px 0 4px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: oklch(0% 0 0 / 3%);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
}

/* ── 位置表格 ── */
.dbb-zone-hint {
  font-size: 11px;
  color: var(--muted);
  margin: -4px 0 12px;
}
.dbb-target-empty {
  padding: 18px 0;
  font-size: 13px;
  color: var(--muted);
}
.table-shell {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  overflow: hidden;
  box-shadow: var(--shadow-sm, 0 1px 2px oklch(0% 0 0 / 6%));
}
table.grid {
  width: 100%;
  border-collapse: collapse;
}
table.grid th {
  background: oklch(56% 0.16 210 / 10%);
  padding: 12px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  text-align: left;
  border-bottom: 2px solid var(--accent);
  user-select: none;
}
table.grid td {
  padding: 12px 10px;
  font-size: 13px;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
  color: var(--fg);
  vertical-align: middle;
}
table.grid tr:last-child td {
  border-bottom: none;
}
table.grid tbody tr:hover td {
  background: oklch(97% 0.005 250 / 60%);
}
td.num,
th.num {
  text-align: right;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.t-muted {
  color: var(--muted);
}
.cell-meta {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-left: 6px;
}
.table-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
tr.row-disabled td {
  color: var(--muted);
}
.col-enable {
  width: 44px;
}
.col-retain {
  width: 76px;
}
.col-actions {
  width: 200px;
}
.col-exp {
  width: 36px;
}
.col-trigger {
  width: 70px;
}
.col-num {
  width: 84px;
}
.dbb-tgt-name {
  font-weight: 500;
}
.dbb-tgt-dir {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dbb-target-testbar {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md, 6px);
  font-size: 12px;
  font-family: var(--font-mono);
}
.dbb-target-testbar.ok {
  border: 1px solid oklch(55% 0.15 145 / 35%);
  background: oklch(55% 0.15 145 / 6%);
  color: var(--success);
}
.dbb-target-testbar.fail {
  border: 1px solid oklch(55% 0.18 28 / 35%);
  background: oklch(55% 0.18 28 / 6%);
  color: var(--danger);
}

/* ── 历史区 ── */
.dbb-history {
  margin-top: 24px;
}
.dbb-history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
}
.dbb-history-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.dbb-history-count {
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  border-radius: 999px;
  padding: 3px 9px;
}
.dbb-hist-loading {
  padding: 14px 0;
  font-size: 13px;
  color: var(--muted);
}
.dbb-trigger {
  font-size: 12px;
  color: var(--muted);
  background: oklch(55% 0.01 250 / 8%);
  border-radius: 4px;
  padding: 2px 8px;
}
.dbb-pkgname {
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}
.dbb-hist-status {
  white-space: nowrap;
}
.dbb-hist-counts {
  white-space: nowrap;
}
.exp-toggle {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-sm, 4px);
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.exp-toggle:hover {
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
}
.exp-toggle.open {
  transform: rotate(90deg);
  color: var(--accent);
}
tr.expand-row td {
  padding: 0 !important;
  background: var(--bg) !important;
  border-bottom: 1px solid var(--border) !important;
}
tr.expand-row .hist-expand {
  padding: 12px 16px 12px 42px;
}
.hist-expand-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.target-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.target-results li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
}
.tr-ico {
  font-family: var(--font-mono);
  font-weight: 700;
  width: 14px;
  flex-shrink: 0;
  text-align: center;
}
.tr-ok .tr-ico {
  color: var(--success);
}
.tr-fail .tr-ico {
  color: var(--danger);
}
.tr-name {
  font-weight: 500;
  min-width: 72px;
}
.tr-fail .tr-name {
  color: var(--muted);
  font-weight: 400;
}
.tr-meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.tr-fail .tr-meta {
  color: var(--danger);
}
.dbb-hist-pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
}
.dbb-hist-pager-info {
  font-family: var(--font-mono);
  font-size: 12px;
}
.dbb-hist-pagesize {
  width: auto;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

/* ── 编辑抽屉 ── */
.dbb-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.dbb-drawer-overlay-dim {
  position: absolute;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
}
.dbb-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 470px;
  max-width: 100vw;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg, 0 8px 24px oklch(0% 0 0 / 10%));
  display: flex;
  flex-direction: column;
  animation: dbb-drawer-in 0.3s cubic-bezier(0.2, 0.8, 0.3, 1);
}
@keyframes dbb-drawer-in {
  from {
    transform: translateX(60px);
    opacity: 0.4;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.dbb-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
}
.dbb-drawer-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}
.dbb-drawer-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--muted);
  border-radius: var(--radius-sm, 4px);
  line-height: 1;
}
.dbb-drawer-close:hover {
  background: var(--bg);
  color: var(--fg);
}
.dbb-drawer-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.dbb-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.dbb-drawer-error {
  margin-top: 4px;
  padding: 8px 12px;
  border: 1px solid oklch(55% 0.18 28 / 35%);
  border-radius: var(--radius-md, 6px);
  background: oklch(55% 0.18 28 / 6%);
  color: var(--danger);
  font-size: 12px;
}
.dbb-drawer-testbar {
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: var(--radius-md, 6px);
  font-size: 12px;
  font-family: var(--font-mono);
}
.dbb-drawer-testbar.ok {
  border: 1px solid oklch(55% 0.15 145 / 35%);
  background: oklch(55% 0.15 145 / 6%);
  color: var(--success);
}
.dbb-drawer-testbar.fail {
  border: 1px solid oklch(55% 0.18 28 / 35%);
  background: oklch(55% 0.18 28 / 6%);
  color: var(--danger);
}

/* ── 立即备份结果弹窗 ── */
.dbb-runmodal {
  max-width: 640px;
}
.dbb-runmodal-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.dbb-runmodal-pkg {
  font-size: 12px;
  color: var(--muted);
  word-break: break-all;
  margin-bottom: 12px;
}
.dbb-runmodal-error {
  font-size: 13px;
  color: var(--danger);
  word-break: break-all;
}

/* 窄屏时统计条退化为两列 */
@media (max-width: 900px) {
  .dbb-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .dbb-stat:nth-child(2) {
    border-right: none;
  }
  .dbb-stat:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}
</style>
