local require = require
local type = type
local pcall = pcall
local error = error
local pairs = pairs
local ipairs = ipairs
local select = select
local tostring = tostring
local tonumber = tonumber
local getmetatable = getmetatable
local setmetatable = setmetatable
local io = io
local math = math
local string = string
local table = table
local ngx = ngx

local core = require("edge.core")
local plugin = require("edge.plugin")

local core_schema = core.schema
local core_tab = core.table
local schema_merge = core_schema.merge
local tab_copy = core_tab.copy

local ngx_subsystem = ngx.config.subsystem
local is_http = ngx_subsystem == "http"

local log = core.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info

local plugin_name = "static_resource"

local nginx_prefix = ngx.config.prefix() or ""
-- 如果 prefix 自带了 /，这里会去掉末尾的 /；如果没带，则保持原样
nginx_prefix = nginx_prefix:gsub("/$", "")
-- 接下来拼接路径就非常安全了
local default_base_path = nginx_prefix .. "/static"
local DEFAULT_CACHE_MAX_AGE = 3600
local DEFAULT_INDEX_FILE = "index.html"

local MIME_TYPES = {
    html = "text/html; charset=utf-8",
    htm = "text/html; charset=utf-8",
    js = "application/javascript; charset=utf-8",
    css = "text/css; charset=utf-8",
    json = "application/json; charset=utf-8",
    xml = "application/xml; charset=utf-8",
    txt = "text/plain; charset=utf-8",
    svg = "image/svg+xml",
    ico = "image/x-icon",
    png = "image/png",
    jpg = "image/jpeg",
    jpeg = "image/jpeg",
    gif = "image/gif",
    webp = "image/webp",
    woff = "font/woff",
    woff2 = "font/woff2",
    ttf = "font/ttf",
    otf = "font/otf",
    eot = "application/vnd.ms-fontobject",
    pdf = "application/pdf",
    map = "application/json"
}

local function get_mime_type(ext)
    local mime = MIME_TYPES[ext:lower()]
    if mime then
        return mime
    end
    return "application/octet-stream"
end

-- 参数 path: 完整路径，如 "/a/b/c/d.jpg"
-- 参数 pattern: 带 * 的模式，如 "/a/b/*"
local function extractPath(path, pattern)
    -- 1. 检查 pattern 是否以 * 结尾
    if pattern:sub(-1) ~= "*" then
        -- print("错误：参数b必须以 * 结尾")
        return nil
    end

    -- 2. 获取 * 前面的部分（即要匹配的头部）
    local prefix = pattern:sub(1, -2) -- 截取从开头到倒数第二个字符

    -- 3. 检查 path 是否以这个 prefix 开头
    -- find 的第三个参数 1 表示从字符串开头匹配，第四个参数 true 表示纯文本匹配（关闭正则）
    local startPos, endPos = path:find(prefix, 1, true)

    -- 如果没找到，或者找到的位置不是从字符串的最开头（位置1），则返回 nil
    if not startPos or startPos ~= 1 then
        return nil
    end

    -- 4. 截取 prefix 之后的部分
    -- endPos 是 prefix 结束的索引，所以从 endPos + 1 开始截取到最后
    local result = path:sub(endPos + 1)

    return result
end

local function is_resource_request(relative_path)
    local last_seg = relative_path:match("([^/]+)/?$") or ""
    local ext = last_seg:match("%.([^%.]+)$")
    if not ext then
        return false
    end
    return MIME_TYPES[ext:lower()] ~= nil
end

local function strip_first_segment(relative_path)
    local first, rest = relative_path:match("^([^/]+)(.*)$")
    if not first then
        return relative_path
    end
    if rest == "" then
        -- 单段路径（如 webTrade）剥空后走候选探测，命中根 index.html
        return ""
    end
    return (rest:gsub("^/+", ""))
end

-- 候选探测：先试普通文件，再试目录索引（relative_path/index_file）。
-- 目录 open 可能成功（部分文件系统 seek 也成功），但 read 必然失败
-- （"Is a directory"），因此以 read 成功与否判定普通文件；
-- 返回 content 供阶段二直接使用，避免重复打开。
local function try_candidate(base_dir, relative_path, index_file)
    local function try_read(path)
        local fh = io.open(path, "r")
        if not fh then
            return nil
        end
        local content = fh:read("*all")
        fh:close()
        return content
    end

    local direct = try_read(base_dir .. "/" .. relative_path)
    if direct then
        return direct, base_dir .. "/" .. relative_path
    end

    local dir_rel = relative_path
    local index_path
    if dir_rel:sub(-1) == "/" then
        index_path = base_dir .. "/" .. dir_rel .. index_file
    else
        index_path = base_dir .. "/" .. dir_rel .. "/" .. index_file
    end
    local dir_index = try_read(index_path)
    if dir_index then
        return dir_index, index_path
    end

    return nil
end

local function strip_app_base(relative_path, app_base)
    if not app_base or app_base == "" then
        return relative_path
    end
    -- 归一化：去尾部 /，去前导 /
    local prefix = app_base:gsub("/+$", ""):gsub("^/+", "")
    if prefix == "" then
        return relative_path
    end
    local prefix_len = #prefix
    local head = relative_path:sub(1, prefix_len)
    if head ~= prefix then
        return relative_path
    end
    local rest = relative_path:sub(prefix_len + 1)
    -- 边界必须是 / 或结尾，避免 webTradeX 被误剥
    if rest == "" or rest:sub(1, 1) == "/" then
        return (rest:gsub("^/+", ""))
    end
    return relative_path
end

local function get_content_etag(content)
    local size = #content
    local head = content:sub(1, 1024)
    local hash_str = ngx.encode_base64(ngx.sha1_bin(tostring(size) .. (head or "")))
    return '"' .. string.sub(hash_str, 1, 20) .. '-' .. tostring(size) .. '"'
end

local schema = {
    type = "object",
    properties = {
        cache_max_age = {
            type = "integer",
            minimum = 0
        },
        index_file = {
            type = "string"
        },
        spa_fallback = {
            type = "boolean"
        },
        app_base = {
            type = "string"
        }
    }
}

local attr_schema = {
    type = "object",
    properties = {
        cache_max_age = {
            type = "integer",
            minimum = 0
        },
        index_file = {
            type = "string"
        },
        spa_fallback = {
            type = "boolean"
        },
        app_base = {
            type = "string"
        }
    }
}

local default_attr_schema = {
    type = "object",
    properties = {
        cache_max_age = {
            type = "integer",
            minimum = 0
        },
        index_file = {
            type = "string"
        },
        spa_fallback = {
            type = "boolean"
        },
        app_base = {
            type = "string"
        }
    }
}

local default_attr = {
    cache_max_age = DEFAULT_CACHE_MAX_AGE,
    index_file = DEFAULT_INDEX_FILE,
    spa_fallback = false,
    app_base = ""
}

local _M = plugin.new({
    version = 0.1,
    priority = 9980,
    name = plugin_name,
    schema = schema,
    attr_schema = attr_schema,
    default_attr_schema = default_attr_schema,
    default_attr = default_attr
})

-- 导出纯函数供单元测试使用
_M.strip_app_base = strip_app_base
_M.is_resource_request = is_resource_request

function _M.check_schema(conf, schema_type)
    if schema_type == core_schema.TYPE_CONSUMER then
        return true
    end
    local ok, err = core_schema.check(schema, conf)
    if not ok then
        return false, err
    end
    return true
end

function _M.access(conf, ctx)
    local uri = ngx.var.uri
    if not uri then
        return
    end

    local base_path = conf.base_path or default_base_path
    local index_file = conf.index_file or DEFAULT_INDEX_FILE
    local route_id = ctx.var.route_id or ""
    local matched_route = ctx.var.matched_route or {}
    local base_uri = matched_route["uri"] or ""

    local base_dir = base_path .. "/" .. route_id

    -- 阶段一：纯解析，不设置任何响应头
    local relative_path = extractPath(uri, base_uri) or index_file
    if relative_path == "" then
        relative_path = index_file
    end

    if string.find(relative_path, "..", 1, true) or string.find(index_file, "..", 1, true) then
        return 403, "Forbidden"
    end

    local content, filepath = try_candidate(base_dir, relative_path, index_file)

    if not content and not (conf.spa_fallback and not is_resource_request(relative_path)) then
        -- base 剥离：app_base 精确剥离，或单段前缀试探（仅当原路径完全不存在时）
        local original_exists = io.open(base_dir .. "/" .. relative_path, "r")
        if original_exists then
            original_exists:close()
        end

        if not original_exists then
            local stripped
            if conf.app_base and conf.app_base ~= "" then
                stripped = strip_app_base(relative_path, conf.app_base)
            else
                stripped = strip_first_segment(relative_path)
            end

            if stripped ~= relative_path then
                -- 剥空后：目录请求（原路径以 / 结尾）走目录索引；导航请求并入 SPA 回退
                if stripped == "" and not relative_path:match("/$") then
                    stripped = nil
                end
                if stripped then
                    content, filepath = try_candidate(base_dir, stripped, index_file)
                end
            end
        end
    end

    if not content and conf.spa_fallback and not is_resource_request(relative_path) then
        content, filepath = try_candidate(base_dir, index_file, index_file)
    end

    if not content then
        return 404, "Not Found"
    end

    -- 阶段二：基于最终 filepath 设置响应
    local ext = ""
    local dot_idx = string.find(filepath, "%.[^%.]*$")
    if dot_idx then
        ext = string.sub(filepath, dot_idx + 1)
    end
    ngx.header.content_type = get_mime_type(ext)

    local cache_max_age = conf.cache_max_age or DEFAULT_CACHE_MAX_AGE
    ngx.header["Cache-Control"] = "public, max-age=" .. tostring(cache_max_age)

    local etag = get_content_etag(content)
    ngx.header["ETag"] = etag

    local if_none_match = ngx.var.http_if_none_match
    if if_none_match and if_none_match == etag then
        ngx.header.content_type = nil
        ngx.header["Content-Length"] = nil
        return 304
    end

    ngx.header["Last-Modified"] = ngx.http_time(ngx.time())
    ngx.header["Content-Length"] = tostring(#content)

    return 200, content
end

function _M.destroy()

end

function _M.init()

end

return _M
