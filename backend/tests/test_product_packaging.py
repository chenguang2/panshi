"""product/ 打包脚本源码守卫（平台无关纯文本断言）。

2026-11-04 排查 gen-mac.sh「生成失败」时确立的事实：
1. mac start.sh 第 39 行 `PRE_PID=$(lsof -ti:"$PORT" 2>/dev/null)` 无 `|| true`，
   `set -e` 下目标机端口空闲（正常首发场景）时 lsof 退出码 1 → start.sh 静默死亡，
   生成的包永远起不来（实测复现：仅打印首行即退出）。linux 版同位置有 `|| true`。
2. gen-mac.sh 第 4 步裸 pip 硬编码镜像，没有 install-backend-deps.sh 的
   uv 缓存 / .mirror 覆盖 / WHEELS_DIR 离线兜底（2026-11-03 瞬时网络故障即死）。
3. gen-mac.sh ansible collections 直连 galaxy.ansible.com（国内常不通），
   没有 linux 版的本地 tarball 优先链（tarball 随 backend/ansible/ 已进包）。
4. gen-mac.sh 缺 4.5.1 shebang 修正 → 包移动后 .venv/bin 控制台脚本
   （pip/ansible-playbook/ansible-galaxy）携带开发机绝对路径即失效。
5. gen-mac.sh 缺 db_config.json / .jwt_secret 随包（da9a4011 建议 34：
   db_config.json 已加密密码缺 .jwt_secret 不可解）。

同时钉住 mac 专属必须项，防止未来「对齐 linux」的编辑误删：
- venv 必须 `--copies --without-pip` + 手动拷 libpython3.11.dylib（macOS rpath）。
- sed 必须 BSD 形态 `sed -i '' '...'`（GNU 裸 `sed -i 's` 在 macOS 报错）。

守卫思路同 test_publish_response.py / tests/test_dev_scripts.py 的源码模式守卫：
脚本执行类测试在 macOS 无 /proc 假身可用，源码断言是本仓库已验证的替代。
"""

from pathlib import Path
import re

REPO_ROOT = Path(__file__).resolve().parents[2]
MAC_DIR = REPO_ROOT / "product" / "mac"
GEN_MAC = MAC_DIR / "gen-mac.sh"
START_MAC = MAC_DIR / "start.sh"


def _read(path: Path) -> str:
    assert path.exists(), f"脚本不存在：{path}"
    return path.read_text(encoding="utf-8")


class TestMacStartScript:
    def test_lsof_assignment_tolerates_free_port(self):
        """空闲端口（lsof 退出码 1）不得击杀 set -e 脚本：lsof 赋值必须带 || true。

        回归：2026-11-04 冒烟实测 start.sh 仅打印首行即退出（exit 1），
        health=000；根因即本行。
        """
        text = _read(START_MAC)
        assert "set -e" in text, "start.sh 依赖 set -e，行为守卫的前提缺失"
        bare = re.compile(r"^PRE_PID=\$\(lsof -ti:\"\$PORT\" 2>/dev/null\)\s*$", re.M)
        assert not bare.search(text), (
            "start.sh 的 lsof 赋值无 || true：目标机端口空闲时 lsof 退出码 1，"
            "set -e 下脚本静默死亡（包永远起不来）。改为 "
            '`PRE_PID=$(lsof -ti:"$PORT" 2>/dev/null || true)`（对齐 linux 版）。'
        )
        assert 'lsof -ti:"$PORT" 2>/dev/null || true' in text

    def test_start_sets_pythonhome_to_bundled_python(self):
        """standalone Python 的 /install 硬编码路径靠 PYTHONHOME 指向包内解释器。"""
        assert "export PYTHONHOME=" in _read(START_MAC)


class TestGenMacParityWithLinux:
    """gen-mac.sh 必须跟进 gen-linux.sh 已固化的四道防线。"""

    def test_backend_deps_via_unified_entry(self):
        """第 4 步走 install-backend-deps.sh（uv 缓存/.mirror/离线兜底），禁裸 pip -i。"""
        text = _read(GEN_MAC)
        assert "product/tools/install-backend-deps.sh" in text, (
            "gen-mac.sh 第 4 步必须复用 product/tools/install-backend-deps.sh"
            "（uv 优先缓存激进 / PIP_INDEX_URL+.mirror 覆盖 / WHEELS_DIR 离线），"
            "裸 pip + 硬编码镜像在瞬时网络故障下直接致死且无重试面。"
        )
        assert not re.search(r"pip\W+install -i https?://", text), (
            "gen-mac.sh 不应再内联裸 pip install -i <镜像>，统一入口已内置镜像选择"
        )

    def test_ansible_collections_tarball_first(self):
        """collections 先试本地 tarball（随 backend/ansible 已进包），网络仅兜底。"""
        text = _read(GEN_MAC)
        assert "ansible-utils-6.0.2.tar.gz" in text, (
            "gen-mac.sh 缺本地 tarball 优先链：galaxy.ansible.com 国内常不可达，"
            "tarball 已随 backend/ansible/ 拷贝进包，必须先试本地再走网络。"
        )

    def test_shebang_fix_step_present(self):
        """4.5.1 shebang 修正必须在（对齐 linux 版）：包迁移后 venv 控制台脚本可用。"""
        text = _read(GEN_MAC)
        assert "/usr/bin/env python3" in text and "SHEBANG_FIX_COUNT" in text, (
            "gen-mac.sh 缺 4.5.1 shebang 修正：pip 写入的构建机绝对路径 shebang "
            "在包移动后失效（ansible-playbook/ansible-galaxy 全体不可用）。"
        )

    def test_ships_db_config_and_jwt_secret(self):
        """db_config.json + .jwt_secret 条件随包（建议 34：缺钥则已加密密码不可解）。"""
        text = _read(GEN_MAC)
        assert ".jwt_secret" in text, (
            "gen-mac.sh 缺 .jwt_secret 随包：JWT 签名 + Fernet 双角色密钥，"
            "缺它时包内已加密的数据库连接密码全部不可解（da9a4011 建议 34）。"
        )
        assert "db_config.json" in text, "gen-mac.sh 缺 db_config.json 条件随包"


class TestGenMacPlatformMusts:
    """mac 专属必须项：防未来「对齐 linux」的编辑误删。"""

    def test_venv_uses_copies_without_pip_and_dylib(self):
        """macOS cp -rL 的 Python 建 venv 必须 --copies --without-pip + 手补 dylib。"""
        text = _read(GEN_MAC)
        assert "--copies --without-pip" in text, "venv 必须保留 --copies --without-pip"
        assert "libpython3.11.dylib" in text, "必须手动拷 libpython3.11.dylib（@rpath 解析）"
        assert "ensurepip" in text, "--without-pip 后必须经 ensurepip 装 pip"

    def test_bsd_sed_only(self):
        """macOS sed 必须空备份扩展名：裸 GNU 形态 `sed -i 's` 直接报错。

        判别：`sed -i '` 后紧跟的引号若是 `''`（空备份扩展名）→ BSD 合法；
        引号后直接是 sed 脚本（`'s|...`）→ GNU 形态，macOS 上报错。
        """
        text = _read(GEN_MAC)
        offenders = [
            line.strip()
            for line in text.splitlines()
            if re.search(r"\bsed -i '(?!')", line)
        ]
        assert not offenders, f"gen-mac.sh 存在 GNU 形态 sed -i（macOS 须 sed -i ''）：{offenders}"
