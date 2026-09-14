# 模型切换指南

## 配置原理

所有模型 preset 统一定义在 `~/.config/opencode/oh-my-opencode-slim.json` 的 `presets` 字段中。通过环境变量 `OH_MY_OPENCODE_SLIM_PRESET` 在启动时选择 preset。

| 模型 | Preset 名称 | 模型 ID |
|---|---|---|
| 智谱 GLM | `glm` | `zhipuai-coding-plan/glm-5.3-flash` |
| DeepSeek | `deepseek` | `deepseek/deepseek-flash` |
| MiMo 2.5 Free | `mimo` | `opencode/mimo-v2.5-free` |

默认 preset 为 `openai`（GLM），直接运行 `opencode` 即可。

## 启动命令

### 智谱 GLM（默认）

```bash
opencode
# 或显式指定
OH_MY_OPENCODE_SLIM_PRESET=glm opencode
```

### MiMo 2.5 Free

```bash
OH_MY_OPENCODE_SLIM_PRESET=mimo opencode
```

### DeepSeek

```bash
OH_MY_OPENCODE_SLIM_PRESET=deepseek opencode
```

## 快捷别名

`~/.bashrc` 中已配置：

```bash
alias oc-mimo='OH_MY_OPENCODE_SLIM_PRESET=mimo opencode'
alias oc-deepseek='OH_MY_OPENCODE_SLIM_PRESET=deepseek opencode'
alias oc-glm='OH_MY_OPENCODE_SLIM_PRESET=glm opencode'
```

直接用 `oc-mimo`、`oc-deepseek`、`oc-glm` 启动。修改后需 `source ~/.bashrc` 生效。

## 注意事项

- 切换模型需要**重启 OpenCode**（环境变量只在启动时读取）
- 如果 DeepSeek 启动报 provider 错误，需要在 `~/.config/opencode/opencode.json` 的 `provider` 中添加 DeepSeek 的 API Key 配置
- 会话内临时切模型可用 `/models` 命令或 `Ctrl+X m` 快捷键
- 新增模型只需在 `oh-my-opencode-slim.json` 的 `presets` 中添加对应 preset，再加一条 alias 即可

---

## OpenCode 配置文件迁移到其他机器

迁移到新机器时，需要复制以下配置。**不要直接复制含 API Key 的文件**，需先替换密钥。

### 配置文件总览

```
~/.config/opencode/
├── opencode.json                    # 核心：provider API Key、默认模型、MCP 服务
├── opencode.jsonc                   # 插件列表、agent 开关、codebase-memory-mcp
├── oh-my-opencode-slim.json         # 模型 preset 定义（模型切换核心）
├── AGENTS.md                        # 全局 agent 指令（codebase-memory 使用指南）
├── tui.json                         # TUI 插件声明
├── tui-preferences.jsonc            # TUI 偏好（折叠状态等）
├── agents/                          # 自定义 agent 定义
│   ├── codebase-memory.md
│   ├── codebase-memory-auditor.md
│   └── codebase-memory-scout.md
├── plugins/                         # 自定义插件
│   └── cbm-augment.ts
├── skills/                          # 自定义 skill（全局级）
│   ├── clonedeps/
│   ├── codebase-memory/
│   ├── codemap/
│   ├── deepwork/
│   ├── oh-my-opencode-slim/
│   ├── reflect/
│   ├── simplify/
│   ├── verification-planning/
│   └── worktrees/
└── .oh-my-opencode-slim/            # 自动缓存（不需要迁移）
    └── skills-manifest.json
```

**项目级**（随代码仓库走，git 已跟踪）：

```
<project>/.opencode/
├── opencode.json          # 项目插件（superpowers）+ compaction 配置
├── skills/                # 项目级 skill（openspec、md-format 等）
└── command/               # 项目级 command
```

### 各配置文件完整内容

以下是所有需要迁移的配置文件的完整内容。新机器上可直接按路径创建并粘贴内容，API Key 处用 `YOUR_*_KEY` 占位。

#### `~/.config/opencode/opencode.json` — Provider API Key + MCP 服务

```json
{
    "$schema": "https://opencode.ai/config.json",
    "provider": {
        "zhipuai-coding-plan": {
            "options": {
                "apiKey": "YOUR_ZHIPUAI_API_KEY"
            }
        }
    },
    "model": "zhipuai-coding-plan/glm-5.3-flash",
    "small_model": "zhipuai-coding-plan/glm-5.3-flash",
    "mcp": {
        "zai-mcp-server": {
            "type": "local",
            "command": ["npx", "-y", "@z_ai/mcp-server"],
            "environment": {
                "Z_AI_MODE": "ZHIPU",
                "Z_AI_API_KEY": "YOUR_ZHIPUAI_API_KEY"
            }
        },
        "web-search-prime": {
            "type": "remote",
            "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
            "headers": {
                "Authorization": "Bearer YOUR_ZHIPUAI_API_KEY"
            }
        },
        "web-reader": {
            "type": "remote",
            "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
            "headers": {
                "Authorization": "Bearer YOUR_ZHIPUAI_API_KEY"
            }
        },
        "zread": {
            "type": "remote",
            "url": "https://open.bigmodel.cn/api/mcp/zread/mcp",
            "headers": {
                "Authorization": "Bearer YOUR_ZHIPUAI_API_KEY"
            }
        }
    }
}
```

#### `~/.config/opencode/opencode.jsonc` — 插件 + Agent 开关 + codebase-memory

```jsonc
{
  "plugin": [
    "oh-my-opencode-slim@latest",
    "@cortexkit/opencode-magic-context@latest"
  ],
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "explore": { "disable": true },
    "general": { "disable": true }
  },
  "lsp": true,
  "mcp": {
    "codebase-memory-mcp": {
      "command": ["/home/YOUR_USER/.local/bin/codebase-memory-mcp"],
      "type": "local"
    }
  },
  "compaction": { "auto": false, "prune": false }
}
```

#### `~/.config/opencode/oh-my-opencode-slim.json` — 模型 Preset 定义

```json
{
  "$schema": "https://unpkg.com/oh-my-opencode-slim@latest/oh-my-opencode-slim.schema.json",
  "preset": "openai",
  "presets": {
    "openai": {
      "orchestrator": { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle":      { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": ["simplify"], "mcps": [] },
      "librarian":   { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": ["context7", "gh_grep"] },
      "explorer":    { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] },
      "designer":    { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] },
      "fixer":       { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] }
    },
    "glm": {
      "orchestrator": { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle":      { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": ["simplify"], "mcps": [] },
      "librarian":   { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": ["context7", "gh_grep"] },
      "explorer":    { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] },
      "designer":    { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] },
      "fixer":       { "model": "zhipuai-coding-plan/glm-5.3-flash", "skills": [], "mcps": [] }
    },
    "mimo": {
      "orchestrator": { "model": "opencode/mimo-v2.5-free", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle":      { "model": "opencode/mimo-v2.5-free", "skills": ["simplify"], "mcps": [] },
      "librarian":   { "model": "opencode/mimo-v2.5-free", "skills": [], "mcps": ["context7", "gh_grep"] },
      "explorer":    { "model": "opencode/mimo-v2.5-free", "skills": [], "mcps": [] },
      "designer":    { "model": "opencode/mimo-v2.5-free", "skills": [], "mcps": [] },
      "fixer":       { "model": "opencode/mimo-v2.5-free", "skills": [], "mcps": [] }
    },
    "deepseek": {
      "orchestrator": { "model": "deepseek/deepseek-flash", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle":      { "model": "deepseek/deepseek-flash", "skills": ["simplify"], "mcps": [] },
      "librarian":   { "model": "deepseek/deepseek-flash", "skills": [], "mcps": ["context7", "gh_grep"] },
      "explorer":    { "model": "deepseek/deepseek-flash", "skills": [], "mcps": [] },
      "designer":    { "model": "deepseek/deepseek-flash", "skills": [], "mcps": [] },
      "fixer":       { "model": "deepseek/deepseek-flash", "skills": [], "mcps": [] }
    }
  }
}
```

#### `~/.config/opencode/tui.json` — TUI 插件声明

```json
{
  "plugin": [
    "oh-my-opencode-slim",
    "@cortexkit/opencode-magic-context@latest"
  ]
}
```

#### `~/.config/opencode/tui-preferences.jsonc` — TUI 偏好

```jsonc
{
  "magic-context": {
    "collapsed": false
  }
}
```

#### `~/.config/opencode/AGENTS.md` — 全局 Agent 指令

```markdown
<!-- codebase-memory-mcp:start -->
# Codebase Memory

## Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

### Priority Order
1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `check_index_coverage` — validate candidate paths and missed ranges before claims
5. `query_graph` — run Cypher queries for complex patterns
6. `get_architecture` — high-level project summary

### Evidence tiers
- **Scout (Tier 1):** quick positive lookup with few calls and targeted source checks.
- **Verify (Tier 2, default):** task-directed graph evidence, relevant trace directions, exact snippets.
- **Auditor (Tier 3):** bounded-scope full verification with complete pagination.
<!-- codebase-memory-mcp:end -->
```

#### `~/.config/opencode/agents/codebase-memory.md`

```markdown
---
description: Default task-directed graph verification with check_index_coverage and source read/grep fallback.
mode: subagent
permission:
  "*": deny
  read: allow
  grep: allow
  glob: allow
  "codebase-memory-mcp_search_graph": allow
  "codebase-memory-mcp_trace_path": allow
  "codebase-memory-mcp_get_code_snippet": allow
  "codebase-memory-mcp_query_graph": allow
  "codebase-memory-mcp_get_architecture": allow
  "codebase-memory-mcp_search_code": allow
  "codebase-memory-mcp_get_graph_schema": allow
  "codebase-memory-mcp_list_projects": allow
  "codebase-memory-mcp_index_status": allow
  "codebase-memory-mcp_detect_changes": allow
  "codebase-memory-mcp_check_index_coverage": allow
---
Tier 2 — Verify. Gather task-directed evidence with narrow search, task-relevant trace directions,
exact snippets for material claims, and relevant pagination. Require path coverage for every cited
file and scope coverage before negative claims. Never edit files or perform state-changing actions.
```

#### `~/.config/opencode/agents/codebase-memory-auditor.md`

```markdown
---
description: Bounded-scope graph audit with check_index_coverage and source read/grep fallback.
mode: subagent
permission:
  "*": deny
  read: allow
  grep: allow
  glob: allow
  "codebase-memory-mcp_search_graph": allow
  "codebase-memory-mcp_trace_path": allow
  "codebase-memory-mcp_get_code_snippet": allow
  "codebase-memory-mcp_query_graph": allow
  "codebase-memory-mcp_get_architecture": allow
  "codebase-memory-mcp_search_code": allow
  "codebase-memory-mcp_get_graph_schema": allow
  "codebase-memory-mcp_list_projects": allow
  "codebase-memory-mcp_index_status": allow
  "codebase-memory-mcp_detect_changes": allow
  "codebase-memory-mcp_check_index_coverage": allow
---
Tier 3 — Auditor. Bounded scope, current graph generation, complete relevant pagination.
Inspect both call directions and broader relationships when material. Disclose every limitation.
Never edit files or perform state-changing actions.
```

#### `~/.config/opencode/agents/codebase-memory-scout.md`

```markdown
---
description: Fast positive, provisional graph lookup with check_index_coverage and source read/grep fallback.
mode: subagent
permission:
  "*": deny
  read: allow
  grep: allow
  glob: allow
  "codebase-memory-mcp_search_graph": allow
  "codebase-memory-mcp_trace_path": allow
  "codebase-memory-mcp_get_code_snippet": allow
  "codebase-memory-mcp_get_architecture": allow
  "codebase-memory-mcp_list_projects": allow
  "codebase-memory-mcp_index_status": allow
  "codebase-memory-mcp_check_index_coverage": allow
---
Tier 1 — Scout. Quick positive lookup, about 3-4 narrow graph calls, small result limits.
Label findings provisional. Do not make all/none or absence claims.
Never edit files or perform state-changing actions.
```

#### `<project>/.opencode/opencode.json` — 项目级插件配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git"
  ],
  "compaction": { "auto": false, "prune": false }
}
```

#### `~/.bashrc` 别名追加内容

```bash
alias oc-mimo='OH_MY_OPENCODE_SLIM_PRESET=mimo opencode'
alias oc-deepseek='OH_MY_OPENCODE_SLIM_PRESET=deepseek opencode'
alias oc-glm='OH_MY_OPENCODE_SLIM_PRESET=glm opencode'
```

### 一键迁移脚本

```bash
#!/bin/bash
# 从旧机器导出（运行在旧机器上）
# 注意：不要直接 cp opencode.json，先手动脱敏 API Key

DEST=~/opencode-config-backup
mkdir -p $DEST

# 复制配置文件（排除缓存和 node_modules）
cp ~/.config/opencode/opencode.json          $DEST/
cp ~/.config/opencode/opencode.jsonc         $DEST/
cp ~/.config/opencode/oh-my-opencode-slim.json $DEST/
cp ~/.config/opencode/AGENTS.md              $DEST/
cp ~/.config/opencode/tui.json               $DEST/
cp ~/.config/opencode/tui-preferences.jsonc  $DEST/

# 复制 agents / plugins / skills
cp -r ~/.config/opencode/agents   $DEST/
cp -r ~/.config/opencode/plugins  $DEST/
cp -r ~/.config/opencode/skills   $DEST/

# 复制 bashrc alias（只取相关行）
grep 'oc-mimo\|oc-deepseek\|oc-glm\|OH_MY_OPENCODE_SLIM_PRESET' ~/.bashrc > $DEST/bashrc-aliases.sh

echo "备份完成：$DEST"
echo "⚠️  opencode.json 中含 API Key，请替换后再部署到新机器"
```

```bash
#!/bin/bash
# 在新机器上部署（运行在新机器上，opencode 已安装）
SRC=~/opencode-config-backup

mkdir -p ~/.config/opencode/agents
mkdir -p ~/.config/opencode/plugins
mkdir -p ~/.config/opencode/skills
mkdir -p ~/.config/opencode/.oh-my-opencode-slim

cp $SRC/opencode.json             ~/.config/opencode/
cp $SRC/opencode.jsonc            ~/.config/opencode/
cp $SRC/oh-my-opencode-slim.json  ~/.config/opencode/
cp $SRC/AGENTS.md                 ~/.config/opencode/
cp $SRC/tui.json                  ~/.config/opencode/
cp $SRC/tui-preferences.jsonc     ~/.config/opencode/

cp -r $SRC/agents/*   ~/.config/opencode/agents/
cp -r $SRC/plugins/*  ~/.config/opencode/plugins/
cp -r $SRC/skills/*   ~/.config/opencode/skills/

# 追加 bashrc alias
cat $SRC/bashrc-aliases.sh >> ~/.bashrc
source ~/.bashrc

# 安装插件依赖（如果有 npm 插件）
cd ~/.config/opencode && npm install 2>/dev/null
cd <project>/.opencode && npm install 2>/dev/null

# 安装 codebase-memory-mcp（如果使用）
# 需要单独安装二进制到 ~/.local/bin/codebase-memory-mcp

echo "部署完成，记得替换 opencode.json 中的 API Key"
```

### 需要手动替换的敏感信息

| 文件 | 字段 | 说明 |
|---|---|---|
| `opencode.json` | `provider.*.options.apiKey` | 各 provider 的 API Key |
| `opencode.json` | `mcp.*.environment.Z_AI_API_KEY` | Z AI MCP 的 API Key |
| `opencode.json` | `mcp.*.headers.Authorization` | Remote MCP 的 Bearer Token |

### 不需要迁移的内容

| 内容 | 原因 |
|---|---|
| `~/.config/opencode/node_modules/` | `npm install` 重新生成 |
| `~/.config/opencode/.oh-my-opencode-slim/` | 运行时自动缓存 |
| `<project>/.opencode/node_modules/` | 项目级 `npm install` 重新生成 |
| `~/.local/bin/codebase-memory-mcp` | 需要单独安装（非 npm 配置） |

### 新机器前置条件

```bash
# 1. 安装 opencode（如未安装）
# 参考 https://opencode.ai 官方文档

# 2. 安装 Node.js（插件需要）
# apt / brew / nvm 安装

# 3. 安装 codebase-memory-mcp（如使用 code graph 功能）
# 需要从源码构建或下载二进制到 ~/.local/bin/

# 4. 部署完成后首次启动
opencode  # 验证能否正常连接各 provider
```
