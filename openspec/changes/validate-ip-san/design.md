## Context

生成证书的 IP SAN 输入框无 IP 格式校验。前端 `SslGenerateDialog.vue` 的 `addIpTag()` 仅做 `splitSniTags` 拆分去重，任意字符串都可加入 `ipTags` 并作为 `ip_sans` 提交；后端 `SslCertificateGenerateRequest.ip_sans` 为 `list[str]` 无 validator，`_build_san_args()` 直接 `IP:{value}` 拼接。非 IP 值（如 `abc`）会被写进证书 SAN，导致 openssl 生成失败或产生无效 SAN。

现有可参考：`SslFormDrawer.vue` 已有 `isIpAddress()`（IPv4 正则 + IPv6 判断），但 IPv6 判断 `^[0-9a-fA-F:]+$` 较宽松（可接受 `:::` 等非法值）。

## Goals / Non-Goals

**Goals:**
- IP SAN 输入必须为合法 IPv4 或 IPv6，前后端均校验
- 非法输入：前端拒绝并提示，后端返回 422
- 保持 DNS SAN 与 IP SAN 分离的现有行为不变

**Non-Goals:**
- 不校验 DNS SAN 的域名格式（本次只针对 IP SAN）
- 不引入 IP 解析库（用标准库/正则即可满足）

## Decisions

### 决策 1：使用 `ipaddress` 标准库做后端校验

**选择**：后端用 Python 标准库 `ipaddress.ip_address()` 校验，而非自定义正则。

**理由**：
- `ipaddress` 是标准库，能准确判断 IPv4/IPv6，覆盖边界情况（如 `256.1.1.1`、`1.2.3`、`:::`）
- 比手写正则更可靠、更易维护
- 无需新增依赖

**实现**（`schemas/ssl.py`）：
```python
import ipaddress

@field_validator("ip_sans")
@classmethod
def validate_ip_sans(cls, v):
    for ip in v or []:
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            raise ValueError(f"无效的 IP 地址: {ip}")
    return v
```
非法值由 Pydantic 抛出 422（带 `ip_sans` 字段错误）。

**替代方案（放弃）**：
- 自定义正则——难以覆盖 IPv6 全部合法形态，易漏判或误判

### 决策 2：前端复用/增强 IP 校验函数

**选择**：把 `SslFormDrawer.vue` 的 `isIpAddress()` 抽取为共享工具（`frontend/src/utils/ip.ts`），并增强 IPv6 校验；`SslGenerateDialog.vue` 的 `addIpTag()` 用其校验，非法值拒绝并 `message.warning` 提示。

**理由**：
- 复用避免重复代码（`SslFormDrawer` 和 `SslGenerateDialog` 都要判断 IP）
- 抽取为 `utils/ip.ts` 后两个组件共用，便于统一维护和单测
- 前端校验提供即时反馈，后端兜底保证安全

**IPv6 校验增强**：`isIpAddress` 用正则先粗筛（含 `:`），再用 `split(':')` 检查段数/空段，或引入轻量校验。若项目已有 IP 工具则复用。

**替代方案（放弃）**：
- 只在 `SslGenerateDialog.vue` 内联校验——与 `SslFormDrawer` 重复，且两者行为不一致

### 决策 3：后端校验为权威兜底

**选择**：后端 schema validator 是**必须**的兜底（防绕过前端直接调 API），前端校验是**体验**优化（即时提示）。两者都实现。

**理由**：
- 仅前端校验可被绕过（curl 直接调 API）
- 仅后端校验则用户要提交后才知错，体验差

## Risks / Trade-offs

- [IPv6 校验正则不准导致误拒合法 IPv6] → 用 `ipaddress`（后端）与增强正则 + 段检查（前端），并加单测覆盖常见 IPv6
- [抽取 `utils/ip.ts` 影响 `SslFormDrawer` 现有行为] → 保持 `isIpAddress` 原语义（供 DNS/IP 分组用），增强仅针对非法值判定，回归测试确认
- [用户输入带 CIDR 如 `10.0.0.0/8`] → 明确非目标：IP SAN 只接受单 IP，不接受 CIDR（openssl SAN 也不接受 CIDR）

## Migration Plan

1. 后端 `schemas/ssl.py` 加 `ip_sans` validator —— 独立提交
2. 抽取 `frontend/src/utils/ip.ts` + 增强 `isIpAddress` —— 独立提交
3. `SslGenerateDialog.vue` 的 `addIpTag` 接入校验 —— 独立提交
4. 更新 `SslFormDrawer.vue` 引用共享工具（如需要）—— 独立提交
5. 无数据迁移（不影响存量证书）

## Open Questions

- 是否需要在**导入**（upload）证书路径也校验 SAN 里的 IP？当前只针对**生成**路径的输入框。导入的是完整证书文件，不涉及 IP 输入框，暂不涉及。
