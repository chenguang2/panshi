# Design: branding-configuration

## Context

现状品牌/版本硬编码共 5 处（已逐文件核实）：

| # | 位置 | 现状文案 | 驱动配置 key |
|---|---|---|---|
| 1 | `frontend/index.html` `<title>` | `磐石` | `system_name` |
| 2 | `Login.vue` 主品牌区（`.login-brand-name`） | `磐石 Gateway` | `brand_name` |
| 3 | `Login.vue` 页脚（`.login-footer-version`） | `Panshi Gateway Admin v1.0` | `product_name` + `version` |
| 4 | `AppSidebar.vue` 品牌文案（`.sidebar-logo-text`） | `磐石 Admin` | `brand_name` |
| 5 | `AppSidebar.vue` 版本徽标（`.sidebar-logo-version`） | `v1.0` | `version` |

后端 `app/core/features.py` 已具备：mtime 热加载、`concurrency` 命名空间校验先例（类型校验 + 未知 key 报错退出）、顶层未知 key 不拒绝。`GET /system/features` 返回完整 features dict 且公开无鉴权（约定 #19），前端 `useFeaturesStore` 在 `main.ts` 挂载路由前阻塞加载——登录页渲染时配置已就绪。

## Goals / Non-Goals

**Goals:**
- 三个概念（系统名称 / 品牌名称 / 版本号）+ 产品英文全名，一处配置，五个展示面全部跟随
- 未配置 = 现状行为零变化（向后兼容）
- 改配置免重启后端、免手动刷新浏览器

**Non-Goals:**
- 不做多品牌租户（一实例一品牌，符合 features.yaml 部署级定位，#267）
- 不改 logo 图片/favicon 的配置化（仅文案与版本号；logo 配置化如有需要另立项）
- 不做多语言/国际化（#9：界面中文内联）

## Decisions

### D1: 配置形态与 key 集合 —— `branding` 命名空间 4 个字符串 key

```yaml
# 品牌信息（登录页/侧边栏/标签页标题展示；未配置 = 内置默认值）
branding:
  system_name: 磐石                    # 系统短名：浏览器标签页标题
  brand_name: 磐石 Gateway             # 品牌名：登录页主品牌 + 侧边栏文案
  product_name: Panshi Gateway Admin   # 产品英文全名：登录页页脚前缀
  version: v1.0                        # 版本号：登录页页脚后缀 + 侧边栏徽标
```

- **含义**：与 `concurrency` 同构的顶层命名空间——key 必须属于已知集合、值必须是字符串、未知 key/类型错误 → stderr 报错 + 非零退出（防止拼写错误静默失效，对齐 `KNOWN_FEATURES`/`KNOWN_CONCURRENCY_KEYS` 哲学）；namespace 整体未配置 → 每个回落内置默认值（不报错，向后兼容）。
- **为什么 4 个 key 而不是 3 个**：登录页页脚现状是英文产品名 + 版本（`Panshi Gateway Admin v1.0`），若页脚改成 `brand_name + version`（中文品牌 + 版本），默认值下页脚文案从英文变中文——超出「配置化不改现状」的边界。增加 `product_name` 使页脚在默认值下逐字符不变。若你希望页脚直接用品牌名（少一个 key、页脚变中文），选 D1-alt。
- **D1-alt（不推荐）**：只配 3 个 key，页脚 = `brand_name + version` → 页脚默认变「磐石 Gateway v1.0」，一处可见文案变化。

### D2: 侧边栏文案统一 —— 「磐石 Admin」并入 `brand_name`

现状侧边栏（`磐石 Admin`）与登录页（`磐石 Gateway`）品牌文案不一致，属历史漂移。本变更让侧边栏与登录页同读 `brand_name`：**默认值下侧边栏显示从「磐石 Admin」变为「磐石 Gateway」**——一次性文案统一（可见变化，特此报备）；此后两处恒一致，改一处配置全站跟随。
- **备选**：侧边栏保留独立 key（如 `sidebar_name: 磐石 Admin`）——多一个 key、固化两套品牌文案并存，不推荐。

### D3: 实时刷新机制 —— 后端 mtime 热加载 + 前端 visibilitychange 重取

- **后端**：零新增——`get_features()` 已 mtime 热加载，改 yaml 后下一次 `GET /system/features` 即返回新值（复用现有机制，spec 的「branding 修改热生效」场景由它满足）。
- **前端**：`useFeaturesStore` 新增 `reload()`，并在应用层挂 `visibilitychange` 监听：标签页从隐藏转可见时重拉 `/system/features`（轻量 GET，单请求，失败静默保留旧值）。
- **效果**：改 yaml → 切回浏览器标签页 → 登录页/侧边栏/标签页标题即时更新。
- **备选 A（最简）**：前端仅启动时加载（现状），改配置后需手动刷新页面生效——零新代码但「实时」打折。
- **备选 B（轮询）**：定时 30s 轮询——真正无人操作也更新，但常驻请求换来的场景很边缘（改品牌的人必然在看页面），不推荐。
- **推荐 D3 本体**：一次 visibilitychange 一条请求，代价可忽略，体验完整。

### D4: 浏览器标签页标题纳入配置范围 —— 纳入

标签页标题（现状 `磐石`）也是品牌可见面，且是「系统短名」的自然落点。实现：features 加载完成后 `document.title = branding.system_name`；`index.html` 静态 `<title>磐石</title>` 保留不动，作为配置加载前的回落（加载失败/极慢时不白屏无标题）。
- **备选**：不改标签页标题（严格按你提的两个面收敛）——少一处联动，但换品牌后标签页仍显示旧短名，品牌漂移。推荐纳入。

## Risks / Trade-offs

- [改 features.yaml 时 YAML 写错导致后端退出] → 既有校验语义：stderr 明确指出错 key 与类型，非静默；与 concurrency 同风险水位，可接受。
- [visibilitychange 重取失败（网络抖动）] → 静默保留旧值，下次可见再试；不弹错误打扰。
- [侧边栏文案统一是一次可见变化（磐石 Admin → 磐石 Gateway）] → D2 已明示；不接受则走 D2 备选。
- [`/system/features` 公开暴露品牌信息] → 品牌信息本就公开展示在登录页，无新增信息泄露。

## Migration Plan

纯增量：`features.yaml` 新增可选 namespace，未配置 = 现状行为；无数据迁移、无 API 破坏。回滚 = 删除 `branding` 块或回退前端代码。

## Open Questions

（无——D1–D4 若均按推荐落，无需进一步输入。）
