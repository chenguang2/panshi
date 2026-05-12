
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
local expr = require("resty.expr.v1")
local re_compile = require("resty.core.regex").re_match_compile
local lib_util = core.lib_util
local lib_utils = core.lib_utils
local core_uri_safe_encode = core.uri_safe_encode

local core_str = core.string
local core_tab = core.table
local util_str = lib_util.string
local util_tab = lib_util.table
local utils_req = lib_utils.req
local fix_str = lib_util.fixstring

local str_find = core.string.find
local sub_str = string.sub
local re_sub = ngx.re.sub
local re_gsub = ngx.re.gsub
local req_set_body_data = ngx.req.set_body_data



local plugin_name = "proxy_rewrite"


local lrucache_plugin = core.lrucache.new({ type = 'plugin', serial_creating = true, })
local lrucache_name = core.lrucache.new({ ttl = 300, count = 1024, })


local default_attr
local default_meta
local default_data



local default_upstream_vars
do
local _upstream_vars = {
  ["Host"] = "upstream_host",
  ["Upgrade"] = "upstream_upgrade",
  ["Connection"] = "upstream_connection",
  ["X-Real-IP"] = "remote_addr",
  ["X-Forwarded-For"] = "var_x_forwarded_for",
  ["X-Forwarded-Proto"] = "var_x_forwarded_proto",
  ["X-Forwarded-Host"] = "var_x_forwarded_host",
  ["X-Forwarded-Port"] = "var_x_forwarded_port",
}
local function _convert(name)
  return name:lower():gsub("-","_")
end
default_upstream_vars = {_cache = {}}
setmetatable(default_upstream_vars, {
  __index = function(t,k)
    local _name = lrucache_name(k, nil, _convert, k)
    return t._cache[_name]
  end,
  __newindex = function(t,k,v)
    local _name = lrucache_name(k, nil, _convert, k)
    t._cache[_name] = v
  end,
})
for name,var_name in pairs(_upstream_vars) do
  default_upstream_vars[name] = _upstream_vars[name]
end
end


local enum_method_schema = utils_req.enum_method


local attr_schema = {
  type = "object",
  properties = {
    upstream_vars = {
      type = "object",
      patternProperties = {
        [ [=[^[a-zA-Z0-9_-]+$]=] ] = { type = "string", minLength = 1, pattern = [=[^[a-zA-Z0-9_]+$]=], },
      },
      additionalProperties = false,
    },
  }
}


local schema = {
  type = "object",
  properties = {
    method = { type = "string", enum = enum_method_schema, },
    scheme = { type = "string", enum = {"http", "https"} },
    host = { type = "string", pattern = [[^[0-9a-zA-Z-.]+(:\d{1,5})?$]], },
    --uri = { type = "string", minLength = 1, maxLength = 4096, pattern = [[^\/.*]], },
    uri = { type = "string", minLength = 1, maxLength = 4096, },
    regex_uri = {
      type = "array", minItems = 2, maxItems = 2,
      items = { type = "string", },
    },
    headers = { type = "object", minProperties = 1, },
    body = {
      oneOf = {
        { type = "string", minLength = 0, },
        { type = "array", },
        { type = "object", },
      },
    },
    regex_body = {
      type = "array", minItems = 1,
      items = {
        type = "array", minItems = 2, maxItems = 4,
        items = {
          { type = "string", minLength = 1, },
          { type = "string", },
          { type = "string", },
          { type = "integer", minimum = 0, maximum = 65535, },
        },
      },
    },
    include_body_expr = { type="array", minItems=1, items={oneOf={{type="string"},{type="array"},},}, },
    use_real_request_uri_unsafe = { type = "boolean", }, --default = false,
  },
  minProperties = 1,
}


local _M = {
  version = 0.1,
  priority = 6508,
  type = 'proxy',
  name = plugin_name,
  schema = schema,
  run_unique = true,
}


function _M.check_schema(conf)
  local ok, err = core.schema.check(schema, conf)
  if not ok then
    return false, err
  end

  if conf.include_body_expr then
    local ok, err = expr.new(conf.include_body_expr)
    if not ok then
      return false, "invalid include_body_expr expression: " .. err
    end
  end

  if conf.regex_body then
    for _, filter in ipairs(conf.regex_body) do
      local ok, err = pcall(re_compile, filter[1], "jo")
      if not ok then
        return false, "invalid regex_body(" .. filter[1] ..  "): "  .. err
      end
    end
  end

  if conf.regex_uri and #conf.regex_uri > 0 then
    local _, _, err = re_sub("/fake_uri", conf.regex_uri[1], conf.regex_uri[2], "jo")
    if err then
      return false, "invalid regex_uri(" .. conf.regex_uri[1] ..  ", " .. conf.regex_uri[2] .. "): " .. err
    end
  end

  if not conf.headers then
    return true
  end

  for field, value in pairs(conf.headers) do
    if type(field) ~= 'string' then
      return false, 'invalid type as header field'
    end

    if type(value) ~= 'string' and type(value) ~= 'number' then
      return false, 'invalid type as header value'
    end

    if #field == 0 then
      return false, 'invalid field length in header'
    end

    if not lib_utils.validate_header_field(field) then
      return false, 'invalid field character in header'
    end

    if type(value)=='string' and not lib_utils.validate_header_value(value) then
      return false, 'invalid value character in header'
    end
  end

  return true
end


local function init_default_attr()
  local attr = plugin.plugin_attr(_M.name)
  if attr and attr.enable == false then
    return
  end

  if attr then
    local ok, err = core.schema.check(attr_schema, attr)
    if not ok then
      core.log.error("failed to check the plugin_attr[", _M.name, "]", ": ", err)
      return
    end
  end

  default_attr = attr
  return true
end


local function body_expr_match(conf, ctx)
  if not conf.include_body_expr then
    return true
  end

  if not conf._body_expr then
    local body_expr, _ = expr.new(conf.include_body_expr)
    conf._body_expr = body_expr
  end

  local match_result = conf._body_expr:eval(ctx)

  return match_result
end


do
local upstream_vars = {
  host       = "upstream_host",
  upgrade    = "upstream_upgrade",
  connection = "upstream_connection",
}
local upstream_names = {}
for name, _ in pairs(upstream_vars) do
  core.table.insert(upstream_names, name)
end

function _M.rewrite(conf, ctx)
  for _, name in ipairs(upstream_names) do
    if conf[name] then
      ctx.var[upstream_vars[name]] = conf[name]
    end
  end
  if conf["scheme"] then
    ctx.upstream_scheme = conf["scheme"]
  end

  local upstream_uri = ctx.var.uri
  if conf.use_real_request_uri_unsafe then
    upstream_uri = ctx.var.real_request_uri
  elseif conf.uri ~= nil then
    local uri, err = ngx_resolve_var(conf.uri, ctx)
    if type(uri) == 'string' and util_str.has_prefix(uri, "/") then
      upstream_uri = uri
    else
      local msg = "failed to resolve the uri " .. ctx.var.uri .. " with " .. conf.uri .. ", error: " .. (err or "-")
      core.log.error(msg)
      return 500--, --msg
    end
  elseif conf.regex_uri ~= nil then
    local uri, _, err = re_sub(ctx.var.uri, conf.regex_uri[1], conf.regex_uri[2], "jo")
    if uri then
      upstream_uri = uri
    else
      local msg = "failed to substitute the uri " .. ctx.var.uri .. " (" .. conf.regex_uri[1] .. ") with " ..  conf.regex_uri[2] .. " : " .. err
      core.log.error(msg)
      return 500--, --msg
    end
  end

  if not conf.use_real_request_uri_unsafe then
    local index = str_find(upstream_uri, "?")
    if index then
      upstream_uri = core_uri_safe_encode(sub_str(upstream_uri, 1, index-1)) ..  sub_str(upstream_uri, index)
    else
      upstream_uri = core_uri_safe_encode(upstream_uri)
    end

    if ctx.var.is_args == "?" then
      if index then
        ctx.var.upstream_uri = upstream_uri .. "&" .. (ctx.var.args or "")
      else
        ctx.var.upstream_uri = upstream_uri .. "?" .. (ctx.var.args or "")
      end
    else
      ctx.var.upstream_uri = upstream_uri
    end
  end

  if conf.headers then
    if not conf.headers_arr then
      conf.headers_arr = {}

      for field, value in pairs(conf.headers) do
        core.table.insert_tail(conf.headers_arr, field, value)
      end
    end

    local field_cnt = #conf.headers_arr
    local field_key, field_val
    for i = 1, field_cnt, 2 do
      field_key = conf.headers_arr[i]
      field_val = ngx_resolve_var(conf.headers_arr[i+1], ctx)
      if default_upstream_vars[field_key] then
        ctx.var[ default_upstream_vars[field_key] ] = field_val
      end
      utils_req.set_header(field_key, field_val, ctx)
    end
  end

  if conf.method then
    utils_req.set_method(conf.method)
  end

  if not body_expr_match(conf, ctx) then
    return
  end

  local body, err

  if not conf.body and not conf.regex_body then
    return
  end

  body = ctx.var["req_body"]

  if conf.body then
    body = conf.body
    body = ngx_resolve_vars(body, ctx)
  end

  if body and conf.regex_body then
    body = fix_str(body)

    local replace
    for _, filter in ipairs(conf.regex_body) do
      replace = ngx_resolve_vars(filter[2], ctx)
      if filter[4] == nil then
        body, _, err = re_sub(body, filter[1], replace, filter[3] or "jo")
      elseif filter[4] > 0 then
        for i = 1, filter[4] do
          body, _, err = re_sub(body, filter[1], replace, filter[3] or "jo")
        end
      else
        body, _, err = re_gsub(body, filter[1], replace, filter[3] or "jo")
      end
      if err ~= nil then
        core.log.error("regex(" .. filter[1] .. ") substitutes failed:" .. err)
      end
    end
  end

  if body then
    body = fix_str(body)
    req_set_body_data(body)
    ctx["proxy_rewrite_body"] = body
  end
end
end  -- do


function _M.init()
  if not init_default_attr() then
    return
  end

  local attr = default_attr or {}
  local attr_upstream_vars = attr.upstream_vars or {}
  for name, var_name in pairs(attr_upstream_vars) do
    default_upstream_vars[name] = var_name
  end
end


return _M
