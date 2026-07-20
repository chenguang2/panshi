## 1. Core Certificate Generation Functions

- [ ] 1.1 Add `generate_ca_certificate()` in `cert_generator.py` — generates SM2 CA key pair + self-signed CA certificate with `CA:TRUE, pathlen:0`/`keyCertSign`/`cRLSign` extensions
- [ ] 1.2 Add `ca_sign_csr()` in `cert_generator.py` — signs a given CSR with CA cert+key, supports passing extension config for sign vs enc cert types; terminal cert validity auto-truncated to not exceed CA
- [ ] 1.3 Add `generate_full_gm_chain()` in `cert_generator.py` — orchestrates CA gen + server dual certs (CA-signed) + client dual certs (CA-signed) in one call; supports both local and remote generation
- [ ] 1.4 Refactor `generate_dual_certificates()` to accept optional `ca_cert_pem`/`ca_key_pem` parameters — use CA signing when provided, fall back to self-sign for backward compatibility
- [ ] 1.5 Add `_generate_remote_full_chain()` in `cluster_ssl.py` — remote SSH script for CA gen + server dual certs + client dual certs with marker-based step reporting
- [ ] 1.6 Write unit tests for `generate_ca_certificate()`, `ca_sign_csr()`, and `generate_full_gm_chain()`

## 2. Data Model & Schema

- [ ] 2.1 Add `is_ca` (Boolean, default false) column to `SslCertificate` model
- [ ] 2.2 Add `ca_cert_id` (Integer, FK to `ps_ssl_certificate.id`, nullable) column to `SslCertificate` model — CA records have `ca_cert_id=null`
- [ ] 2.3 Add DB migration for new columns
- [ ] 2.4 Update `SslCertificateCreate`/`SslCertificateResponse` schemas with `is_ca`, `ca_cert_id` fields
- [ ] 2.5 Add `generate_ca`, `generate_client_certs`, `ca_cert_id`, `validity_days_ca` fields to `SslCertificateGenerateRequest`; add model_validator for mutual exclusion
- [ ] 2.6 Add `ca_cert_id`, `client_cert_id` to generate API response schema
- [ ] 2.7 Add dedicated API endpoint for CA private key download (`GET /ssl/{id}/ca-key`) with confirmation
- [ ] 2.8 Update TypeScript types in `frontend/src/types/ssl.ts` to match

## 3. API Endpoint — Generate

- [ ] 3.1 Modify `_generate_local()` to handle `generate_ca=true` — create CA cert + save as SslCertificate record with `is_ca=true`
- [ ] 3.2 Modify `_generate_local()` to use CA-signed flow when CA is available — pass CA to `generate_dual_certificates()` instead of self-sign; handle `ca_cert_id` parameter for reusing existing CA
- [ ] 3.3 Add client cert generation path in `_generate_local()` when `generate_client_certs=true` — generate and save as `cert_type=client`, CN = `{common_name}-client`
- [ ] 3.4 Modify `_generate_remote()` to support CA chain — generate CA + server dual + client dual via SSH script; transfer CA private key back securely
- [ ] 3.5 Return enhanced response with `ca_cert_id` and `client_cert_id` for both local and remote modes
- [ ] 3.6 Add `ca_cert_id` parameter validation — must belong to same cluster and `is_ca=true`; mutual exclusion with `generate_ca=true`

## 4. Publish & Delete

- [ ] 4.1 Modify publish logic in `cluster_ssl.py` to JOIN `ca_cert_id` and append CA cert PEM to `config_data["cert_chain"]` when publishing a GM cert with CA
- [ ] 4.2 Add API-level check to reject publish for `cert_type=client` with 400 error
- [ ] 4.3 Add delete guard: if CA record has dependent certificates (`ca_cert_id` references), reject DELETE with 400

## 5. Frontend — SSL List Page

- [ ] 5.1 Add tab switching on SSL list page — "全部证书" tab (is_ca=false) and "CA 根证书" tab (is_ca=true)
- [ ] 5.2 Add CA certificate badge/label on certificate card when `is_ca=true`
- [ ] 5.3 Hide "发布" button for `cert_type=client` certificates
- [ ] 5.4 Show soft warning when generating new CA and cluster already has existing CA(s)

## 6. Frontend — SSL Generate Dialog

- [ ] 6.1 Add "生成 CA 根证书" toggle switch to `SslGenerateDialog`
- [ ] 6.2 Add "签发 CA" selector dropdown — lists `is_ca=true` records of same cluster, shown when CA toggle is off
- [ ] 6.3 Add "同时生成客户端证书" toggle switch (visible only when CA generation is enabled)
- [ ] 6.4 Add CA certificate validity period input (default 3650 days)
- [ ] 6.5 Handle enhanced generate response — show CA download and client cert download links after successful generation
- [ ] 6.6 Add client cert CN input (default `{common_name}-client`)

## 7. Frontend — Certificate Detail & Download

- [ ] 7.1 Add "下载 CA 证书 (.crt)" button on CA certificate detail view
- [ ] 7.2 Add "下载客户端证书包" button on client certificate detail view (bundles client_sign + client_enc + CA in one zip)
- [ ] 7.3 Add confirmation dialog for CA private key download, then call dedicated API endpoint
