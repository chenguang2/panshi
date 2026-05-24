## Context

当前磐石 Admin 使用传统的 Ant Design 默认主题（白底蓝字），所有颜色值硬编码在各组件 CSS 中。切换主题需要逐个文件修改，无法支持暗色模式。共约 20 个 Vue 组件文件涉及视觉样式，累计约 120 处硬编码颜色值。

## Goals / Non-Goals

**Goals:**
- 建立 Design Token 变量体系，所有颜色值集中管理
- 实现亮色/暗色主题一键切换，支持跟随系统偏好
- 实现极光蓝/翡翠绿/优雅紫/暖阳橙/中国红 5 种主题色切换
- 所有组件使用 CSS 变量，消除硬编码颜色
- Ant Design 组件通过 ConfigProvider 自动适配主题
- 登录页增加 Apple 风格液态玻璃效果

**Non-Goals:**
- 不改动现有业务逻辑和功能
- 不改动后端 API 结构（除新增 3 个统计字段外）
- 不支持用户自定义任意颜色（仅限 5 种预设）
- 不引入 CSS-in-JS 方案（保持纯 CSS 变量方案）

## Decisions

| 决策 | 方案 | 备选方案 | 理由 |
|------|------|---------|------|
| 主题切换机制 | `<html>` class 切换 | CSS-in-JS / JS 计算 | 零运行时开销，浏览器原生支持，不影响打包体积 |
| 变量命名 | `--p-*` 语义化命名 | `--color-*` 等 | 保持与现有 `--p-*` 前缀一致，避免大规模重构 |
| 亮暗值存储 | CSS 文件（theme-light.css / theme-dark.css） | JS 变量 | 利用 CSS 层叠机制，切换 class 即刻生效 |
| 主题色动态 | JS setProperty 覆盖 | 每色单独 CSS | 5 色 × 2 模式 = 10 个 CSS 文件过于冗余。JS 动态追加更简洁 |
| Ant Design 桥接 | useAntdThemeSync composable 从 CSS 变量读取 | 直接传 token | CSS 变量是单源真理，Ant Design 读取 CSS 变量值同步 |
| 毛玻璃效果 | CSS backdrop-filter | WebGL / SVG 滤镜 | backdrop-filter 性能好，浏览器支持广泛 |
| 登录页玻璃 | @wxperia/liquid-glass-vue | 纯 CSS | 需要 WebGL 位移折射效果提升视觉冲击 |

## Risks / Trade-offs

- **backdrop-filter 浏览器兼容性** → Chrome/Edge 完全支持，Safari/Firefox 部分支持（优雅降级，无位移但模糊效果仍存在）
- **CSS variable 污染** → inline style 可能被 CSS 文件规则覆盖 → setProperty 设置的值通过 `!important` 或高特异性选择器确保生效
- **性能** → CSS 变量切换无重排/重绘开销，仅触发合成层更新
- **迁移成本** → 初期约 120 处硬编码颜色需替换为变量，但可分批进行
