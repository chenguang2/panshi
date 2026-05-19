"""Generate test ZIP files for Edge node Lua zip_utils tests."""
import zipfile
import io
import os
import struct

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))


def gen_valid_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("index.html", "<html><body>Hello</body></html>")
        z.writestr("js/app.js", "console.log('hello');")
        z.writestr("css/style.css", "body { color: red; }")
        z.writestr("assets/img/logo.png", b"PNG\x00\x00\x00\x00")
    data = buf.getvalue()
    with open(os.path.join(TESTS_DIR, "test_valid.zip"), "wb") as f:
        f.write(data)
    print(f"test_valid.zip: {len(data)} bytes, 4 files")


def gen_uncompressed_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        z.writestr("readme.txt", "Hello World")
    data = buf.getvalue()
    with open(os.path.join(TESTS_DIR, "test_uncompressed.zip"), "wb") as f:
        f.write(data)
    print(f"test_uncompressed.zip: {len(data)} bytes, 1 file")


def gen_truncated_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("file.txt", "data")
    full = buf.getvalue()
    truncated = full[: len(full) // 2]
    with open(os.path.join(TESTS_DIR, "test_truncated.zip"), "wb") as f:
        f.write(truncated)
    print(f"test_truncated.zip: {len(truncated)} bytes (truncated)")


def gen_not_a_zip():
    data = b"this is not a zip file\x00\x01\x02\x03"
    with open(os.path.join(TESTS_DIR, "test_not_zip.bin"), "wb") as f:
        f.write(data)
    print(f"test_not_zip.bin: {len(data)} bytes")


def gen_empty():
    with open(os.path.join(TESTS_DIR, "test_empty.bin"), "wb") as f:
        pass
    print("test_empty.bin: 0 bytes")


if __name__ == "__main__":
    gen_valid_zip()
    gen_uncompressed_zip()
    gen_truncated_zip()
    gen_not_a_zip()
    gen_empty()
    print("Done.")
