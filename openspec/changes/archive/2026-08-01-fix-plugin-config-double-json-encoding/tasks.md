## 1. 前端修复

- [x] 1.1 修改 `frontend/src/components/PluginEditorDrawer.vue` 的 `watch(jsonEditorValue)`：`jsonConfig.value = typeof newVal === 'string' ? newVal : JSON.stringify(newVal)`，杜绝字符串二次编码
- [x] 1.2 修改 `watch(jsonConfig)`：增加 `typeof jsonEditorValue.value !== 'string'` 守卫，阻断字符串→对象回写（防止反馈环导致编辑器内容重置/光标跳变）
- [x] 1.3 移除 `fullJsonConfig` 死代码（line 672 声明 + line 1051 赋值）
- [x] 1.4 确认 `handleSave` JSON 模式路径无需改动（`JSON.parse(jsonConfig.value)` 校验 + 原样 emit 单层字符串）

## 2. 单元测试

- [x] 2.1 在 `frontend/src/components/__tests__/` 新增 PluginEditorDrawer JSON 模式序列化测试：编辑器发出字符串时，`jsonConfig.value` 保持单层（`JSON.parse` 结果为对象）
- [x] 2.2 反馈环收敛测试：`jsonEditorValue` 为字符串时，watch2 不回写对象（`jsonEditorValue` 保持字符串、`jsonConfig` 不变）
- [x] 2.3 表单模式回归测试：`buildConfigFromForm` 输出仍是单层 JSON 字符串

## 3. 验证

- [x] 3.1 运行 `npx vitest run` 全部通过（新增 6 测试全绿；11 个预先存在失败与本次改动无关，已还原验证确认）
- [x] 3.2 运行 `npm run build` 构建成功
- [x] 3.3 后端运行 `uv run pytest` 确认无回归（26 个失败均为预先存在，本次改动未触碰后端）

## 4. 存量数据修复

- [x] 4.1 提供并运行一次性脚本 `backend/scripts/fix_double_encoded_plugin_config.py`（分两类扫描）：
  - `ps_route_plugin.config`：行级 `json.loads` 一次后仍为 str 的行解包一层（route 8 proxy_rewrite 已修复，DB 已备份）
  - `ps_plugin_config.plugins` / `ps_global_rule.plugins`：递归检查 dict 中每个插件值，对"可解析 JSON 的字符串"解包为对象（当前两表 0 行，防御未来）
- [x] 4.2 通过 API 重新保存 route 8 插件配置（模拟界面保存），发布 payload 中 `plugins.proxy_rewrite` 已为对象，Edge 不再报 400

## 5. 收尾

- [x] 5.1 运行 `openspec validate --change fix-plugin-config-double-json-encoding` 校验通过
- [x] 5.2 更新文档/变更记录（如需）
