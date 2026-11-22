# Proposal: ca-install-guide-restyle

## Why

CA 根证书页的「用户安装指引」当前是四栏 12px 灰色纯文字列表（`ssl-page-shared.css:103-160`），无排版层级、无复制能力、无安装结果验证指引；且 Chrome 浏览器段与 Windows/macOS 系统段并列，用户难以分辨该看哪段。本次对指引做纯排版升级（零交互变更）与内容补齐，让「发给用户即可照做」的标准在视觉与文案两个层面都成立。

## What Changes

- 指引面板内部从「四栏并列纯文字」升级为「2×2 平台步骤卡」：Windows（系统级）/ macOS（钥匙串）/ Chrome·Edge 浏览器（浏览器内导入，**独立成卡**）/ Linux（Debian/Ubuntu + RHEL 兼容说明）。
- 每张卡统一解剖：平台图标 + 名称 + 覆盖范围徽标 + 圆圈序号步骤 + 加粗关键术语 + 代码条带单条复制按钮 + 卡内提示行（该平台与浏览器证书库的关系说明）。
- 面板底部新增通用「如何确认安装成功」验证条（现状缺失的内容缺口）。
- summary 行新增「复制全部文本」按钮：生成纯文本（含四卡步骤与验证段）供管理员直接粘贴 IM 发给用户。
- 文案补齐安装卡点：Windows UAC 确认、Chrome/Edge 双浏览器地址入口（chrome://settings/security 与 edge://settings/privacy）、Linux RHEL/CentOS 命令。
- **Firefox 段维持移除**（2026-11-22 用户裁决：沿袭 ssl-cert-management 变更的移除决策，spec「SHALL NOT 包含 Firefox 段」条款原样保留）。
- 「指引入口」以 spec 改写对齐现状（2026-11-22 用户裁决：分发横幅不补「查看安装指引」联动操作，指引面板保持独立折叠入口）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ca-root-certificate-distribution`：「用户安装指引」requirement 排版与内容升级（四卡模型 + 验证段 + 复制能力）；「指引展开」场景按新内容模型改写；「指引入口」场景按现状改写（横幅无联动操作）。

## Impact

- **前端**：`frontend/src/views/CaCertList.vue`（指引区模板重写）；`frontend/src/views/ssl-page-shared.css`（`.install-guide`/`.guide-body`/`.guide-col` 样式族重写为 `.p-card` 卡片解剖）；`frontend/src/views/__tests__/CaCertList.test.ts`（内容断言更新）。
- **设计基线**：`docs/ui/Live-Artifact-5/proposal-c/ca-certs.html` 同步新指引解剖（#91 一一对应）。
- **零后端改动**、零数据绑定变化（下载仍归卡片行；指引区无下载按钮，多 CA 场景归属不变）。
- **裁决记录**：Firefox 维持移除；横幅不补联动入口（两者均为用户 2026-11-22 点对点裁决，见 design D5/D6）。
