"""inventory_service 单元测试（TDD，任务 1.1–1.5）。

覆盖：解析（含真实文件样例）、渲染（往返幂等）、结构校验+删除保护、
备份轮转与原子写回。
"""

import pytest

# 与 backend/ansible/inventory/host 结构一致的最小样例：
# 含 dict 主机、null 主机、注释行、自定义键
SAMPLE_INVENTORY = """\
all:
  children:
    edge_cluster:
      hosts:
        192.168.1.1:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'jboss@12306'
          deploy_tier: edge
        192.168.1.2:
#          ansible_ssh_user: root
      vars:
        ansible_ssh_user: default_user
        ansible_ssh_pass: 'default_pass'
"""


class TestParseInventory:
    def test_parses_hosts_vars_and_unknown_keys(self):
        from app.services.inventory_service import parse_inventory

        result = parse_inventory(SAMPLE_INVENTORY)

        assert result["errors"] == []
        # 全保真：host 条目返回完整字段字典（含未知键），ip 单独提出
        assert result["hosts"] == [
            {
                "ip": "192.168.1.1",
                "ansible_ssh_user": "jboss",
                "ansible_ssh_pass": "jboss@12306",
                "deploy_tier": "edge",
            },
            {"ip": "192.168.1.2"},
        ]
        assert result["vars"] == {
            "ansible_ssh_user": "default_user",
            "ansible_ssh_pass": "default_pass",
        }
        # 未知键 = hosts 条目上除两个凭据字段外的自定义键名集合
        assert result["unknown_keys"] == ["deploy_tier"]


class TestRenderInventory:
    def test_renders_hosts_and_vars_with_numeric_ip_order(self):
        from app.services.inventory_service import parse_inventory, render_inventory

        hosts = [
            {"ip": "192.168.100.114", "ansible_ssh_user": "jboss"},
            {"ip": "192.168.100.42", "ansible_ssh_user": "jboss", "ansible_ssh_pass": "x"},
            {"ip": "10.0.0.2"},  # null 主机：继承组级凭据
            {"ip": "192.168.1.1", "ansible_ssh_user": "jboss"},
        ]
        text = render_inventory(hosts, {"ansible_ssh_user": "default_user"})

        # IP 按数值序（首字节 10 < 192；字符串序会把 .114 排在 .42 前）
        import re
        ip_order = re.findall(r"^        ([\d.]+):", text, flags=re.M)
        assert ip_order == ["10.0.0.2", "192.168.1.1", "192.168.100.42", "192.168.100.114"]

    def test_render_parse_roundtrip_preserves_unknown_keys(self):
        from app.services.inventory_service import parse_inventory, render_inventory

        original = parse_inventory(SAMPLE_INVENTORY)
        text = render_inventory(original["hosts"], original["vars"])
        reparsed = parse_inventory(text)

        assert reparsed["errors"] == []
        assert reparsed["hosts"] == original["hosts"]
        assert reparsed["vars"] == original["vars"]
        assert reparsed["unknown_keys"] == original["unknown_keys"]

    def test_render_is_idempotent(self):
        """parse∘render 幂等：render(parse(render(x))) == render(parse(x))。"""
        from app.services.inventory_service import parse_inventory, render_inventory

        once = render_inventory(
            parse_inventory(SAMPLE_INVENTORY)["hosts"],
            parse_inventory(SAMPLE_INVENTORY)["vars"],
        )
        twice = render_inventory(
            parse_inventory(once)["hosts"],
            parse_inventory(once)["vars"],
        )
        assert once == twice

    def test_null_host_renders_as_bare_key_not_null(self):
        """裸主机（继承组级凭据）应渲染为裸键行，与运维手写格式一致。"""
        from app.services.inventory_service import render_inventory

        text = render_inventory(
            [{"ip": "172.31.46.178"}, {"ip": "10.0.0.1", "ansible_ssh_user": "jboss"}],
            {},
        )

        assert "        172.31.46.178:\n" in text
        assert ": null" not in text


class TestValidateStructure:
    def test_valid_document_passes(self):
        import yaml

        from app.services.inventory_service import validate_structure

        doc = yaml.safe_load(SAMPLE_INVENTORY)
        errors = validate_structure(doc, platform_node_ips=["192.168.1.1"])
        assert errors == []

    def test_host_value_must_be_dict_or_null(self):
        import yaml

        from app.services.inventory_service import validate_structure

        doc = yaml.safe_load(
            "all:\n  children:\n    edge_cluster:\n      hosts:\n        10.0.0.5: bad_scalar\n"
        )
        errors = validate_structure(doc, platform_node_ips=[])
        assert len(errors) == 1
        assert "10.0.0.5" in errors[0]

    def test_host_key_must_be_ip_or_hostname(self):
        import yaml

        from app.services.inventory_service import validate_structure

        doc = yaml.safe_load(
            "all:\n  children:\n    edge_cluster:\n      hosts:\n        bad key!: {}\n"
        )
        errors = validate_structure(doc, platform_node_ips=[])
        assert len(errors) == 1
        assert "bad key!" in errors[0]

    def test_deletion_protection_lists_missing_platform_ips(self):
        import yaml

        from app.services.inventory_service import validate_structure

        doc = yaml.safe_load(SAMPLE_INVENTORY)  # 只有 1.1 / 1.2 两台
        errors = validate_structure(
            doc, platform_node_ips=["192.168.1.9", "192.168.1.7"]
        )
        # 两个平台节点 IP 都不在提交的清单中 → 删除保护
        joined = "；".join(errors)
        assert "192.168.1.9" in joined and "192.168.1.7" in joined


class TestSaveInventory:
    @pytest.fixture()
    def inv_env(self, tmp_path, monkeypatch):
        """把 inventory 指向临时目录，返回 (inventory 路径, 目录)。"""
        from app.services import ansible_service

        inv_dir = tmp_path / "inventory"
        inv_path = inv_dir / "host"
        monkeypatch.setattr(ansible_service, "_INVENTORY_PATH", inv_path)
        return inv_path, inv_dir

    def test_save_creates_backup_of_previous_content(self, inv_env):
        inv_path, inv_dir = inv_env
        from app.services.inventory_service import save_inventory

        inv_dir.mkdir(parents=True)
        inv_path.write_text("old: content\n", encoding="utf-8")

        save_inventory("all:\n  children: {}\n")

        assert inv_path.read_text(encoding="utf-8") == "all:\n  children: {}\n"
        baks = sorted(inv_dir.glob("host.bak.*"))
        assert len(baks) == 1
        assert baks[0].read_text(encoding="utf-8") == "old: content\n"

    def test_backup_rotation_keeps_newest_10(self, inv_env):
        inv_path, inv_dir = inv_env
        from app.services.inventory_service import save_inventory

        inv_dir.mkdir(parents=True)
        inv_path.write_text("current\n", encoding="utf-8")
        # 预置 12 份旧备份（时间戳命名，字典序即时间序）
        for i in range(1, 13):
            (inv_dir / f"host.bak.2026010{i:02d}000000").write_text(f"bak{i}\n")

        save_inventory("new\n")

        baks = sorted(inv_dir.glob("host.bak.*"))
        assert len(baks) == 10
        # 最旧的两份被删除
        names = [b.name for b in baks]
        assert "host.bak.20260101000000" not in names
        assert "host.bak.20260102000000" not in names

    def test_missing_file_and_dir_are_auto_created(self, inv_env):
        inv_path, inv_dir = inv_env
        from app.services.inventory_service import save_inventory

        assert not inv_dir.exists()

        save_inventory("all:\n  children:\n    edge_cluster:\n      hosts: {}\n")

        assert inv_path.read_text(encoding="utf-8") == (
            "all:\n  children:\n    edge_cluster:\n      hosts: {}\n"
        )


# 按真实 backend/ansible/inventory/host 结构构造的样例：
# 特殊字符密码、注释掉的备用凭据、裸主机（null）、行尾空格、注入过的 ansible_port
REAL_LIKE_INVENTORY = """\
all:
  children:
    edge_cluster:
      hosts:
        192.168.0.24:
          ansible_ssh_user: rocksware
          ansible_ssh_pass: 'linux123!@#'
        192.168.0.13:
          ansible_ssh_user: jboss
        192.168.100.114:
        192.168.100.42:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'jboss'
          ansible_port: 2222
        192.168.100.141:
#          ansible_ssh_user: root
#          ansible_ssh_pass: 'yu2022'
        192.168.100.71:
      vars:
        ansible_ssh_user: jboss
        ansible_ssh_pass: 'group_default'
"""


class TestRealFileSample:
    def test_parse_real_like_sample_no_errors(self):
        from app.services.inventory_service import parse_inventory

        result = parse_inventory(REAL_LIKE_INVENTORY)
        assert result["errors"] == []
        assert len(result["hosts"]) == 6

        # 特殊字符密码保真
        h24 = next(h for h in result["hosts"] if h["ip"] == "192.168.0.24")
        assert h24["ansible_ssh_pass"] == "linux123!@#"

        # 注释行不产生字段；裸主机只有 ip
        h141 = next(h for h in result["hosts"] if h["ip"] == "192.168.100.141")
        assert list(h141.keys()) == ["ip"]

        # 注入残留的端口属于未知键（表格视图不可编辑，仅源码模式维护）
        # 评审后 ansible_port 升级为已知键，不再计入 unknown_keys
        assert result["unknown_keys"] == []

    def test_roundtrip_real_like_preserves_all_data(self):
        from app.services.inventory_service import parse_inventory, render_inventory

        once = parse_inventory(REAL_LIKE_INVENTORY)
        text = render_inventory(once["hosts"], once["vars"])
        twice = parse_inventory(text)

        assert twice["errors"] == []
        key = lambda h: [int(p) for p in h["ip"].split(".")]  # noqa: E731
        assert sorted(twice["hosts"], key=key) == sorted(once["hosts"], key=key)
        assert twice["vars"] == once["vars"]
        assert twice["unknown_keys"] == once["unknown_keys"]

    def test_empty_text_reports_missing_hosts(self):
        from app.services.inventory_service import parse_inventory

        result = parse_inventory("")
        assert result["errors"]
        assert "hosts" in result["errors"][0]

    def test_top_level_list_reports_error_with_line(self):
        from app.services.inventory_service import parse_inventory

        result = parse_inventory("- a\n- b\n")
        assert len(result["errors"]) == 1
        assert "顶层必须是映射" in result["errors"][0]

    def test_vars_not_dict_reports_structure_error(self):
        from app.services.inventory_service import parse_inventory

        raw = (
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts: {}\n"
            "      vars: broken_scalar\n"
        )
        result = parse_inventory(raw)
        assert len(result["errors"]) == 1
        assert "vars" in result["errors"][0]

    def test_invalid_yaml_reports_error_with_line_number(self):
        from app.services.inventory_service import parse_inventory

        # tab 不能作为缩进字符 —— 报错行号确定为第 2 行
        raw = "all:\n\tbroken: true\n"
        result = parse_inventory(raw)

        assert len(result["errors"]) == 1
        # 错误需带行号定位
        assert "第 2 行" in result["errors"][0]
        assert result["hosts"] == [] and result["vars"] == {}

    def test_structure_error_when_hosts_not_dict(self):
        from app.services.inventory_service import parse_inventory

        raw = (
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts: not_a_dict\n"
        )
        result = parse_inventory(raw)

        assert len(result["errors"]) == 1
        assert "edge_cluster.hosts" in result["errors"][0]


class TestKnownHostKeys:
    """ansible-inventory-advanced-fields: 常用连接变量升级为已知键。"""

    def test_known_host_keys_constant(self):
        from app.services.inventory_service import KNOWN_HOST_KEYS

        for key in ("ip", "ansible_ssh_user", "ansible_ssh_pass",
                    "ansible_port", "ansible_host", "ansible_connection",
                    "ansible_python_interpreter", "ansible_become",
                    "ansible_become_user", "ansible_become_pass",
                    "ansible_ssh_private_key_file", "ansible_ssh_common_args"):
            assert key in KNOWN_HOST_KEYS, f"missing {key}"
        assert len(KNOWN_HOST_KEYS) == 12

    def test_common_connection_vars_not_unknown(self):
        from app.services.inventory_service import parse_inventory

        raw = """all:
  children:
    edge_cluster:
      hosts:
        192.168.0.13:
          ansible_ssh_user: jboss
          ansible_port: 11022
          ansible_host: 192.168.0.13
          ansible_connection: ssh
          ansible_become: true
          ansible_python_interpreter: /usr/bin/python3
"""
        result = parse_inventory(raw)
        assert result["errors"] == []
        assert result["unknown_keys"] == []
        assert result["hosts"][0]["ansible_port"] == 11022

    def test_truly_unknown_key_still_reported(self):
        from app.services.inventory_service import parse_inventory

        raw = """all:
  children:
    edge_cluster:
      hosts:
        192.168.0.13:
          deploy_tier: gold
"""
        result = parse_inventory(raw)
        assert result["unknown_keys"] == ["deploy_tier"]


class TestNormalizeHosts:
    """ansible-inventory-advanced-fields Task 1.3: 类型规范化与校验。"""

    def test_port_numeric_string_normalized_to_int(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts(
            [{"ip": "192.168.0.13", "ansible_port": "11022"}])
        assert errors == []
        assert hosts[0]["ansible_port"] == 11022
        assert isinstance(hosts[0]["ansible_port"], int)

    def test_become_yes_no_normalized_to_bool(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts([
            {"ip": "192.168.0.13", "ansible_become": "yes"},
            {"ip": "192.168.0.14", "ansible_become": "NO"},
        ])
        assert errors == []
        assert hosts[0]["ansible_become"] is True
        assert hosts[1]["ansible_become"] is False

    def test_port_out_of_range_rejected(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts(
            [{"ip": "192.168.0.13", "ansible_port": 99999}])
        assert hosts == []
        assert any("ansible_port" in e and "192.168.0.13" in e for e in errors)

    def test_port_non_numeric_rejected(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts(
            [{"ip": "192.168.0.13", "ansible_port": "ssh"}])
        assert hosts == []
        assert any("ansible_port" in e for e in errors)

    def test_invalid_become_value_rejected(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts(
            [{"ip": "192.168.0.13", "ansible_become": "maybe"}])
        assert hosts == []
        assert any("ansible_become" in e for e in errors)

    def test_empty_string_known_key_dropped(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts([{
            "ip": "192.168.0.13",
            "ansible_ssh_user": "jboss",
            "ansible_port": "",
            "ansible_ssh_private_key_file": "",
        }])
        assert errors == []
        assert "ansible_port" not in hosts[0]
        assert "ansible_ssh_private_key_file" not in hosts[0]
        assert hosts[0]["ansible_ssh_user"] == "jboss"

    def test_connection_free_text_passthrough(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts(
            [{"ip": "10.0.0.1", "ansible_connection": "lxc"}])
        assert errors == []
        assert hosts[0]["ansible_connection"] == "lxc"

    def test_errors_aggregate_across_hosts(self):
        from app.services.inventory_service import normalize_hosts

        hosts, errors = normalize_hosts([
            {"ip": "10.0.0.1", "ansible_port": 99999},
            {"ip": "10.0.0.2", "ansible_become": "maybe"},
        ])
        assert hosts == []
        assert len(errors) == 2
