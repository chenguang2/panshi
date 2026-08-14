## 1. 后端：四层代理 sheet 增加 DNS 配置列

- [ ] 1.1 在 `backend/app/api/v1/cluster_export.py` 的「四层代理」sheet（`_build_workbook` 内，line 312-324）行构造中追加：`_fmt_json(s.dns_config) if s.proxy_type == "dns" else ""`（列尾追加）
- [ ] 1.2 headers 追加 `"DNS 配置"`（在「创建时间」之后）
- [ ] 1.3 确认四层代理 sheet 无 `link_cols`（无超链接），追加列不影响现有列索引

## 2. 后端：pytest 测试

- [ ] 2.1 在 `backend/tests/test_excel_export.py` 的 seed 数据中增加一个 DNS 代理（`proxy_type="dns"` + 含 hosts/ttl_valid/nodes 的 `dns_config` JSON）与一个普通四层代理（对照）
- [ ] 2.2 新增测试断言：「四层代理」sheet 头含 `DNS 配置` 列；DNS 行该列含域名与节点信息（如 `example.com`、节点 IP）；普通行该列为空
- [ ] 2.3 检查现有 `test_export_all_resource_types` 的四层代理 sheet 断言是否需同步更新（若按列索引断言则更新）

## 3. 文档

- [ ] 3.1 更新 `openspec/specs/cluster-data-export/spec.md` 的「四层代理」sheet 列描述，追加 `DNS 配置`（dns_config）说明

## 4. 验证

- [ ] 4.1 `cd backend && uv run pytest tests/test_excel_export.py -q`（新增测试通过，无回归）
- [ ] 4.2 手动链路：连接 `http://localhost:12345`，统一管理页对含 DNS 代理的集群点「导出 Excel」，打开文件确认四层代理 sheet 的 DNS 行含域名/节点配置、普通行为空
