#!/bin/bash
# ============================================================
# 国密 SM2 双证书完整证书链生成脚本
# 使用 Tongsuo 8.5.0
# 生成: CA根证书 + 服务端签名/加密证书 + 客户端签名/加密证书
# ============================================================
set -euo pipefail

TONGSUO="/home/qcg/panshi/product/linux/tongsuo/bin/openssl"
DIR="$(cd "$(dirname "$0")" && pwd)"
DAYS_CA=3650
DAYS_END=3650
COMMON_NAME="gmtest.local"
DNS_SAN="gmtest.local"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
step()  { echo -e "${BLUE}[STEP]${NC} $1"; }
done_s() { echo -e "  ${GREEN}✓${NC} $1"; }

cd "$DIR"

# ---- openssl.cnf for req ----
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no

[ req_distinguished_name ]
CNF

# ---- Extension config with SAN for server certs ----
cat > ext.cnf << 'EXT'
[v3_ca]
basicConstraints = CA:TRUE, pathlen:1
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer

[v3_sign_server]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, nonRepudiation
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = DNS:gmtest.local

[v3_enc_server]
basicConstraints = CA:FALSE
keyUsage = critical, keyEncipherment, dataEncipherment
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = DNS:gmtest.local

[v3_sign_client]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, nonRepudiation
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer

[v3_enc_client]
basicConstraints = CA:FALSE
keyUsage = critical, keyEncipherment, dataEncipherment
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EXT

SIGOPT="-sigopt sm2_id:1234567812345678"

# ===== 1. CA Root =====
step "1/5: 生成 CA 根证书"

"$TONGSUO" ecparam -genkey -name SM2 -out ca/ca.key
done_s "CA 私钥"

"$TONGSUO" req -new -key ca/ca.key -out ca/ca.csr \
  -config openssl.cnf \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=PanshiAdmin/OU=GM Root CA/CN=Panshi GM Root CA" $SIGOPT
done_s "CA CSR"

"$TONGSUO" x509 -req -days "$DAYS_CA" -sm3 \
  -in ca/ca.csr -signkey ca/ca.key \
  -out ca/ca.crt \
  -extfile ext.cnf -extensions v3_ca $SIGOPT
done_s "CA 根证书"

# ===== 2. Server Sign =====
step "2/5: 服务端签名证书"

"$TONGSUO" ecparam -genkey -name SM2 -out server/server_sign.key
"$TONGSUO" req -new -key server/server_sign.key -out server/server_sign.csr \
  -config openssl.cnf \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=PanshiAdmin/OU=GM Server/CN=${COMMON_NAME}" $SIGOPT
"$TONGSUO" x509 -req -days "$DAYS_END" -sm3 \
  -in server/server_sign.csr \
  -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -out server/server_sign.crt \
  -extfile ext.cnf -extensions v3_sign_server $SIGOPT
done_s "服务端签名证书"

# ===== 3. Server Enc =====
step "3/5: 服务端加密证书"

"$TONGSUO" ecparam -genkey -name SM2 -out server/server_enc.key
"$TONGSUO" req -new -key server/server_enc.key -out server/server_enc.csr \
  -config openssl.cnf \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=PanshiAdmin/OU=GM Server/CN=${COMMON_NAME}" $SIGOPT
"$TONGSUO" x509 -req -days "$DAYS_END" -sm3 \
  -in server/server_enc.csr \
  -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -out server/server_enc.crt \
  -extfile ext.cnf -extensions v3_enc_server $SIGOPT
done_s "服务端加密证书"

# ===== 4. Client Sign =====
step "4/5: 客户端签名证书"

"$TONGSUO" ecparam -genkey -name SM2 -out client/client_sign.key
"$TONGSUO" req -new -key client/client_sign.key -out client/client_sign.csr \
  -config openssl.cnf \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=PanshiAdmin/OU=GM Client/CN=gmclient" $SIGOPT
"$TONGSUO" x509 -req -days "$DAYS_END" -sm3 \
  -in client/client_sign.csr \
  -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -out client/client_sign.crt \
  -extfile ext.cnf -extensions v3_sign_client $SIGOPT
done_s "客户端签名证书"

# ===== 5. Client Enc =====
step "5/5: 客户端加密证书"

"$TONGSUO" ecparam -genkey -name SM2 -out client/client_enc.key
"$TONGSUO" req -new -key client/client_enc.key -out client/client_enc.csr \
  -config openssl.cnf \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=PanshiAdmin/OU=GM Client/CN=gmclient" $SIGOPT
"$TONGSUO" x509 -req -days "$DAYS_END" -sm3 \
  -in client/client_enc.csr \
  -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -out client/client_enc.crt \
  -extfile ext.cnf -extensions v3_enc_client $SIGOPT
done_s "客户端加密证书"

# ===== Combine =====
step "组合证书链..."

cp ca/ca.crt combined/gm_ca.crt

# Server
cat server/server_sign.crt ca/ca.crt > combined/server_chain.crt
cat server/server_enc.crt ca/ca.crt > combined/server_enc_chain.crt
cat server/server_enc.crt server/server_enc.key > combined/server_enc.pem
cat server/server_sign.crt server/server_sign.key > combined/server_sign.pem

# Client
cat client/client_sign.crt ca/ca.crt > combined/client_sign_chain.crt
cat client/client_enc.crt ca/ca.crt > combined/client_enc_chain.crt
cat client/client_sign.crt client/client_sign.key > combined/client_sign.pem
cat client/client_enc.crt client/client_enc.key > combined/client_enc.pem

# Full bundles
cat server/server_enc.crt server/server_enc.key server/server_sign.crt server/server_sign.key > combined/server_full.pem
cat client/client_enc.crt client/client_enc.key client/client_sign.crt client/client_sign.key > combined/client_full.pem
done_s "组合文件就绪"

# ===== Verify =====
step "验证证书..."
for f in ca/ca.crt server/server_sign.crt server/server_enc.crt \
         client/client_sign.crt client/client_enc.crt; do
  "$TONGSUO" x509 -in "$f" -noout -text > /dev/null 2>&1 && \
    echo -e "  ${GREEN}✓${NC} $f" || \
    { echo -e "  ${RED}✗${NC} $f"; exit 1; }
done

echo ""
step "验证 CA 签发链..."
for f in server/server_sign.crt server/server_enc.crt \
         client/client_sign.crt client/client_enc.crt; do
  if "$TONGSUO" verify -CAfile ca/ca.crt "$f" 2>&1 | grep -q "OK"; then
    echo -e "  ${GREEN}✓${NC} $f (CA 签发 OK)"
  else
    echo -e "  ${RED}✗${NC} $f"
    "$TONGSUO" verify -CAfile ca/ca.crt "$f" 2>&1
    exit 1
  fi
done

echo ""
step "验证 SAN..."
for f in server/server_sign.crt server/server_enc.crt; do
  san=$("$TONGSUO" x509 -in "$f" -noout -ext subjectAltName 2>/dev/null)
  if echo "$san" | grep -q "DNS"; then
    echo -e "  ${GREEN}✓${NC} $f SAN: $(echo $san | head -1)"
  else
    echo -e "  ${RED}✗${NC} $f: 缺少 SAN"
  fi
done

rm -f openssl.cnf ext.cnf ca/ca.srl ca/*.csr server/*.csr client/*.csr

echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  国密双证书测试套件生成完毕！${NC}"
echo -e "${BLUE}  路径: $DIR${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
