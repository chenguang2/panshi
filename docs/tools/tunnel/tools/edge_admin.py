#!/usr/bin/env python3
"""Manage uap-edge admin API (SM4-ECB encrypted). Usage: edge_admin.py <node> <METHOD> <path> [json-body]"""
import base64, json, os, sys, urllib.request, urllib.error

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

API_KEY = "f9357106bff442f89d4de7169c37c61e"
SM4_KEY = b"a16bc20453da220f"


def pkcs7_unpad(d: bytes) -> bytes:
    pad = d[-1]
    return d[:-pad] if 0 < pad <= 16 else d


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


def call(node, method, path, body=None):
    url = f"http://{node}:16620{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("X-API-KEY", API_KEY)
    req.add_header("Content-Type", "application/json")
    data = None
    if body is not None:
        data = encrypt(json.dumps(body).encode()).encode()
    try:
        with urllib.request.urlopen(req, data=data, timeout=8) as r:
            resp = r.read().decode()
            code = r.status
    except urllib.error.HTTPError as e:
        resp = e.read().decode()
        code = e.code
    except Exception as e:
        print(f"ERROR {method} {path}: {e}")
        return
    try:
        dec = decrypt(resp).decode("utf-8", errors="replace")
        try:
            print(f"--- {method} {path} [{code}] ---")
            print(json.dumps(json.loads(dec), ensure_ascii=False, indent=1)[:4000])
        except Exception:
            print(f"--- {method} {path} [{code}] ---")
            print(dec[:4000])
    except Exception:
        print(f"--- {method} {path} [{code}] RAW ---")
        print(resp[:2000])


if __name__ == "__main__":
    node = sys.argv[1]
    method = sys.argv[2].upper()
    path = sys.argv[3]
    body = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
    call(node, method, path, body)
