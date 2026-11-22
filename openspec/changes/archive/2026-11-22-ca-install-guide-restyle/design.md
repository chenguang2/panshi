# Design: ca-install-guide-restyle

## Context

现状指引 = `CaCertList.vue:28-67` 的 `<details class="install-guide">` + `ssl-page-shared.css:103-160` 四栏纯文字样式族。主 spec `ca-root-certificate-distribution` 的「用户安装指引」requirement 已覆盖四环境与粒度标准，但存在两处规范-实现张力：① spec「指引入口」场景要求横幅提供「查看安装指引」联动，实现没有；② spec 明文「SHALL NOT 包含 Firefox 段（已移除）」，而本次样例稿曾含 Firefox 卡。两处均已由用户点对点裁决（见 D5/D6）。

## Goals / Non-Goals

**Goals:**
- 纯排版升级：四栏纯文字 → 2×2 平台步骤卡，零交互变更（仍是折叠面板）
- 内容补齐：Chrome/Edge 独立卡、通用验证段、复制能力、UAC/RHEL 卡点文案
- spec 与实现口径收敛（「指引入口」按现状改写）

**Non-Goals:**
- 不动分发横幅、不动卡片/下载链路（下载仍归证书卡片行，指引区无下载按钮——多 CA 归属不变）
- 不恢复 Firefox 段（2026-11-22 用户裁决，沿袭 ssl-cert-management 移除决策）
- 不做分端 Tab、不取向导弹窗（方案 A/B 已评审未选）

## Decisions

### D1: 载体维持 `<details>` 折叠面板（方案 C）
零交互变更：展开/收起行为、位置（分发横幅下方）不变，仅内部解剖升级。选它而非 Tab/弹窗：管理员常需一次看全四平台（转发场景），且改动面最小。

### D2: Chrome / Edge 浏览器独立成卡（2026-11-22 用户裁决）
现状「Chrome 浏览器」段本就是独立四栏之一，样例稿曾把它并入 Windows/macOS 提示行，用户裁决恢复独立。卡内容：chrome://settings/security（**新增 Edge 入口 edge://settings/privacy**）→ 高级 → 管理证书 → 证书颁发机构 → 导入 → 勾选「信任此 CA 标识网站」→ 重启生效；卡内提示行说明「Windows 下导入走系统向导（按 Windows 卡操作）+ 已系统级安装的通常已自动信任，本卡用于需浏览器内单独管理的场景」——保留与系统级安装的关系说明，避免重复安装困惑。

### D3: 通用「如何确认安装成功」验证条（内容新增）
现状缺收尾判断。验证条常驻面板底部（success 底色，与绿色分发横幅同语义族）：访问内部 HTTPS 系统看到锁图标即成功 + 失败排查两条（存储位置装错、浏览器未完全重启）。

### D4: 复制能力单实现
- 单条复制：仅 Linux 卡两条命令有代码条带复制按钮（四卡中唯一 code 内容）。
- 复制全部文本：summary 行按钮，取面板 `innerText` 归一空行为纯文本——**不做按平台分端复制**（方案 A 的复制当前系统步骤随 A 一并淘汰）。
- 剪贴板 API 用 `navigator.clipboard.writeText`（安全上下文；http 内网部署降级 `document.execCommand` 兜底在实现时评估，失败 toast 提示手动复制）。

### D5: Firefox 段维持移除（2026-11-22 用户裁决）
样例稿曾新增 Firefox 卡（我判断为内容缺口），但主 spec 明文「SHALL NOT 包含 Firefox 段（已移除，ssl-cert-management 2026-10-23）」。用户裁决**维持移除**：spec 条款原样保留，样例稿已同步删除 Firefox 卡，macOS 卡提示行不再引导 Firefox。

### D6: 「指引入口」漂移以改写 spec 收口（2026-11-22 用户裁决）
spec 要求横幅提供「查看安装指引」联动、实现没有。裁决**不补实现、改 spec 对齐现状**：delta 中该场景改写为「指引面板为独立折叠入口，横幅 SHALL NOT 提供联动操作」。

### D7: 设计基线同步
实现合入时同步 `docs/ui/Live-Artifact-5/proposal-c/ca-certs.html` 的指引区解剖（#91 一一对应：设计页是活的验收基准）。过程稿 `/tmp/opencode/ca-guide-proposals/` 用完即删（#91），裁决后归档留痕于本变更目录的截图/对照记录。

### D8: summary 行开合可发现性 —— V1 放大箭头（2026-11-22 用户裁决，三选一）
现状 11px 灰色 `summary::before '▸'` 用户看不清、不知可点。三候选（放大箭头 / 右置「展开/收起」文字 / 取消折叠默认展开）经可交互对比页评审，用户选 **V1**：
- 箭头升级为 **28×28 accent 浅底圆角块内 14px 描边 chevron**（stroke 1.8、`stroke-linecap:round`，与 StrokeIcon 同语言），展开旋转 90°（transform 过渡 0.15s）；
- summary 整行 hover 变 `var(--bg)` 灰底（transition 0.12s）暗示可点；
- 原生 `<details>`/`<summary>` 自带 button role 与 expanded 状态，不额外加 `role="button"`（#25 的手工 aria 模式仅适用于非 details 自绘行）；
- summary 提示语尾部追加「点此展开」微文案（收起态可发现性的文字兜底）。
落选理由存档：V2 文字态语义最强但行尾出现第二处 accent 焦点（与「复制全部文本」按钮争抢）；V3 常显把四卡 + 验证条约 300px 内容压进首屏，牺牲证书列表焦点。

## Risks / Trade-offs

- [复制全部文本取 innerText 可能带折叠态缺失内容] → 复制前不强制展开，按钮文案注明「展开后复制全文」或实现先程序性展开再取文本（实现时二选一，倾向后者）。
- [卡内提示行措辞过长挤压卡高] → 提示行控制在两行内，超长文案移入 step-sub。
- [四卡 2×2 在窄视口挤压] → 沿用 `card-grid` 既有断点语义（≤1200 单列），不新增断点。

## Migration Plan

纯前端呈现层改动，无数据/接口变化。回滚 = revert 前端提交。

## Open Questions

（无——D5/D6 两处裁决已由用户点对点给出，其余均为实现细节。）
