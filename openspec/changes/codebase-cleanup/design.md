## Context

经过代码扫描分析，前后端共发现 2 个 Bug、约 20 处可删除的死代码、约 4 类可合并的重复逻辑。见 `proposal.md` 详细清单。

## Goals / Non-Goals

**Goals:**
- 修复 2 个 Bug（模型未注册、变量名错误）
- 删除所有确认无用的代码（组件、函数、import、文件）
- 合并重复的工具函数到共享位置
- `npm run build` 通过，后端启动正常

**Non-Goals:**
- 不改变运行时行为
- 不重构架构（如 Repository 模式暂不实现）
- 不涉及测试文件

## Decisions

### Decision 1: 合并目标位置

| 重复代码 | 合并到 |
|---------|--------|
| `buildDeleteProgressContent`（4 份） | `useClusterUtils.ts` |
| `formatDate`（5 份） | `useClusterUtils.ts` |
| `getClusterUpstreams`（3 份） | `useClusterUpstreams.ts`（已存在，补全调用方） |

### Decision 2: 删除方式

- 组件文件直接删除 `.vue` 文件
- 函数直接删除定义，一并删除对应的 import
- 删除前 grep 确认无其他引用

## Risks / Trade-offs

- **[风险] 删除误判** → 每项删除前 grep 确认无引用
- **[风险] 合并后签名不兼容** → 保持与原各调用方兼容的签名
