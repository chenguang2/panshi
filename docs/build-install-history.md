# 便携部署（Copy 安装）问题排查与修复记录

## 背景

磐石 Admin 支持"拷贝即用"的离线部署方案（详见 `docs/deploy-portable-guide.md`）。开发机上运行 `prepare/{linux,windows}/prepare.sh` 或 `prepare.ps1` 脚本，会下载 Python、构建前端、打包依赖，生成一份可以直接拷贝到同平台目标机器运行的目录。

本文记录了该方案从不可用到可用过程中遇到和修复的所有问题。

---

## 问题清单

### 1. `npm run build` SFC 编译失败 — ClusterList.vue 缺少闭合大括号

**现象**：
```
[vue/compiler-sfc] Unexpected token (3148:0)
```
babel parser 报错位置在文件末尾，等待多余的 `}`。

**根因**：  
`frontend/src/views/ClusterList.vue` 第 1078 行的 `function isExpanded(clusterId: number): boolean {` 缺少对应的 `}` 闭合。导致 1078 行之后所有代码（`filteredClusters`、`gridClusters`、所有函数、`onMounted`）都被包裹在 `isExpanded` 函数内部。

**修复**：
- 给 `isExpanded` 补上闭合 `}`，并改为只有一行 `return expandedIds.value.has(clusterId)`
- 将 `filteredClusters` 提到顶层作用域，使 `gridClusters` 和 `expandedClusters` 能正常引用

---

### 2. TypeScript 类型错误 — 多个组件

**现象**：`vue-tsc -b` 报出约 30 个类型错误，分布在 6 个文件。

**修复分类**：

| 类型 | 示例 | 修改方式 |
|------|------|---------|
| 未使用声明 | `router`、`isExpanded`、`res`、`edgeUuid` | 删除或前缀 `_` |
| possibly undefined | `cluster.nodes`、`c.upstreams`、`cluster.routes` | 加 `!` 非空断言 |
| 类型过窄 | `progress.status: 'active' as const` | 放宽为 `as 'active' \| 'success' \| 'exception'` |
| 类型缺少字段 | `Route` 缺少 `current_version`、`published_at`、`plugins` | 补充到 `types/index.ts` |
| 隐式 any | `(e) => handleNodeAction(...)` | 显式标注 `(e: { key: string })` |
| 字面量不在联合类型中 | `'static_resource'` 不在 `versionModalType` 类型里 | 扩充联合类型 |
| 参数不匹配 | `toggleExpand(item)` 少了第二个参数 | 补全参数 |
| null 未处理 | `expandedMode[item.id]` 可能为 null | 加 `?? 'diffs'` |

---

### 3. Windows 文件锁 — 无法删除旧 `.venv` 和 `backend/python/`

**现象**：
```
Remove-Item : 无法删除项 ... \_bcrypt.pyd: 对路径的访问被拒绝。
```

**根因**：`.venv` 中的 `.pyd` 文件（Python 原生扩展 DLL）被 Python 进程加载后，Windows 会锁住文件。`Remove-Item -Recurse -Force` 无法删除被锁文件。

**修复**（`prepare/windows/prepare.ps1`）：
1. 脚本开头自动杀掉占用 9000 端口的进程（释放文件锁）
2. 删除失败时用 `cmd /c rmdir /s /q` 替代 `Remove-Item` 重试
3. 删除仍然失败时用 `Rename-Item` 将旧目录改名腾出位置
4. 改名也失败时使用 `python -m venv --clear` 原地重建
5. 新增判断：如果 `.venv` 里的 `pip` 可用，跳过重建

---

### 4. Linux standalone Python 路径硬编码 — 找不到标准库

**现象**（`backend.log`）：
```
stdlib dir = '/install/lib/python3.11'
ModuleNotFoundError: No module named 'encodings'
```

**根因**：`uv python install` 下载的 standalone Python 是预编译的，内部硬编码了路径前缀 `/install`。`python -m venv` 创建 `.venv` 时会把 `/install` 写进 `pyvenv.cfg` 和二进制中，运行时找不到标准库。

**修复**（`prepare/linux/prepare.sh`、`prepare/linux/start.sh`）：
- 在 `prepare.sh` 中运行 pip 前设置 `export PYTHONHOME="$TARGET_PYTHON_DIR"`
- 在 `start.sh` 中启动 uvicorn 前设置 `export PYTHONHOME="$PROJECT_ROOT/backend/python"`
- `PYTHONHOME` 会覆盖 Python 二进制内置的编译路径，使其从 `backend/python/lib/python3.11/` 加载标准库

---

### 5. Linux `backend/python` 是符号链接 — 拷贝到目标机后丢失标准库

**现象**：目标机上 `backend/python/lib/python3.11/` 整个目录不存在。

**根因**：开发机上 `backend/python` 被人为或工具创建为符号链接指向 uv 缓存：
```
python -> /home/qcg/.local/share/uv/python/cpython-3.11.15-linux-x86_64-gnu
```
`cp -r` 拷贝的是符号链接本身而非内容，传到目标机后链接断裂。

**修复**（`prepare/linux/prepare.sh`）：
- 将 `cp -r` 改为 `cp -rL`（`-L` 跟踪符号链接，拷贝实际内容）

---

### 6. bcrypt 版本 glibc 不兼容 — CentOS 7 无法运行

**现象**：
```
ImportError: /lib64/libc.so.6: version `GLIBC_2.28' not found
```

**根因**：开发机 glibc ≥ 2.28，pip 下载了 `manylinux_2_28` 的 bcrypt wheel。目标机 CentOS 7 只有 glibc 2.17，无法加载该 wheel。

**决定**：目标机要求 glibc ≥ 2.28（CentOS 8 / RHEL 8+ / Ubuntu 20.04+），不再支持 CentOS 7。

---

### 7. Vite `cacheDir` 路径在 Windows 上无效

**现象**：开发阶段 vite build 报错（但后来确认该问题并非 SFC parse 错误的根因）。

**根因**：`frontend/vite.config.ts` 和 `frontend/.env` 中配置了 `cacheDir: '/tmp/vite-cache'`，这是 Unix 路径，Windows 上不存在。

**修复**：移除 `/tmp/vite-cache` 配置，使用 Vite 默认缓存目录（`node_modules/.vite`）。

---

## 最终脚本使用流程

### 开发机（有公网，已安装 uv + npm）

```bash
# Linux
bash prepare/linux/prepare.sh

# Windows
.\prepare\windows\prepare.ps1
```

脚本输出：
- `backend/python/` — standalone Python 解释器
- `backend/.venv/` — Python 虚拟环境（含所有依赖）
- `frontend/dist/` — 前端构建产物

### 目标机器要求

| 平台 | 最低要求 |
|------|---------|
| Linux | glibc ≥ 2.28（CentOS 8+、RHEL 8+、Ubuntu 20.04+、Debian 11+） |
| Windows | Windows 10 / Server 2016+ |

目标机器不需要安装 uv、npm、Python、Node.js，不需要公网访问。

### 打包部署

```bash
# 在开发机上打包（排除不需要的目录）
tar czf deploy.tar.gz \
    --exclude='frontend/node_modules' \
    --exclude='.git' \
    --exclude='__pycache__' \
    -C /path/to/project .

# 拷贝到目标机器后启动
# Linux 目标机
bash prepare/linux/start.sh

# Windows 目标机
.\prepare\windows\start.ps1
```

### 常见错误排查

| 现象 | 排查方向 |
|------|---------|
| `No module named 'encodings'` | `PYTHONHOME` 是否设置？`backend/python/lib/python3.11/` 是否存在？ |
| `GLIBC_2.XX not found` | 目标机 glibc 版本过低，升级系统或更换目标机 |
| `.venv` 删除失败 | 检查是否有 Python 进程仍在运行，手动 `kill` 或 `stop.ps1` |
| npm build 失败 | `vue-tsc -b` 类型检查未通过，参考 TypeScript 错误提示修复 |
