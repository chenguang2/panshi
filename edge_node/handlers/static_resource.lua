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

local function get_file_etag(filepath)
    local f, err = io.open(filepath, "r")
    if not f then
        return nil
    end
    local size = f:seek("end")
    f:seek("set")
    local head = f:read(1024)
    f:close()
    -- simple etag: size + first 64 bytes hash (avoid reading entire file)
    local hash_str = ngx.encode_base64(ngx.sha1_bin(tostring(size) .. (head or "")))
    return '"' .. string.sub(hash_str, 1, 20) .. '-' .. tostring(size) .. '"'
end

local function get_file_size(filepath)
    local f, err = io.open(filepath, "r")
    if not f then
        return nil
    end
    local size = f:seek("end")
    f:close()
    return size
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
        }
    }
}

local default_attr = {
    cache_max_age = DEFAULT_CACHE_MAX_AGE,
    index_file = DEFAULT_INDEX_FILE
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
    -- log_error("uri=[" .. uri .. "]")
    -- log_error("route_id=[" .. route_id .. "]")
    -- log_error("base_uri=[" .. base_uri .. "]")

    local segments = {}
    for s in string.gmatch(uri, "([^/]+)") do
        table.insert(segments, s)
    end

    if #segments < 1 then
        return 404, "Not Found"
    end

    local relative_path = extractPath(uri, base_uri) or index_file
    -- log_error("relative_path=[" .. relative_path .. "]")

    if string.find(relative_path, "..", 1, true) then
        -- log_error("relative_path=[" .. relative_path .. "]")
        return 403, "Forbidden"
    end

    local filepath = base_path .. "/" .. route_id .. "/" .. relative_path
    -- log_error("filepath=[" .. filepath .. "]")

    local ext = ""
    local dot_idx = string.find(relative_path, "%.[^%.]*$")
    if dot_idx then
        ext = string.sub(relative_path, dot_idx + 1)
    end
    ngx.header.content_type = get_mime_type(ext)

    local cache_max_age = conf.cache_max_age or DEFAULT_CACHE_MAX_AGE
    ngx.header["Cache-Control"] = "public, max-age=" .. tostring(cache_max_age)

    local etag = get_file_etag(filepath) or ""
    -- log_error("etag=[" .. etag .. "]")
    if etag then
        ngx.header["ETag"] = etag

        local if_none_match = ngx.var.http_if_none_match

        -- if if_none_match then
        --   log_error("if_none_match=[" .. if_none_match .. "]")
        -- else
        --   log_error("if_none_match=[nil]")
        -- end

        if if_none_match and if_none_match == etag then
            ngx.header.content_type = nil
            ngx.header["Content-Length"] = nil

            -- log_error("return 304")
            return 304
        end
    end

    local f, err = io.open(filepath, "r")
    if not f then
        return 404, "Not Found"
    end

    local file_size = get_file_size(filepath)
    if not file_size then
        f:close()
        return 404, "Not Found"
    end
    -- log_error("file_size=[" .. file_size .. "]")

    ngx.header["Last-Modified"] = ngx.http_time(ngx.time())
    ngx.header["Content-Length"] = tostring(file_size)

    local content = f:read("*all")
    f:close()

    if not content then
        return 404, "Not Found"
    end

    return 200, content
end

function _M.destroy()

end

function _M.init()

end

return _M
