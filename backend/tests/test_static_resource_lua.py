"""
TDD-driven unit tests for edge_node/handlers/static_resource.lua.

Runs the actual Lua plugin inside lupa (Lua 5.4) with mocked ngx / edge modules,
using real files on a temp directory. Each test follows RED -> GREEN -> REFACTOR.
"""
import os
import pytest
from lupa.lua54 import LuaRuntime

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE_NODE_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "edge_node")
HANDLERS_DIR = os.path.join(EDGE_NODE_DIR, "handlers")
LUA_MOCKS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lua_mocks")

LUA_PATH_FMT = "%s/?.lua;%s/?.lua;"


@pytest.fixture
def lua(tmp_path):
    """Create a Lua runtime with mocked ngx/edge, load the real static_resource.lua."""
    rt = LuaRuntime(unpack_returned_tuples=True)
    rt.execute(
        "package.path = '" + LUA_PATH_FMT % (LUA_MOCKS_DIR, HANDLERS_DIR) + "' .. package.path"
    )
    # ---- mock ngx ----
    rt.execute(
        """
        ngx = {
          config = {
            subsystem = "http",
            prefix = function() return "/usr/local/openresty/nginx" end,
          },
          var = {},
          header = {},
          time = function() return 1700000000 end,
          http_time = function() return "Tue, 14 Nov 2023 22:13:20 GMT" end,
          encode_base64 = function(s) return s end,
          sha1_bin = function(s) return s end,
        }
        """
    )
    rt.execute("M = require('static_resource')")
    return rt


@pytest.fixture
def plugin(lua):
    return lua.globals().M


@pytest.fixture
def site(tmp_path):
    """Build a realistic static resource file tree under tmp_path/static/route1/."""
    base = tmp_path / "static" / "route1"
    assets = base / "assets" / "js"
    assets.mkdir(parents=True)
    (base / "index.html").write_text("<html>root index</html>", encoding="utf-8")
    (assets / "index.js").write_text("console.log('hi');", encoding="utf-8")
    (base / "css").mkdir()
    (base / "css" / "app.css").write_text("body{}", encoding="utf-8")
    docs = base / "docs"
    docs.mkdir()
    (docs / "index.html").write_text("<html>docs index</html>", encoding="utf-8")
    return base


def _call(lua, uri, base_dir, spa_fallback=False, app_base="", if_none_match=None):
    """Drive M.access() with the given request URI and config."""
    lua.globals().ngx.var.uri = uri
    if if_none_match is None:
        lua.globals().ngx.var.http_if_none_match = None
    else:
        lua.globals().ngx.var.http_if_none_match = if_none_match
    # reset captured headers
    lua.execute("ngx.header = {}")
    conf = lua.table(
        base_path=str(base_dir.parent),
        route_id="route1",
        index_file="index.html",
        cache_max_age=3600,
        spa_fallback=spa_fallback,
        app_base=app_base,
    )
    ctx = lua.table(
        var=lua.table(
            route_id="route1",
            matched_route=lua.table(uri="/*"),
        )
    )
    M = lua.globals().M
    return M.access(conf, ctx)


def _headers(lua):
    return lua.globals().ngx.header


# ============================================================================
# Regression: directory detection must NOT rely on f:seek("end") failing.
# On some filesystems (e.g. /mnt/z network mount) lseek on a directory
# returns a size (truthy) instead of EINVAL, so a directory would be
# mistaken for a file -> read("*all") fails -> 404 instead of dir index.
# ============================================================================
class TestDirectoryDetectionPortability:

    def _bad_fs_lua(self):
        rt = LuaRuntime(unpack_returned_tuples=True)
        rt.execute(
            "package.path = '" + LUA_PATH_FMT % (LUA_MOCKS_DIR, HANDLERS_DIR) + "' .. package.path"
        )
        rt.execute(
            """
            ngx = {
              config = { subsystem = "http", prefix = function() return "/usr/local/openresty/nginx" end },
              var = {},
              header = {},
              time = function() return 1700000000 end,
              http_time = function() return "Tue, 14 Nov 2023 22:13:20 GMT" end,
              encode_base64 = function(s) return s end,
              sha1_bin = function(s) return s end,
            }
            """
        )
        return rt

    def _install_bad_fs(self, lua, base_dir, dir_rel):
        dir_path = os.path.join(base_dir, dir_rel)
        if not dir_rel.endswith("/"):
            dir_path += "/"
        lua.globals()._bad_dir_path = dir_path
        lua.execute(
            """
            _orig_io_open = io.open
            io.open = function(path, mode)
              local fh = _orig_io_open(path, mode)
              if fh and path == _bad_dir_path then
                return {
                  seek = function() return 512 end,
                  read = function() return nil, "Is a directory" end,
                  close = function() end,
                }
              end
              return fh
            end
            """
        )
        lua.execute("M = require('static_resource')")

    def test_dir_with_index_served_when_seek_succeeds_on_dir(self, tmp_path):
        base = tmp_path / "static" / "route1"
        docs = base / "docs"
        docs.mkdir(parents=True)
        (docs / "index.html").write_text("<html>docs index</html>", encoding="utf-8")
        lua = self._bad_fs_lua()
        self._install_bad_fs(lua, str(base), "docs/")
        lua.globals().ngx.var.uri = "/docs/"
        lua.globals().ngx.var.http_if_none_match = None
        lua.execute("ngx.header = {}")
        conf = lua.table(base_path=str(base.parent), route_id="route1", index_file="index.html",
                         cache_max_age=3600, spa_fallback=False, app_base="")
        ctx = lua.table(var=lua.table(route_id="route1", matched_route=lua.table(uri="/*")))
        result = lua.globals().M.access(conf, ctx)
        assert result[0] == 200
        assert result[1] == "<html>docs index</html>"

    def test_root_dir_with_index_served_when_seek_succeeds(self, tmp_path):
        base = tmp_path / "static" / "route1"
        base.mkdir(parents=True)
        (base / "index.html").write_text("<html>root index</html>", encoding="utf-8")
        lua = self._bad_fs_lua()
        self._install_bad_fs(lua, str(base), "")
        lua.globals().ngx.var.uri = "/"
        lua.globals().ngx.var.http_if_none_match = None
        lua.execute("ngx.header = {}")
        conf = lua.table(base_path=str(base.parent), route_id="route1", index_file="index.html",
                         cache_max_age=3600, spa_fallback=False, app_base="")
        ctx = lua.table(var=lua.table(route_id="route1", matched_route=lua.table(uri="/*")))
        result = lua.globals().M.access(conf, ctx)
        assert result[0] == 200
        assert result[1] == "<html>root index</html>"


# ============================================================================
# Task 1.9 — path traversal protection and no shell calls.
#   ".." in relative_path or index_file -> 403. The plugin must not invoke
#   io.popen/os.execute (no shell for directory detection).
# ============================================================================
class TestPathTraversalAndNoShell:

    def test_dotdot_returns_403(self, lua, site):
        status, _body = _call(lua, "/../secret.txt", site)
        assert status == 403

    def test_dotdot_encoded_in_nested_path_returns_403(self, lua, site):
        status, _body = _call(lua, "/assets/../secret.txt", site)
        assert status == 403

    def test_dotdot_in_stripped_path_returns_403(self, lua, site):
        status, _body = _call(lua, "/webTrade/../secret.txt", site)
        assert status == 403

    def test_no_shell_call_in_access(self, lua, site):
        calls = []
        lua.execute(
            """
            _orig_popen = io.popen
            io.popen = function(...)
              table.insert(_shell_calls, {...})
              return _orig_popen(...)
            end
            """
        )
        lua.globals()._shell_calls = calls
        _call(lua, "/", site)
        _call(lua, "/assets/js/index.js", site)
        _call(lua, "/docs/", site)
        assert len(lua.globals()._shell_calls) == 0

    def test_no_os_execute_in_access(self, lua, site):
        lua.execute(
            """
            _orig_os_execute = os.execute
            os.execute = function(...)
              table.insert(_os_calls, {...})
              return _orig_os_execute(...)
            end
            """
        )
        lua.globals()._os_calls = []
        _call(lua, "/", site)
        assert len(lua.globals()._os_calls) == 0


# ============================================================================
# Task 1.8 — response headers based on the FINAL resolved file:
#   SPA fallback / directory index must yield text/html; etag must match the
#   actually-served file; If-None-Match -> 304; Content-Length correct.
# ============================================================================
class TestResponseHeaders:

    def test_fallback_serves_html_mime(self, lua, site):
        _call(lua, "/login", site, spa_fallback=True)
        assert _headers(lua)["content_type"] == "text/html; charset=utf-8"

    def test_directory_index_serves_html_mime(self, lua, site):
        _call(lua, "/docs/", site)
        assert _headers(lua)["content_type"] == "text/html; charset=utf-8"

    def test_cache_control_present(self, lua, site):
        _call(lua, "/index.html", site)
        assert _headers(lua)["Cache-Control"] == "public, max-age=3600"

    def test_etag_present(self, lua, site):
        _call(lua, "/index.html", site)
        assert _headers(lua)["ETag"]

    def test_etag_based_on_final_file(self, lua, site):
        _call(lua, "/", site)
        etag_root = _headers(lua)["ETag"]
        _call(lua, "/docs/", site)
        etag_docs = _headers(lua)["ETag"]
        assert etag_root != etag_docs

    def test_etag_stable_across_requests(self, lua, site):
        _call(lua, "/index.html", site)
        etag1 = _headers(lua)["ETag"]
        _call(lua, "/index.html", site)
        etag2 = _headers(lua)["ETag"]
        assert etag1 == etag2

    def test_if_none_match_returns_304(self, lua, site):
        _call(lua, "/index.html", site)
        etag = _headers(lua)["ETag"]
        result = _call(lua, "/index.html", site, if_none_match=etag)
        assert result == 304

    def test_if_none_match_wrong_etag_returns_200(self, lua, site):
        status, _body = _call(lua, "/index.html", site, if_none_match='"deadbeef-1"')
        assert status == 200

    def test_content_length_matches_body(self, lua, site):
        _call(lua, "/index.html", site)
        assert _headers(lua)["Content-Length"] == str(len("<html>root index</html>"))

    def test_last_modified_present(self, lua, site):
        _call(lua, "/index.html", site)
        assert _headers(lua)["Last-Modified"]


# ============================================================================
# Task 1.7 — SPA fallback: spa_fallback=true + navigation request (no ext or
#   unknown ext) and no file found -> serve root index.html.
#   Resource requests (ext in MIME_TYPES) NEVER fall back -> strict 404.
# ============================================================================
class TestAccessSpaFallback:

    def test_navigation_request_falls_back_to_index(self, lua, site):
        status, body = _call(lua, "/login", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_nested_navigation_falls_back(self, lua, site):
        status, body = _call(lua, "/user/profile", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_dotted_navigation_path_falls_back(self, lua, site):
        status, body = _call(lua, "/v1.0", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_base_prefixed_navigation_falls_back(self, lua, site):
        status, body = _call(lua, "/webTrade/login", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_missing_js_resource_never_falls_back(self, lua, site):
        status, _body = _call(lua, "/assets/js/missing.js", site, spa_fallback=True)
        assert status == 404

    def test_missing_css_resource_never_falls_back(self, lua, site):
        status, _body = _call(lua, "/assets/missing.css", site, spa_fallback=True)
        assert status == 404

    def test_missing_png_resource_never_falls_back(self, lua, site):
        status, _body = _call(lua, "/img/missing.png", site, spa_fallback=True)
        assert status == 404

    def test_missing_json_resource_never_falls_back(self, lua, site):
        status, _body = _call(lua, "/api/data.json", site, spa_fallback=True)
        assert status == 404

    def test_spa_fallback_disabled_navigation_returns_404(self, lua, site):
        status, _body = _call(lua, "/login", site, spa_fallback=False)
        assert status == 404

    def test_fallback_returns_html_content_type(self, lua, site):
        _call(lua, "/login", site, spa_fallback=True)
        headers = _headers(lua)
        assert headers["content_type"] == "text/html; charset=utf-8"

    def test_existing_file_wins_over_fallback(self, lua, site):
        status, body = _call(lua, "/docs", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>docs index</html>"


# ============================================================================
# Task 1.6 — base prefix stripping in access():
#   - app_base configured -> exact strip (multi-segment supported)
#   - app_base empty -> single-segment strip probe (webTrade/assets/x.js -> assets/x.js)
#   - original path hit takes priority over stripping
# ============================================================================
class TestAccessBaseStripping:

    def test_app_base_exact_strip_serves_file(self, lua, site):
        status, body = _call(lua, "/webTrade/assets/js/index.js", site, app_base="/webTrade")
        assert status == 200
        assert body == "console.log('hi');"

    def test_app_base_with_trailing_slash(self, lua, site):
        status, body = _call(lua, "/webTrade/assets/js/index.js", site, app_base="/webTrade/")
        assert status == 200
        assert body == "console.log('hi');"

    def test_app_base_multi_segment_strip(self, lua, site):
        status, body = _call(lua, "/apps/webTrade/assets/js/index.js", site, app_base="/apps/webTrade")
        assert status == 200
        assert body == "console.log('hi');"

    def test_app_base_strip_root_path_serves_index(self, lua, site):
        status, body = _call(lua, "/webTrade/", site, app_base="/webTrade")
        assert status == 200
        assert body == "<html>root index</html>"

    def test_single_segment_probe_when_app_base_empty(self, lua, site):
        status, body = _call(lua, "/webTrade/assets/js/index.js", site)
        assert status == 200
        assert body == "console.log('hi');"

    def test_single_segment_probe_root_serves_index(self, lua, site):
        status, body = _call(lua, "/webTrade/", site)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_single_segment_probe_serves_index_without_slash(self, lua, site):
        status, body = _call(lua, "/webTrade", site, spa_fallback=True)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_single_segment_no_slash_without_spa_fallback_404(self, lua, site):
        status, _body = _call(lua, "/webTrade", site)
        assert status == 404

    def test_multi_segment_without_app_base_returns_404(self, lua, site):
        status, _body = _call(lua, "/apps/webTrade/assets/js/index.js", site)
        assert status == 404

    def test_original_path_wins_over_strip(self, lua, site):
        (site / "webTrade" / "assets" / "js").mkdir(parents=True)
        (site / "webTrade" / "assets" / "js" / "index.js").write_text("nested version", encoding="utf-8")
        status, body = _call(lua, "/webTrade/assets/js/index.js", site)
        assert status == 200
        assert body == "nested version"

    def test_strip_probe_missing_file_returns_404(self, lua, site):
        status, _body = _call(lua, "/webTrade/nope.js", site)
        assert status == 404


# ============================================================================
# Task 1.4/1.5 — access() two-phase resolution with candidate probing.
#   Phase 1: resolve final filepath (original path -> directory index).
#   Phase 2: set response headers based on the FINAL file.
# ============================================================================
class TestAccessBasicResolution:

    def test_serves_existing_file(self, lua, site):
        status, body = _call(lua, "/index.html", site)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_serves_nested_file(self, lua, site):
        status, body = _call(lua, "/assets/js/index.js", site)
        assert status == 200
        assert body == "console.log('hi');"

    def test_root_path_returns_directory_index(self, lua, site):
        status, body = _call(lua, "/", site)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_trailing_slash_returns_directory_index(self, lua, site):
        status, body = _call(lua, "/", site)
        assert status == 200
        assert body == "<html>root index</html>"

    def test_subdirectory_with_slash_returns_dir_index(self, lua, site):
        status, body = _call(lua, "/docs/", site)
        assert status == 200
        assert body == "<html>docs index</html>"

    def test_subdirectory_without_slash_returns_dir_index(self, lua, site):
        status, body = _call(lua, "/docs", site)
        assert status == 200
        assert body == "<html>docs index</html>"

    def test_missing_file_returns_404(self, lua, site):
        status, _body = _call(lua, "/nope.html", site)
        assert status == 404

    def test_directory_without_index_returns_404(self, lua, site):
        status, _body = _call(lua, "/css", site)
        assert status == 404

    def test_html_content_type_for_index(self, lua, site):
        _call(lua, "/", site)
        headers = _headers(lua)
        assert headers["content_type"] == "text/html; charset=utf-8"

    def test_js_content_type_for_asset(self, lua, site):
        _call(lua, "/assets/js/index.js", site)
        headers = _headers(lua)
        assert headers["content_type"] == "application/javascript; charset=utf-8"


# ============================================================================
# Task 1.3 — is_resource_request(relative_path)
#   True when the last path segment's extension is in MIME_TYPES (a resource
#   request -> never SPA-fallback). False for extensionless or unknown ext
#   (a navigation request -> may fall back).
# ============================================================================
class TestIsResourceRequest:

    def test_js_is_resource(self, plugin):
        assert plugin.is_resource_request("assets/x.js") is True

    def test_css_is_resource(self, plugin):
        assert plugin.is_resource_request("css/app.css") is True

    def test_png_is_resource(self, plugin):
        assert plugin.is_resource_request("img/logo.png") is True

    def test_json_is_resource(self, plugin):
        assert plugin.is_resource_request("api/data.json") is True

    def test_html_is_resource(self, plugin):
        assert plugin.is_resource_request("index.html") is True

    def test_uppercase_extension_is_resource(self, plugin):
        assert plugin.is_resource_request("assets/x.JS") is True

    def test_extensionless_navigation_is_not_resource(self, plugin):
        assert plugin.is_resource_request("login") is False

    def test_dotted_navigation_path_is_not_resource(self, plugin):
        assert plugin.is_resource_request("v1.0") is False

    def test_unknown_extension_is_not_resource(self, plugin):
        assert plugin.is_resource_request("file.xyz") is False

    def test_trailing_slash_navigation_is_not_resource(self, plugin):
        assert plugin.is_resource_request("webTrade/") is False

    def test_nested_extensionless_is_not_resource(self, plugin):
        assert plugin.is_resource_request("user/profile") is False

    def test_nested_js_is_resource(self, plugin):
        assert plugin.is_resource_request("webTrade/assets/x.js") is True


# ============================================================================
# Task 1.2 — strip_app_base(relative_path, app_base)
#   Normalizes app_base (strip trailing "/"), removes the prefix from
#   relative_path when the boundary is "/" or end-of-string.
# ============================================================================
class TestStripAppBase:

    def test_strips_single_segment_prefix(self, plugin):
        assert plugin.strip_app_base("webTrade/assets/x.js", "/webTrade") == "assets/x.js"

    def test_strips_prefix_with_trailing_slash_config(self, plugin):
        assert plugin.strip_app_base("webTrade/assets/x.js", "/webTrade/") == "assets/x.js"

    def test_strips_exact_prefix_to_empty(self, plugin):
        assert plugin.strip_app_base("webTrade", "/webTrade") == ""

    def test_prefix_with_slash_suffix(self, plugin):
        assert plugin.strip_app_base("webTrade/", "/webTrade") == ""

    def test_no_strip_when_no_match(self, plugin):
        assert plugin.strip_app_base("assets/x.js", "/webTrade") == "assets/x.js"

    def test_no_strip_when_prefix_partial_segment(self, plugin):
        # "webTradeX" starts with "webTrade" but boundary is not "/" or end
        assert plugin.strip_app_base("webTradeX/assets/x.js", "/webTrade") == "webTradeX/assets/x.js"

    def test_empty_app_base_returns_original(self, plugin):
        assert plugin.strip_app_base("assets/x.js", "") == "assets/x.js"

    def test_nil_app_base_returns_original(self, plugin):
        assert plugin.strip_app_base("assets/x.js", None) == "assets/x.js"

    def test_strips_multiple_segment_prefix_when_configured(self, plugin):
        assert plugin.strip_app_base("apps/webTrade/assets/x.js", "/apps/webTrade") == "assets/x.js"

    def test_double_segment_prefix_with_trailing_slash(self, plugin):
        assert plugin.strip_app_base("apps/webTrade/assets/x.js", "/apps/webTrade/") == "assets/x.js"


# ============================================================================
# Task 1.1 — schema declares spa_fallback (boolean, default false) and
#           app_base (string, default "") in schema/attr_schema/default_attr.
# ============================================================================
class TestSchemaFields:

    def test_schema_properties_include_spa_fallback(self, plugin):
        props = plugin.schema["properties"]
        assert props["spa_fallback"]["type"] == "boolean"

    def test_schema_properties_include_app_base(self, plugin):
        props = plugin.schema["properties"]
        assert props["app_base"]["type"] == "string"

    def test_attr_schema_properties_include_spa_fallback(self, plugin):
        props = plugin.attr_schema["properties"]
        assert props["spa_fallback"]["type"] == "boolean"

    def test_attr_schema_properties_include_app_base(self, plugin):
        props = plugin.attr_schema["properties"]
        assert props["app_base"]["type"] == "string"

    def test_default_attr_has_spa_fallback_false(self, plugin):
        assert plugin.default_attr["spa_fallback"] is False

    def test_default_attr_has_app_base_empty(self, plugin):
        assert plugin.default_attr["app_base"] == ""

    def test_default_attr_schema_has_spa_fallback(self, plugin):
        props = plugin.default_attr_schema["properties"]
        assert props["spa_fallback"]["type"] == "boolean"

    def test_default_attr_schema_has_app_base(self, plugin):
        props = plugin.default_attr_schema["properties"]
        assert props["app_base"]["type"] == "string"
