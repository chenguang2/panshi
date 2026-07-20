# 国密 SM2 双证书测试套件使用说明

## 证书链结构

```
CA Root (Panshi GM Root CA，自签名)
 ├── Server Sign (CN=gmtest.local, keyUsage=digitalSignature)
 ├── Server Enc  (CN=gmtest.local, keyUsage=keyEncipherment)
 ├── Client Sign (CN=gmclient, keyUsage=digitalSignature)
 └── Client Enc  (CN=gmclient, keyUsage=keyEncipherment)
```

## 文件清单

| 路径 | 说明 |
|------|------|
| `ca/ca.crt` | CA 根证书（自签名，10年有效期） |
| `ca/ca.key` | CA 根私钥（妥善保管） |
| `server/server_sign.crt` | 服务端**签名证书** |
| `server/server_sign.key` | 服务端签名私钥 |
| `server/server_enc.crt` | 服务端**加密证书** |
| `server/server_enc.key` | 服务端加密私钥 |
| `client/client_sign.crt` | 客户端**签名证书** |
| `client/client_sign.key` | 客户端签名私钥 |
| `client/client_enc.crt` | 客户端**加密证书** |
| `client/client_enc.key` | 客户端加密私钥 |
| `combined/gm_ca.crt` | CA 根证书（用于 `-verifyCAfile`） |
| `combined/server_full.pem` | 服务端完整包（供 Edge API POST） |
| `combined/client_full.pem` | 客户端完整包 |
| `combined/server_sign.pem` | 服务端签名证书+私钥（供 `-sign_cert`） |
| `combined/server_enc.pem` | 服务端加密证书+私钥（供 `-enc_cert`） |
| `combined/client_sign.pem` | 客户端签名证书+私钥 |
| `combined/client_enc.pem` | 客户端加密证书+私钥 |
| `combined/server_chain.crt` | 服务端签名证书链（sign+CA） |
| `combined/server_enc_chain.crt` | 服务端加密证书链（enc+CA） |

## 前置条件

1. 启动 Edge 服务并开启国密扩展（`ex_plugins.gmssl: true`）
2. 配置 hosts：
   ```sh
   echo "127.0.0.1  gmtest.local" >> /etc/hosts
   ```
3. Tongsuo openssl 路径（根据实际情况调整）：
   ```sh
   TONGSUO=/path/to/tongsuo/bin/openssl
   ```

## 1. 配置 Edge 服务端

通过管理接口 POST 国密双证书：

```
POST /edge/admin/ssl/8001
```

```json
{
  "cert": "<server_enc.crt 内容>",
  "key":  "<server_enc.key 内容>",
  "certs": ["<server_sign.crt 内容>"],
  "keys":  ["<server_sign.key 内容>"],
  "gm": true,
  "snis": ["gmtest.local"]
}
```

字段对应关系：

| API 字段 | 本地文件 | 说明 |
|----------|----------|------|
| `cert` | `server/server_enc.crt` | 加密证书（**不可填反**） |
| `key` | `server/server_enc.key` | 加密私钥 |
| `certs[0]` | `server/server_sign.crt` | 签名证书 |
| `keys[0]` | `server/server_sign.key` | 签名私钥 |

## 2. s_client 握手测试

### 2.1 单向认证（ECC-SM2-* 套件）

服务端只需部署签名证书和加密证书，客户端不需提供证书。

```sh
$TONGSUO s_client \
  -connect gmtest.local:9943 -servername gmtest.local \
  -cipher ECC-SM2-SM4-GCM-SM3 -enable_ntls -ntls \
  -verifyCAfile combined/gm_ca.crt
```

### 2.2 双向认证（ECDHE-SM2-* 套件，强制客户端证书）

**采用组合文件方式（推荐）：**

```sh
$TONGSUO s_client \
  -connect gmtest.local:9943 -servername gmtest.local \
  -cipher ECDHE-SM2-SM4-GCM-SM3 -enable_ntls -ntls \
  -verifyCAfile combined/gm_ca.crt \
  -sign_cert combined/client_sign.pem \
  -enc_cert combined/client_enc.pem
```

**采用独立文件方式：**

```sh
$TONGSUO s_client \
  -connect gmtest.local:9943 -servername gmtest.local \
  -cipher ECDHE-SM2-SM4-GCM-SM3 -enable_ntls -ntls \
  -verifyCAfile combined/gm_ca.crt \
  -sign_cert client/client_sign.crt -sign_key client/client_sign.key \
  -enc_cert client/client_enc.crt -enc_key client/client_enc.key
```

### 2.3 验证结果

握手成功关键输出：

```
SSL handshake has read 1344 bytes and written 1323 bytes
Verification: OK
---
New, NTLSv1.1, Cipher is ECDHE-SM2-SM4-GCM-SM3
Server public key is 256 bit
```

## 3. 完整 HTTP 请求测试

```sh
echo -e "GET / HTTP/1.1\r\nHost: gmtest.local\r\nConnection: close\r\n\r\n" | \
$TONGSUO s_client \
  -connect gmtest.local:9943 -servername gmtest.local \
  -cipher ECDHE-SM2-SM4-GCM-SM3 -enable_ntls -ntls \
  -verifyCAfile combined/gm_ca.crt \
  -sign_cert combined/client_sign.pem \
  -enc_cert combined/client_enc.pem \
  -ign_eof
```

## 4. 浏览器访问

> 注意：普通浏览器（Chrome/Firefox/Edge）不支持国密 NTLS 协议。
> 需要使用支持国密的浏览器（如 360 国密浏览器、奇安信可信浏览器等）。

浏览器端需要：
1. 导入 `ca/ca.crt` 到系统/浏览器**受信任的根证书颁发机构**
2. 对于双向认证场景（ECDHE-SM2-*），还需将 `client_sign.p12` / `client_enc.p12` 导入浏览器**个人证书**

## 5. 密码套件选择指引

| 套件 | 前向保密 | 双向认证 | 适用场景 |
|------|----------|----------|----------|
| `ECC-SM2-SM4-GCM-SM3` | ❌ | ❌ | 内网、兼容性优先 |
| `ECDHE-SM2-SM4-GCM-SM3` | ✅ | ✅（强制）| 外网、安全要求高 |
| `ECC-SM2-SM4-CBC-SM3` | ❌ | ❌ | 兼容性兜底 |
| `TLS_SM4_GCM_SM3`（TLS 1.3） | ✅ | ❌ | RFC 8998 标准 TLS |

## 6. 重新生成

直接运行 `gen_certs.sh` 即可重新生成全套证书：

```sh
cd product/linux/test-certs/gm
bash gen_certs.sh
```

默认信息：

| 参数 | 值 |
|------|-----|
| 域名 | `gmtest.local` |
| CA 有效期 | 10 年 |
| 终端证书有效期 | 10 年 |
| 签名算法 | SM2-with-SM3 |
| 密钥曲线 | SM2 (sm2p256v1) |
