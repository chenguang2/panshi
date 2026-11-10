# tasks: tools-keepalived-per-node-nic

- [x] 1. utils 模型与解析（TDD 先红）：`KeepalivedNode {ip, iface}`、删全局 `iface`、`parseKeepalivedNodesText`（行级红字带行号）、网卡名字符集校验、`validateKeepalivedInput` 改结构化节点
- [x] 2. utils 渲染：`nodeConf` 的 `interface` 与 `virtual_ipaddress` dev/label 用本机网卡、`nodeFirewall` 的 `tcpdump -i` 用本机网卡、`handbook` 按唯一网卡集合列举（单网卡输出逐字不变）
- [x] 3. Tools.vue：删除「网卡名」输入框、节点列表标签/placeholder 改行格式、「各节点配置」文案改差异五处、`clearTool` 同步、`kaValidation` 合并行级错误
- [x] 4. 测试：`keepalived.test.ts` 夹具改行格式（输出断言不动）+ 新增多网卡/解析错误用例；`Tools.test.ts` `fillSample` 去掉网卡输入、textarea 改 `IP 网卡名` 行
- [x] 5. 验证：定向 vitest（keepalived + Tools 页 50/50）+ `vue-tsc -b` 0 错 + ESLint 0 错
- [x] 6. 实机验证：dev 环境 `?tool=keepalived` 多网卡样例 9/9 断言全过（逐节点 interface/dev/label、防火墙 tcpdump、手册按网卡集合、行级红字带行号；截图 /tmp/opencode/keepalived-page-verify.png）
- [x] 7. `openspec validate --all` 收口；实施完成后归档合并主 spec
