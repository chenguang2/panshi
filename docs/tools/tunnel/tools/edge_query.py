#!/usr/bin/env python3
"""Query uap-edge admin API on 192.168.0.14 (SM4-ECB encrypted) - standalone tool."""
import base64, json, os, sys, urllib.request, urllib.error

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

NODE = os.environ.get("ENODE", "192.168.0.14")
PORT = int(os.environ.get("EPORT", "16620"))
API_KEY = "f9357106bff442f89d4de7169c37c61e"
SM4_KEY = b"a16bc20453da220f"


def pkcs7_unpad(data: bytes) -> bytes:
    pad = data[-1]
    if pad == 0 or pad > 16:
        raise ValueError(f"bad padding {pad}")
    return data[:-pad]


def decrypt(data: str) -> bytes:
    padded = data + "=" * ((4 - len(data) % 4) % 4)
    enc = base64.urlsafe_b64decode(padded)
    c = Cipher(algorithms.SM4(SM4_KEY), modes.ECB(), backend=default_backend())
    d = c.decryptor()
    return pkcs7_unpad(d.update(enc) + d.finalize())


def encrypt(data: bytes) -> str:
    padlen = 16 - (len(data) % 16)
    padded = data + bytes([padlen] * padlen)
    c = Cipher(algorithms.SM4(SM4_KEY), modes.ECB(), backend=default_backend())
    e = c.encryptor()
    return base64.b64encode(e.update(padded) + e.finalize()).decode()


def call(method: str, path: str, body: dict | None = None, raw_body: str | None = None):
    url = f"http://{NODE}:{PORT}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("X-API-KEY", API_KEY)
    req.add_header("Content-Type", "application/json")
    data = None
    if raw_body is not None:
        data = raw_body.encode()
    elif body is not None:
        data = encrypt(json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, data=data, timeout=6) as r:
            resp = r.read().decode()
            code = r.status
    except urllib.error.HTTPError as e:
        resp = e.read().decode()
        code = e.code
    # try decrypt if base64-ish
    try:
        dec = decrypt(resp)
        out = dec.decode("utf-8", errors="replace")
        try:
            print(f"--- {method} {path} [{code}] decrypted JSON ---")
            print(json.dumps(json.loads(out), ensure_ascii=False, indent=1)[:6000])
        except Exception:
            print(f"--- {method} {path} [{code}] decrypted text ---")
            print(out[:6000])
    except Exception:
        print(f"--- {method} {path} [{code}] raw ---")
        print(resp[:3000])


if __name__ == "__main__":
    ops = sys.argv[1:] or ["GET /edge/admin/routes", "GET /edge/admin/upstreams",
                           "GET /edge/admin/services", "GET /stream/edge/admin/routes",
                           "GET /edge/admin/plugin_configs", "GET /edge/admin/global_rules",
                           "GET /edge/admin/ssl", "GET /edge/server_info"]
    for op in ops:
        parts = op.split(" ", 1)
        method = parts[0]
        path = parts[1] if len(parts) > 1 else "/edge/server_info"
        call(method, path)
        print()
