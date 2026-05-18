# edge-zip-extract

## Purpose

从 ZIP 包中提取指定文件到内存字符串或磁盘文件，支持 Store（未压缩）和 Deflate（压缩）两种压缩方法。

## Requirements

### Requirement: 提取单个文件到内存

Edge 节点 SHALL 能从 ZIP 包中提取指定路径的文件，返回其解压后的内容字符串。

#### Scenario: 提取未压缩文件（Store）
- **WHEN** ZIP 包中包含 Store 方式存储的 `index.html`，调用 `extract_file(zip_bytes, "index.html")`
- **THEN** 返回 `index.html` 的完整内容字符串，无需解压操作

#### Scenario: 提取压缩文件（Deflate）
- **WHEN** ZIP 包中包含 Deflate 方式压缩的 `app.js`，调用 `extract_file(zip_bytes, "app.js")`
- **THEN** 返回 `app.js` 解压后的完整内容字符串

#### Scenario: 提取不存在的文件
- **WHEN** 调用 `extract_file(zip_bytes, "nonexistent.txt")`
- **THEN** 返回 `(nil, "file not found in archive")`

### Requirement: CRC32 校验

提取文件时 SHALL 进行 CRC32 校验，确保解压后数据完整性。

#### Scenario: CRC32 匹配
- **WHEN** 提取文件且 CRC32 校验通过
- **THEN** 返回解压内容字符串

#### Scenario: CRC32 不匹配
- **WHEN** 提取文件但 CRC32 校验失败
- **THEN** 返回 `(nil, "CRC32 checksum mismatch")`

### Requirement: 提取所有文件到磁盘

Edge 节点 SHALL 能将 ZIP 包中所有文件提取到指定磁盘目录，自动创建子目录结构。

#### Scenario: 平铺文件提取
- **WHEN** ZIP 包中有 `index.html`、`favicon.ico`，目标目录 `/data/edge/static/myapp/`
- **THEN** 在磁盘上创建 `/data/edge/static/myapp/index.html` 和 `/data/edge/static/myapp/favicon.ico`

#### Scenario: 带目录结构提取
- **WHEN** ZIP 包中有 `css/style.css`、`js/app.js`，目标目录 `/data/edge/static/myapp/`
- **THEN** 自动创建子目录：`/data/edge/static/myapp/css/style.css` 和 `/data/edge/static/myapp/js/app.js`

#### Scenario: 目标目录不存在自动创建
- **WHEN** 目标目录 `/data/edge/static/myapp/` 尚不存在
- **THEN** 自动递归创建目录后写入文件

#### Scenario: 文件已存在覆盖
- **WHEN** 目标文件已存在
- **THEN** SHALL 静默覆盖旧文件

### Requirement: 同时支持 3 种提取模式

Edge 节点的 `zip_utils` 模块 SHALL 提供 3 种粒度的提取函数：

| 函数 | 参数 | 返回 |
|------|------|------|
| `extract_file(zip_bytes, path)` | 字节流 + 文件路径 | 内容字符串 / nil+err |
| `extract_all(zip_bytes, dest_dir)` | 字节流 + 目标目录 | true / nil+err |
| `extract_selected(zip_bytes, dest_dir, path_list)` | 字节流 + 目录 + 路径列表 | true / nil+err |

#### Scenario: 选择性提取
- **WHEN** 调用 `extract_selected(zip_bytes, "/tmp/", {"config.yml", "manifest.json"})` 且 ZIP 中包含这两个文件
- **THEN** 仅提取 `config.yml` 和 `manifest.json` 到 `/tmp/`，忽略 ZIP 中其他文件
