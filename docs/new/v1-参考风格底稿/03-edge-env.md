# 第 3 章　修改 edge.env（新增端口）

本章作用：告诉网关**要监听哪些端口、提供哪些能力**。`edge.env` 是 Edge 网关的核心配置文件，位于每个节点的 Edge 安装目录下。本章做三件事：

1. 新增 HTTP 服务端口 **5000**，并启用 **HTTPS**；
2. 在 stream（四层）模块新增 TCP 监听端口 **8880**（第 10 章的四层代理要用）；
3. 确认 UDP **53** 已监听（第 11 章 DNS 代理要用）。

改完并发布后，网关才会真正打开这些端口。

---

## 背景：edge.env 的结构

```yaml
deploy:
  http:                # 七层 HTTP 模块
    edge:              # 对外服务子模块
      listen:          # ← 服务端口列表
        - addr: 0.0.0.0:16610        # 现有 HTTP 端口
        - addr: 0.0.0.0:5000         # ← 本章新增
          ssl: true                  # ← 启用 HTTPS
    admin:
      listen:
        - addr: 0.0.0.0:16620       # 管理 API（节点管理端口）
  stream:              # 四层 TCP/UDP 模块（默认名为 NOstream=禁用）
    edge:
      listen:
        - addr: 0.0.0.0:53
          udp: true                   # UDP 53：DNS 代理用
        - addr: 0.0.0.0:8880          # ← 本章新增 TCP 8880
  #dns:                # DNS 解析器（DNS 代理的上游）
  #  resolver:
  #    - 114.114.114.114
ex_plugins: ...        # HTTP 插件开关
ex_stream_plugins: ... # 四层插件开关
plugin_attr: ...       # 插件静态属性
```

关键规则：

| 配置点 | 说明 |
|---|---|
| `deploy.http.edge.listen[].addr` | HTTP 监听地址端口，可配多条 |
| `ssl: true` | 该端口启用 HTTPS（证书由第 9 章发布到节点后生效） |
| 模块名 `NOstream` → `stream` | 把名字里的 NO 去掉即启用该模块 |
| `listen[].udp: true` | 该条监听走 UDP 而非 TCP |
| `deploy.dns.resolver` | DNS 代理转发用的上游 DNS 列表 |

> 📖 完整字段说明见《Edge 使用手册》§3「edge.env 配置项详解」（docs/edge/user-guide/使用手册.md）。

---

## 页面入口

侧边栏「边缘网络 → edge.env 配置」。

![edge.env 初始页](images/03-01-edgeenv-initial.png)

页面顶部从左到右：集群选择 → 节点选择；右上角三个动作按钮：

| 按钮 | 作用 |
|---|---|
| **获取配置模板** | 通过 SSH 从所选节点读取当前 edge.env 到编辑器 |
| **发布** | 把编辑器内容推送到勾选的节点（带版本记录，可回滚） |
| **版本管理** | 查看历史版本 / 回滚 |

![选择集群与节点](images/03-02-edgeenv-selected.png)

---

## 操作步骤

### 3.1 读取当前配置

1. 选择集群 `演示集群`，节点 `192.168.0.13:16620`。
2. 点击「获取配置模板」。平台通过 Ansible/SSH 连接节点读取文件，弹窗实时显示执行日志：

![读取配置模板执行日志](images/03-03-edgeenv-read-done.png)

3. 看到 `ok: [192.168.0.13]` 表示读取成功，点击「关闭」，内容已载入下方编辑器。

![编辑器中的 edge.env](images/03-04-edgeenv-editor.png)

> ⚠️ 若读取失败：多为 SSH 不通（密钥未配置 / 端口不对）。可先手动把 edge.env 内容粘贴进编辑器继续。

### 3.2 修改三处

在编辑器中定位并修改（保持 YAML 缩进，两级空格）：

**① http.edge.listen 增加 5000 并启用 HTTPS：**

```yaml
      listen:
        - addr: 0.0.0.0:16610
        - addr: 0.0.0.0:5000     # ← 新增
          ssl: true              # ← HTTPS
```

**② stream.edge.listen 增加 TCP 8880：**

```yaml
      listen:
        - addr: 0.0.0.0:53
          udp: true
        - addr: 0.0.0.0:8880     # ← 新增（不带 udp 即为 TCP）
```

**③ 确认 UDP 53 存在**（本演示环境已有，如无请按上面格式补一条 `- addr: 0.0.0.0:53` + `udp: true`）。

修改完成后的编辑器：

![修改后的 edge.env](images/03-05-edgeenv-modified.png)

> 💡 编辑器是 Monaco，支持 YAML 语法高亮；粘贴大段内容比逐字输入更不容易破坏缩进。

### 3.3 发布

1. 点击右上角「发布」，弹出变更确认框（绿色为将写入的新增行）：

![确认变更 diff](images/03-06-publish-diff.png)

2. 点击「继续选择节点」，勾选要发布的节点（本章先发 `.13` 一台验证，成功后再补其余两台）：

![选择发布节点](images/03-07-publish-nodes.png)
![勾选节点](images/03-08-publish-node-checked.png)

3. 点击「确认发布」，进度弹窗实时显示每台节点的执行日志：

![发布进度](images/03-09-publish-progress.png)

4. 结束后查看结果：
   - `success` = 该节点已更新并重载网关；
   - `failed` = 显示具体错误（连接拒绝/认证失败等），修复后重新发布即可，不影响其他节点。

✅ **验证**

- 方法一：再次点击「获取配置模板」，确认读回的内容包含 5000/8880。
- 方法二：在能连通节点的机器上执行：
  ```bash
  curl -k https://192.168.0.13:5000/ -I     # HTTPS 端口应答（证书未配置前会告警，属正常）
  timeout 3 bash -c 'cat < /dev/null > /dev/tcp/192.168.0.13/8880' && echo "TCP 8880 通"
  ```
- 📷 截图待补充：（发布成功后的版本管理列表，显示 v1 记录）

> ⚠️ 其余两台节点（.14/.15）：重复 3.1-3.3，或在 3.3 第 2 步同时勾选三台一次发布。生产建议先灰度一台再全量。

---

## 本章小结

- edge.env 决定网关"听什么端口、开什么模块"
- 改动流程固定为：**读取 → 编辑 → 发布（选节点）→ 验证**
- 每次发布自动生成版本，可在「版本管理」中回滚
- 本章打开的 5000(HTTPS)/8880(TCP)/53(UDP) 将分别在第 8、10、11 章被业务配置使用

下一步：[第 4 章 建立全局规则](04-global-rules.md)
