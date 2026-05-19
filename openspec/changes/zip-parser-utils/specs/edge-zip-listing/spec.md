# edge-zip-listing

## Purpose

列出 ZIP 包内所有文件的元数据信息（文件名、原始大小、压缩大小、压缩方法、CRC32），供 Edge 节点判断包内结构和决定提取策略。

## Requirements

### Requirement: 列出所有文件

Edge 节点 SHALL 能遍历 ZIP 中央目录（Central Directory），返回包内所有文件的信息列表。

#### Scenario: 正常 ZIP 列出多文件
- **WHEN** ZIP 包中包含 `index.html`（未压缩）、`app.js`（Deflate 压缩）、`style.css`（未压缩）
- **THEN** 返回包含 3 条记录的表，每条含 `name`、`size`、`compressed_size`、`compression_method`、`crc` 字段

#### Scenario: 空 ZIP 包
- **WHEN** ZIP 包中不包含任何文件（仅有空目录条目）
- **THEN** 返回空列表 `{}`

#### Scenario: 含目录结构的 ZIP
- **WHEN** ZIP 包中包含 `assets/img/logo.png`
- **THEN** 返回的文件名 SHALL 保持原始路径格式 `assets/img/logo.png`，不丢失目录层级

### Requirement: 按路径过滤文件

Edge 节点 SHALL 支持按文件路径前缀筛选 ZIP 内的文件列表。

#### Scenario: 按前缀过滤成功
- **WHEN** ZIP 包中有 `js/app.js`、`js/utils.js`、`css/style.css`，调用 `list_files(zip, "js/")`
- **THEN** 返回 `js/app.js` 和 `js/utils.js` 两条记录，不含 `css/style.css`

#### Scenario: 前缀无匹配
- **WHEN** ZIP 包中无任何以指定前缀开头的文件
- **THEN** 返回空列表 `{}`

### Requirement: 返回文件元数据格式

每条文件记录 SHALL 包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 文件路径名 |
| `size` | integer | 解压后原始大小（字节） |
| `compressed_size` | integer | 压缩后大小（字节） |
| `compression_method` | integer | 0=Store（未压缩），8=Deflate |
| `crc` | integer | CRC32 校验值 |

#### Scenario: 字段完整性
- **WHEN** 调用 `list_files()` 返回文件列表
- **THEN** 每条记录 SHALL 包含上述全部 5 个字段，无缺失
