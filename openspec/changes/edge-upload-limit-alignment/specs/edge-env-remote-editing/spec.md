# Spec Delta

## ADDED Requirements

### Requirement: edge.env 部署前的 Edge 上传上限对齐

`POST /clusters/{cluster_id}/edge-env/deploy` SHALL 在下发前按平台上限（`features.yaml` 的 `limits.static_zip_max_mb`，缺省 32）检查提交内容中 `deploy.http.admin.client_max_body_size`：

- 缺失 → SHALL 写入 `{平台上限}m`；
- 低于平台上限 → SHALL 抬到 `{平台上限}m`（回报原值）；
- 高于平台上限 → SHALL 保留原值，不下调；
- 编辑内容无法解析为 YAML 或缺失既有必填结构 → 沿用既有校验错误，不写入。

补齐 SHALL 为**文本级**修改：只增/改该单行，其余行、缩进、注释与顺序 SHALL 保持不变。补齐结果 SHALL 通过部署流（SSE 事件行与逐节点日志）与响应显式回报（中文说明，如「已自动补齐 `http.admin.client_max_body_size: 132m`（平台上限），Edge 发布腿才能接受大 zip」）。

#### Scenario: 未配置 admin 段上限时自动写入

- **WHEN** 用户部署的 edge.env 中没有 `deploy.http.admin.client_max_body_size`（可能只有 `deploy.http.client_max_body_size`）
- **THEN** 部署前 SHALL 在 `deploy.http.admin` 下写入 `client_max_body_size: {平台上限}m`
- **AND** 部署流 SHALL 输出一行说明此为自动补齐

#### Scenario: admin 段上限低于平台上限时抬高

- **WHEN** 提交内容中 `deploy.http.admin.client_max_body_size: 32m` 而平台上限为 132
- **THEN** 下发内容 SHALL 变为 `132m`
- **AND** 说明 SHALL 回显「32m → 132m」

#### Scenario: admin 段上限高于平台上限时保留

- **WHEN** 提交内容为 `deploy.http.admin.client_max_body_size: 256m` 而平台上限为 132
- **THEN** 下发内容 SHALL 保持 `256m`

#### Scenario: 用户内容其余部分不受影响

- **WHEN** 触发自动补齐
- **THEN** 除目标单行外，注释、缩进、行顺序与其它配置 SHALL 与提交内容逐行一致

### Requirement: edge.env 读取响应的 Edge 生效上限诊断

`GET /clusters/{cluster_id}/edge-env` SHALL 在返回节点配置内容的同时返回诊断段 `limits`，至少含：平台上限（MB）、admin 段配置值（未配置为 null）、按 Edge pack 基线推算的生效上限（MB）、是否充足（bool）、中文说明。生效上限判定：`deploy.http.admin.client_max_body_size` 存在 → 取该值；缺失 → 视为 Edge pack 的 server 级基线 **32MB**（此时即使 http 段配置更大也不生效）。

#### Scenario: 未配置 admin 段时给出 32MB 生效值与说明

- **WHEN** 节点 edge.env 只有 `deploy.http.client_max_body_size: 132m`，没有 admin 段该项
- **THEN** 响应 `limits.effective_mb` SHALL 为 32
- **AND** `limits.sufficient` SHALL 为 false（当平台上限 > 32）
- **AND** `limits.note` SHALL 说明「Edge pack server 级默认 32MB 生效，须写在 http.admin 段」

#### Scenario: admin 段已对齐

- **WHEN** `deploy.http.admin.client_max_body_size: 132m` 且平台上限 132
- **THEN** `limits.effective_mb` SHALL 为 132、`limits.sufficient` SHALL 为 true
