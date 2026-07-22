#!/usr/bin/env bash


# ./mkcert.sh gmtest.local /path/to/openresty

__domain_name="${1:-gmtest.local}"
__expire_days=3650
__openssl_prefix="${2:-/usr/local/openresty/1.29.2.5edge@Tongsuo-8.5.0-pre1}"


SM2_ID="1234567812345678"

OUTDIR=""




t_os=$(uname -s | tr '[:upper:]' '[:lower:]')
t_CURRENT_TIME=$(date +%s)
shopt -s expand_aliases
if [ "$t_os" = "darwin" ] || [ "$t_os" = "macos" ]; then
opt_tm="-r $t_CURRENT_TIME"
else
opt_tm="-d @$t_CURRENT_TIME"
fi
t_TIMESTAMP_PACK=$(date $opt_tm +"%y%m%d")


bin_openssl="$__openssl_prefix/bin/openssl"
openssl version || exit 1



domain_name=${domain_name:-$__domain_name}
expire_days=${expire_days:-$__expire_days}


chain_ca_crt=gm_ca.crt

ca_key=ca.key
ca_crt=ca.crt
ca_csr=ca.csr
ca_days=$expire_days

subca_key=subca.key
subca_crt=subca.crt
subca_csr=subca.csr
subca_days=$expire_days


server_sign_key=server_sign.key
server_sign_crt=server_sign.crt
server_sign_csr=server_sign.csr
server_sign_days=$expire_days

server_enc_key=server_enc.key
server_enc_crt=server_enc.crt
server_enc_csr=server_enc.csr
server_enc_days=$expire_days

client_sign_key=client_sign.key
client_sign_crt=client_sign.crt
client_sign_csr=client_sign.csr
client_sign_days=$expire_days

client_enc_key=client_enc.key
client_enc_csr=client_enc.csr
client_enc_crt=client_enc.crt
client_enc_days=$expire_days


################################################################################
## working
################################################################################
workdir="${OUTDIR:-$domain_name.$t_TIMESTAMP_PACK.tmp}"
if [ ! -d "$workdir" ]; then
mkdir -p "$workdir"
fi
cd "$workdir" || exit 1


ca_cnf=ca.cnf
subca_cnf=subca.cnf

cp ../ca.cnf $ca_cnf
cat >> $ca_cnf <<!EOF!
[alt_names]
DNS.1 = $domain_name
!EOF!

cp ../subca.cnf $subca_cnf
cat >> $subca_cnf <<!EOF!
[alt_names]
DNS.1 = $domain_name
!EOF!

rm -f *.key *.csr *.crt
rm -rf {newcerts,db,private,crl}
mkdir {newcerts,db,private,crl}
touch db/{index,serial}
echo 01 > db/serial


# sm2 ca
$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $ca_key

$bin_openssl req -config $ca_cnf -new -key $ca_key -out $ca_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=root ca"

$bin_openssl ca -config $ca_cnf -selfsign -keyfile $ca_key -extensions v3_ca -days $ca_days -in $ca_csr -notext -out $ca_crt -sigopt "sm2_id:${SM2_ID}" -md sm3 -batch

# sm2 middle ca
$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $subca_key

$bin_openssl req -config $ca_cnf -new -key $subca_key -out $subca_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=sub ca"

$bin_openssl ca -config $ca_cnf -extensions v3_intermediate_ca -days $subca_days -in $subca_csr -notext -out $subca_crt -sigopt "sm2_id:${SM2_ID}" -md sm3 -batch

cat $ca_crt $subca_crt > $chain_ca_crt


# server sm2 double certs
$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $server_sign_key

$bin_openssl req -config $subca_cnf -key $server_sign_key -new -out $server_sign_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=${domain_name}"

$bin_openssl ca -config $subca_cnf -extensions server_sign_req -days $server_sign_days -in $server_sign_csr -notext -out $server_sign_crt -sigopt "sm2_id:${SM2_ID}" -sm2-id "${SM2_ID}" -md sm3 -batch

$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $server_enc_key

$bin_openssl req -config $subca_cnf -key $server_enc_key -new -out $server_enc_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=${domain_name}"

$bin_openssl ca -config $subca_cnf -extensions server_enc_req -days $server_enc_days -in $server_enc_csr -notext -out $server_enc_crt -sigopt "sm2_id:${SM2_ID}" -sm2-id "${SM2_ID}" -md sm3 -batch

# client sm2 double certs
$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $client_sign_key

$bin_openssl req -config $subca_cnf -key $client_sign_key -new -out $client_sign_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=client sign"

$bin_openssl ca -config $subca_cnf -extensions client_sign_req -days $client_sign_days -in $client_sign_csr -notext -out $client_sign_crt -sigopt "sm2_id:${SM2_ID}" -sm2-id "${SM2_ID}" -md sm3 -batch

$bin_openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:sm2 -out $client_enc_key

$bin_openssl req -config $subca_cnf -key $client_enc_key -new -out $client_enc_csr -sm3 -sigopt "sm2_id:${SM2_ID}" -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=CUN/OU=BB/CN=client enc"

$bin_openssl ca -config $subca_cnf -extensions client_enc_req -days $client_enc_days -in $client_enc_csr -notext -out $client_enc_crt -sigopt "sm2_id:${SM2_ID}" -sm2-id "${SM2_ID}" -md sm3 -batch



echo ""
echo "==> 证书链验证:"
echo "openssl" verify -CAfile "$chain_ca_crt" "$server_sign_crt"
echo "openssl" verify -CAfile "$chain_ca_crt" "$server_enc_crt"
echo "openssl" verify -CAfile "$chain_ca_crt" "$client_sign_crt"
echo "openssl" verify -CAfile "$chain_ca_crt" "$client_enc_crt"
"$bin_openssl" verify -CAfile "$chain_ca_crt" "$server_sign_crt" || true
"$bin_openssl" verify -CAfile "$chain_ca_crt" "$server_enc_crt" || true
"$bin_openssl" verify -CAfile "$chain_ca_crt" "$client_sign_crt" || true
"$bin_openssl" verify -CAfile "$chain_ca_crt" "$client_enc_crt" || true
echo "openssl" verify -partial_chain -CAfile "$subca_crt" "$server_sign_crt"
echo "openssl" verify -partial_chain -CAfile "$subca_crt" "$server_enc_crt"
echo "openssl" verify -partial_chain -CAfile "$subca_crt" "$client_sign_crt"
echo "openssl" verify -partial_chain -CAfile "$subca_crt" "$client_enc_crt"
"$bin_openssl" verify -partial_chain -CAfile "$subca_crt" "$server_sign_crt" || true
"$bin_openssl" verify -partial_chain -CAfile "$subca_crt" "$server_enc_crt" || true
"$bin_openssl" verify -partial_chain -CAfile "$subca_crt" "$client_sign_crt" || true
"$bin_openssl" verify -partial_chain -CAfile "$subca_crt" "$client_enc_crt" || true

echo ""
echo "==> 证书信息预览 (server_enc):"
"$bin_openssl" x509 -in "$server_enc_crt" -noout -subject -issuer -dates -ext subjectAltName

echo ""
echo "==> 证书信息预览 (server_sign):"
"$bin_openssl" x509 -in "$server_sign_crt" -noout -subject -issuer -dates -ext subjectAltName


echo ""
echo "==> OUTPUT:"
echo "$workdir"



