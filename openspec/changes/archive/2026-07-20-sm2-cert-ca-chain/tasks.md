## 1. Core Certificate Generation Functions

- [x] 1.1 Add `generate_ca_certificate()` in `cert_generator.py` — generates SM2 CA key pair + self-signed CA certificate with `CA:TRUE, pathlen:0`/`keyCertSign`/`cRLSign`/`subjectKeyIdentifier`/`authorityKeyIdentifier` extensions
- [x] 1.2 Add `get_cert_expiry()` utility function in `cert_generator.py` — parses cert PEM via `openssl x509 -enddate -noout`, returns `notAfter` as a `date` object; used by both `ca_sign_csr()` and publish flow
- [x] 1.3 Add `ca_sign_csr()` in `cert_generator.py` — signs a given CSR with CA cert+key, supports passing extension config for sign vs enc cert types (`keyUsage`) and ext file content; terminal cert validity auto-truncated via `get_cert_expiry()` to not exceed CA
- [x] 1.4 Refactor `generate_dual_certificates()` — replace `self_sign_certificate()` calls with `ca_sign_csr()`, add required `ca_cert_pem`/`ca_key_pem` parameters; remove self-signed fallback for SM2 (backward compat no longer needed)
- [x] 1.5 Remove SM2 single cert code path in `LocalProvider.generate_certificate()` — SM2 always generates dual certs (`dual_cert` parameter ignored for SM2)
- [x] 1.6 Write unit tests for `get_cert_expiry()`, `generate_ca_certificate()`, `ca_sign_csr()`, `generate_dual_certificates()` with CA signing

## 2. Data Model & Schema

- [x] 2.1 Add `is_ca` (Boolean, default false) column to `SslCertificate` model
- [x] 2.2 Add `ca_cert_id` (Integer, FK to `ps_ssl_certificate.id`, nullable) column to `SslCertificate` model — CA records have `ca_cert_id=null`
- [x] 2.3 Add DB migration for new columns
- [x] 2.4 Update `SslCertificateCreate`/`SslCertificateResponse` schemas with `is_ca`, `ca_cert_id` fields
- [x] 2.5 Add `CaCertificateGenerateRequest` schema — `name` (required), `common_name` (optional, defaults to name), `validity_days` (optional, default 3650)
- [x] 2.6 Simplify `SslCertificateGenerateRequest` — remove `mode`, `node_id`, `generate_ca`, `validity_days_ca`; add `ca_cert_id: int | None = None` (required for SM2 validation); keep `generate_client_certs: bool = False` (SM2 only); `create_method` defaults to `local_generate` always
- [x] 2.7 Add `SslCertificateGenerateResponse` schema — wraps `server: SslCertificateResponse` and `client: SslCertificateResponse | None` for the generate endpoint response
- [x] 2.8 Add dedicated API endpoint for CA private key download (`GET /ssl/{id}/ca-key`) with confirmation dialog
- [x] 2.9 Update TypeScript types in `frontend/src/types/ssl.ts` to match

## 3. API Endpoints — CA

- [x] 3.1 Add `POST /api/v1/clusters/{cluster_id}/ssl/ca` endpoint — validates cluster exists, calls `generate_ca_certificate()`, creates `SslCertificate` record with `is_ca=true`, returns `SslCertificateResponse` (without `private_key`)
- [x] 3.2 Add CA private key download endpoint `GET /api/v1/ssl/{id}/ca-key` — returns CA private key PEM
- [x] 3.3 Add first-time SM2 guidance — when `POST /ssl/generate` is called with `algorithm=sm2` and cluster has no CA, return 400 with clear guidance

## 4. API Endpoints — Certificate Generation (simplified)

- [x] 4.1 Remove `_generate_remote()`, `_remote_generate_single()`, `_remote_generate_dual()`, `_parse_remote_markers()` — entire remote mode code path
- [x] 4.2 Simplify `generate_ssl_certificate()` handler — remove mode dispatch, always call `_generate_local()`
- [x] 4.3 Modify `_generate_local()` SM2 path — load CA from DB by `ca_cert_id`, validate CA belongs to same cluster and `is_ca=true`, pass CA cert+key to `generate_dual_certificates()`
- [x] 4.4 Add `ca_cert_id` validation in `_generate_local()` — if `algorithm=sm2` and `ca_cert_id` is None → 400; if CA not found/not CA/wrong cluster → 400
- [x] 4.5 Add client cert generation in `_generate_local()` SM2 path when `generate_client_certs=true` — generate client sign+enc keypairs, sign with same CA, save as separate `SslCertificate` record with `cert_type=client` and `ca_cert_id` referencing the same CA
- [x] 4.6 RSA/ECC path unchanged in `_generate_local()` — self-signed, no CA involvement, no change from current behavior
- [x] 4.7 Return `SslCertificateGenerateResponse` for SM2 — wrap server and optional client `SslCertificateResponse` objects

## 5. Publish & Delete

- [x] 5.1 Modify publish logic in `cluster_ssl.py` — when publishing a GM cert with `ca_cert_id`, check CA expiry via `get_cert_expiry()`, append CA cert PEM to `config_data["cert_chain"]`
- [x] 5.2 Add API-level reject for publishing `cert_type=client` certificates — return 400
- [x] 5.3 Add API-level reject for publishing `is_ca=true` certificates — return 400
- [x] 5.4 Add delete guard on CA records — if `ca_cert_id` references exist, reject DELETE with 400
- [x] 5.5 Update `create_method` references — remove `remote_generate` handling

## 6. Frontend — SSL List Page & CA Management

- [x] 6.1 Add tab switching on SSL list page — "全部证书" tab and "CA 根证书" tab; CA tab **始终可见**
- [x] 6.2 Design CA tab empty state — message + "创建 CA 根证书" button
- [x] 6.3 Add CA certificate badge/label on certificate card when `is_ca=true`
- [x] 6.4 Hide "发布" button for `cert_type=client` and `is_ca=true` certificates
- [x] 6.5 First-time SM2 flow: show inline warning with link to open CA creation dialog

## 7. Frontend — CA Creation Dialog

- [x] 7.1 Build CA creation dialog — modal form with name, common_name, validity_days
- [x] 7.2 After successful CA creation, show success notification
- [x] 7.3 Show soft warning when creating new CA and cluster already has existing CA(s)

## 8. Frontend — SSL Generate Dialog

- [x] 8.1 Remove mode selector from generate dialog
- [x] 8.2 Add CA selector dropdown — lists `is_ca=true` records of same cluster; required for SM2
- [x] 8.3 Add "同时生成客户端证书" checkbox — visible only when SM2
- [x] 8.4 When algorithm switches to/from sm2, show/hide CA selector accordingly
- [x] 8.5 Handle enhanced generate response for SM2 — show result section with server + optional client cert info

## 9. Frontend — Certificate Detail & Download

- [x] 9.1 Add "下载 CA 证书 (.crt)" button on CA certificate detail view
- [x] 9.2 Add "下载客户端证书包" button on client certificate detail view
- [x] 9.3 Add confirmation dialog for CA private key download
