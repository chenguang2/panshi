"""缺陷加固回归（安全车道，TDD）：

M3 — 静态资源 zip 上传无大小限制：原实现 `await file.read()` 全量入内存后才
判空，无上限。修复后上传腿对齐网关 nginx client_max_body_size（当前部署 32m，
经中继发布超限即 413）在读取前拦截，常量 STATIC_ZIP_MAX_BYTES。

L8 — sshpass -p <密码> 把 SSH 密码暴露在 ps / /proc/<pid>/cmdline（world-readable）。
修复后改 `sshpass -e` + 环境变量 SSHPASS 传递，argv 不再含明文密码。
"""
import io
import os
import re
import zipfile
from pathlib import Path

import pytest
from fastapi import UploadFile

from app.services import ansible_service, relay_registry
from app.main import app


# ── 缺陷一 M3：静态资源 zip 上传大小上限 ──────────────────────────


def _make_zip_bytes(fill: int = 64) -> bytes:
    """构造真实可解压的小 zip（含一个 fill 字节的 index.html）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("index.html", "x" * fill)
    return buf.getvalue()


async def _seed_resource(isolated_session) -> int:
    from app.models.static_resource import StaticResource

    async with isolated_session() as s:
        r = StaticResource(
            cluster_id=1, route_id=None, edge_uuid="hardening-uuid",
            name="hardening-resource", url_path="/hardening/*",
        )
        s.add(r)
        await s.commit()
        return r.id


def _patch_limit(monkeypatch, tmp_path, limit: int) -> None:
    from app.api.v1 import cluster_static_resources as csr

    # raising=False：常量未实现时（RED 阶段）也要让行为断言跑起来
    monkeypatch.setattr(csr, "BASE_STORAGE_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(csr, "STATIC_ZIP_MAX_BYTES", limit, raising=False)


class TestStaticZipUploadLimit:

    async def test_upload_over_limit_rejected_and_not_written(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path,
    ):
        """超限 zip → 400，且文件不落盘、资源记录不变。"""
        rid = await _seed_resource(isolated_session)
        _patch_limit(monkeypatch, tmp_path, limit=10)

        big = _make_zip_bytes(fill=64)  # ~100+ 字节 > 10 字节上限
        assert len(big) > 10
        resp = await async_authed_client.post(
            f"/api/v1/clusters/1/static-resources/{rid}/upload",
            files={"file": ("big.zip", big, "application/zip")},
        )
        assert resp.status_code == 400, resp.text
        assert "过大" in resp.json()["detail"]

        # 文件未落盘：存储目录为空
        assert list(tmp_path.rglob("*")) == []

        # 资源记录未被推进版本
        from app.models.static_resource import StaticResource
        async with isolated_session() as s:
            r = await s.get(StaticResource, rid)
            assert r.current_version is None
            assert not r.storage_path
            assert not r.file_size

    async def test_upload_over_limit_size_none_defense(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path,
    ):
        """file.size 缺省（None）时，读取阶段限额+1 字节防御同样拦截。"""
        from app.api.v1 import cluster_static_resources as csr

        rid = await _seed_resource(isolated_session)
        _patch_limit(monkeypatch, tmp_path, limit=10)

        big = _make_zip_bytes(fill=64)
        # 手工构造 UploadFile：不传 size → file.size is None（multipart 解析器之外
        # 的直调路径），只能靠读取限额防御
        up = UploadFile(file=io.BytesIO(big), filename="big.zip")
        assert up.size is None

        async with isolated_session() as db:
            with pytest.raises(Exception) as ei:
                await csr.upload_static_resource_zip(
                    cluster_id=1, resource_id=rid, file=up, db=db,
                )
        from fastapi import HTTPException
        assert isinstance(ei.value, HTTPException)
        assert ei.value.status_code == 400
        assert "过大" in ei.value.detail

        # 文件未落盘
        assert list(tmp_path.rglob("*")) == []

    async def test_upload_normal_small_zip_still_succeeds(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path,
    ):
        """防过度拦截：上限内的正常 zip 仍成功入库落盘。"""
        rid = await _seed_resource(isolated_session)
        _patch_limit(monkeypatch, tmp_path, limit=1024)

        small = _make_zip_bytes(fill=4)
        resp = await async_authed_client.post(
            f"/api/v1/clusters/1/static-resources/{rid}/upload",
            files={"file": ("small.zip", small, "application/zip")},
        )
        assert resp.status_code == 200, resp.text  # 现行成功码（未声明 201）
        data = resp.json()
        assert data["current_version"] == 1
        assert data["file_size"] == len(small)
        # 落盘了
        assert list(tmp_path.rglob("*.zip")), "正常 zip 应写入存储目录"


# ── 缺陷二 L8：sshpass 密码改经 SSHPASS 环境变量，不进 argv ─────────


@pytest.fixture
def relay_off(monkeypatch):
    """钉住中继总开关关闭（#29：勿依赖部署 features.yaml 取值）。"""
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


@pytest.fixture
def no_sshpass_env(monkeypatch):
    monkeypatch.delenv("SSHPASS", raising=False)


class TestSshpassEnvOnly:

    def test_build_ssh_cmd_uses_e_and_env(
        self, relay_off, no_sshpass_env,
    ):
        """密码腿：argv 为 sshpass -e 且不含明文密码；不污染父进程环境（M21）。"""
        cmd = ansible_service._build_ssh_cmd(
            "10.0.0.1", "jboss", "ls -la", password="secret123",
        )
        assert cmd[0] == "sshpass"
        assert cmd[1] == "-e"
        assert "secret123" not in cmd, f"明文密码出现在 argv: {cmd}"
        # M21 后 SSHPASS 只经子进程级 env_extra 注入，命令构造不得碰全局环境
        assert os.environ.get("SSHPASS") is None
        # ssh 与目标、远端命令仍就位
        assert "ssh" in cmd
        assert "jboss@10.0.0.1" in cmd
        assert cmd[-1] == "ls -la"

    def test_build_ssh_cmd_key_based_touches_no_sshpass(
        self, relay_off, no_sshpass_env,
    ):
        """无密码腿：纯 ssh + BatchMode，不碰 sshpass / SSHPASS。"""
        cmd = ansible_service._build_ssh_cmd("10.0.0.1", "jboss", "ls")
        assert cmd[0] == "ssh"
        assert all(arg != "sshpass" for arg in cmd)
        assert os.environ.get("SSHPASS") is None

    async def test_password_leg_spawns_without_plaintext_argv(
        self, relay_off, no_sshpass_env, monkeypatch,
    ):
        """密码回退腿：spawn 时 argv 无明文、SSHPASS 经子进程级 env_extra（全局不落地）。"""
        calls: list[tuple[list[str], dict | None]] = []

        async def fake_run_subprocess(cmd, env_extra=None):
            calls.append((list(cmd), env_extra))
            if cmd[0] == "sshpass":
                return 0, "ok", ""
            return 255, "", "Permission denied (publickey)"

        monkeypatch.setattr(ansible_service, "_run_subprocess", fake_run_subprocess)
        monkeypatch.setattr(ansible_service, "_sshpass_available", lambda: True)

        rc, out, err = await ansible_service._run_ssh_with_fallback(
            "10.0.0.1", "jboss", "ls", password="secret123",
        )
        assert rc == 0 and out == "ok"
        assert len(calls) == 2
        pass_argv, pass_env = calls[1]
        assert pass_argv[0] == "sshpass" and "-e" in pass_argv
        assert "secret123" not in pass_argv, f"明文密码出现在 argv: {pass_argv}"
        assert pass_env == {"SSHPASS": "secret123"}, "子进程应经 env_extra 取到 SSHPASS"
        assert os.environ.get("SSHPASS") is None, "全局环境不得残留 SSHPASS"

    def test_source_guard_no_sshpass_dash_p_argument(self):
        """源码守卫：命令构造不再出现 `sshpass -p <密码>` 参数形态。"""
        src = Path(ansible_service.__file__).read_text(encoding="utf-8")
        assert not re.search(r'"sshpass",\s*"-p"', src), (
            "ansible_service 仍在用 sshpass -p 传密码（密码会进 ps/cmdline）"
        )
        assert re.search(r'"sshpass",\s*"-e"', src), "未找到 sshpass -e 形态"
        # sanitize_command_for_store 的审计掩码正则（"sshpass -p (\S+)"）是历史
        # 字符串兜底，不属于命令构造，不受此守卫约束。
