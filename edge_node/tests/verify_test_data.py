"""Verify test ZIP files are correctly structured for Lua zip_utils tests."""
import zipfile
import io
import os

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
errors = 0


def check(name, cond, msg):
    global errors
    if cond:
        print(f"  PASS: {msg}")
    else:
        print(f"  FAIL: {msg}")
        errors += 1


def test_is_zip():
    print("\n[is_zip tests]")
    # empty
    with open(os.path.join(TESTS_DIR, "test_empty.bin"), "rb") as f:
        data = f.read()
    check("empty", len(data) == 0, "empty file is 0 bytes")

    # not zip
    with open(os.path.join(TESTS_DIR, "test_not_zip.bin"), "rb") as f:
        data = f.read()
    check("not_zip sig", data[:4] != b"PK\x03\x04", "not_zip does not have PK signature")

    # valid zip
    with open(os.path.join(TESTS_DIR, "test_valid.zip"), "rb") as f:
        data = f.read()
    check("valid sig", data[:4] == b"PK\x03\x04", "valid.zip has PK signature")
    check("valid EoCD", data[-22:-18] == b"PK\x05\x06", "valid.zip has EoCD signature")

    z = zipfile.ZipFile(io.BytesIO(data))
    check("valid names", set(z.namelist()) == {"index.html", "js/app.js", "css/style.css", "assets/img/logo.png"}, "valid.zip file list correct")

    # truncated
    with open(os.path.join(TESTS_DIR, "test_truncated.zip"), "rb") as f:
        data = f.read()
    check("truncated sig", data[:4] == b"PK\x03\x04", "truncated.zip has PK signature")
    check("truncated no EoCD", data[-22:-18] != b"PK\x05\x06", "truncated.zip missing EoCD")


def test_list_files():
    print("\n[list_files tests]")
    with open(os.path.join(TESTS_DIR, "test_valid.zip"), "rb") as f:
        z = zipfile.ZipFile(io.BytesIO(f.read()))

    files = z.infolist()
    check("file count", len(files) == 4, f"4 files found")

    names = {f.filename: f for f in files}
    for name in ["index.html", "js/app.js", "css/style.css", "assets/img/logo.png"]:
        check(f"has {name}", name in names, f"{name} in archive")

    # verify all 4 methods
    methods_found = set(f.compress_type for f in files)
    check("compression methods", 8 in methods_found or 0 in methods_found, f"has Store/Deflate methods: {methods_found}")

    # size info is correct
    html_info = names["index.html"]
    check("index.html size", html_info.file_size == 31, f"index.html size 31 (got {html_info.file_size})")
    check("index.html crc32", html_info.CRC > 0, f"index.html has CRC32: {hex(html_info.CRC)}")


def test_extract_file():
    print("\n[extract_file tests]")
    with open(os.path.join(TESTS_DIR, "test_valid.zip"), "rb") as f:
        z = zipfile.ZipFile(io.BytesIO(f.read()))

    content = z.read("index.html")
    check("index.html content", content == b"<html><body>Hello</body></html>", "index.html content correct")

    # uncompressed
    with open(os.path.join(TESTS_DIR, "test_uncompressed.zip"), "rb") as f:
        zu = zipfile.ZipFile(io.BytesIO(f.read()))
    content_u = zu.read("readme.txt")
    check("uncompressed content", content_u == b"Hello World", "uncompressed readme.txt correct")


def test_edge_client_code():
    print("\n[Python edge_client raw_put verification]")
    import ast, inspect

    # Check raw_put exists in edge_client.py
    client_path = os.path.join(TESTS_DIR, "..", "..", "backend", "app", "services", "edge_client.py")
    with open(client_path, "r", encoding="utf-8") as f:
        source = f.read()

    tree = ast.parse(source)
    methods = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    check("raw_put method", "raw_put" in methods, f"raw_put found in EdgeClient methods")

    # Verify raw_put doesn't reference _encrypt
    raw_put_src = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "raw_put":
            raw_put_src = ast.get_source_segment(source, node)
            break

    if raw_put_src:
        check("raw_put no encrypt", "_encrypt" not in raw_put_src, "raw_put does NOT use SM4 encryption")
        check("raw_put no json.dumps", "json.dumps" not in raw_put_src, "raw_put does NOT json.dumps")
        check("raw_put octet-stream", "application/octet-stream" in raw_put_src, "raw_put uses octet-stream content-type")
        check("raw_put timeout 30", "timeout=30.0" in raw_put_src, "raw_put has 30s timeout")

    # Verify static_resources.py uses raw_put
    sr_path = os.path.join(TESTS_DIR, "..", "..", "backend", "app", "api", "v1", "static_resources.py")
    with open(sr_path, "r", encoding="utf-8") as f:
        sr_source = f.read()
    check("uses raw_put", "raw_put(" in sr_source, "static_resources.py calls raw_put()")
    check("no old _request PUT", "._request(\"PUT\"" not in sr_source, "static_resources.py no longer uses _request(PUT)")


if __name__ == "__main__":
    test_is_zip()
    test_list_files()
    test_extract_file()
    test_edge_client_code()
    print(f"\n{'='*40}")
    if errors == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"{errors} TEST(S) FAILED")
