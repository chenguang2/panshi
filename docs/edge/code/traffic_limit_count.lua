
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
local lib_util = core.lib_util
local lib_utils = core.lib_utils
local lrucache_lib = lib_util.lrucache
local plugin_ctx_key = lrucache_lib.plugin_ctx_key
local plugin_ctx_id = lrucache_lib.plugin_ctx_id
local is_var_plugin = plugin.is_var_plugin

local core_schema = core.schema
local schema_merge = core_schema.merge
local redis_schema = core_schema.redis_schema
local json = lib_util.json
local cjson = lib_util.cjson
local core_str = core.string
local core_tab = core.table
local util_str = lib_util.string
local util_tab = lib_util.table
local fix_str = lib_util.fixstring
local resolve_var0 = lib_utils.resolve_var0

local tab_pool = util_tab.pool
local tab_new = util_tab.new
local tab_copy = util_tab.copy
local tab_clear = util_tab.clear
local tab_nkeys = util_tab.nkeys
local tab_insert = util_tab.insert
local tab_concat = util_tab.concat
local tab_eq = util_tab.eq
local math_min = math.min
local ngx_crc32_short = ngx.crc32_short
local json_encode = json.encode

local log = lib_util.log
local log_error = log.error
local log_info = log.info
local log_warn = log.warn


--local limit_local_new = require("edge.plugins.traffic_limit_count.local").new
--local limit_redis_new = require("edge.plugins.traffic_limit_count.redis").new
local limit_local_new
local limit_redis_new



local plugin_name = "traffic_limit_count"


local lrucaches = {}
lrucaches.plugin = lrucache_lib.new({ type = 'plugin', count = 1024, serial_creating = true, })
lrucaches.limits = lrucache_lib.new({ type = 'plugin', count = 4096, })
lrucaches.encode = lrucache_lib.new({ type = 'plugin', })
lrucaches.group = lrucache_lib.new({ type = 'plugin', })

local default_attr
local default_meta
local default_data


local DEFAULT_RESP_HEADER_LIMIT = "X-EDGE-LimitCount-Remaining"
local DEFAULT_LIMIT_KEY = "$" -- "${remote_addr}"
local DEFAULT_LIMIT_STATUS = 403
local DEFAULT_LIMIT_ERROR_STATUS = 403
--local DEFAULT_LIMIT_MESSAGE = "failed"
local DEFAULT_REDIS_DC = "TEST"
local DEFAULT_REDIS_CONF = {
  CLUSTER_TEST = {
    { "127.0.0.1", 6379 },
  },
}

local MATCH_MISSING = -2
local MATCH_ERROR = -1
local MATCH_NONE = 0
local MATCH_COUNT = 1


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
  key = DEFAULT_LIMIT_KEY,
  status = DEFAULT_LIMIT_STATUS,
  --message = DEFAULT_LIMIT_MESSAGE,
  redis_dc = DEFAULT_REDIS_DC,
  redis_conf = DEFAULT_REDIS_CONF,
}



local additional_properties = {
  redis = {
    properties = {
      redis_dc = { type = "string", minLength = 1, }, --default = "TEST",
      redis_conf = {
        type = "object",
        patternProperties = {
          [ [=[^CLUSTER_[a-zA-Z0-9]+$]=] ] = {
            type = "array", minItems = 1,
            items = {
              type = "array", minItems = 2,
              items = {
                { type = "string", minimum = 1 },
                { type = "integer", minimum = 1, maximum = 65535, default = 6379, },
              },
            },
          },
        },
        properties = {
          MODE = { type = "string", enum = { "redis", "rediscluster" }, }, --default = "redis",
          DATABASE = { type = "integer", minimum = 0, }, --default = 0,
          AUTH = { type = "string", minLength = 0, },
          TIMEOUT = { type = "number", minimum = 0.001, }, --default = 1,
          MAX_IDLE_TIME = { type = "integer", minimum = 1, }, --default = 60,
          CONNECTION_MAX_SIZE = { type = "integer", minimum = 1, }, --default = 60,
        },
      },
    },
  },
}

local _schema = {
  type = "object",
  properties = {
    status = { type = "integer", minimum = 200, maximum = 599, }, --default = DEFAULT_LIMIT_STATUS,
    message = { type = "string", minLength = 0, maxLength = 1024, },
    bypass_missing_key = { type = "boolean", }, --default = true
    bypass_error_limit = { type = "boolean", }, --default = true
    header_name = { type = "string", minLength = 1, maxLength = 1024, },
    show_resp_limit_header = { type = "boolean", }, --default = false
  },
}

local metadata_schema = schema_merge({
  type = "object",
  properties = {
  },
}, { _schema, redis_schema })

local schema = schema_merge({
  type = "object",
  properties = {
    limits = {
      type = "array",
      items = {
        type = "object",
        properties = {
          key = { type = "string", minLength = 1, default = DEFAULT_LIMIT_KEY },
          count = { type = "integer", exclusiveMinimum = 0, default = 3 },
          window = { type = "number",  exclusiveMinimum = 0, default = 5 },
        },
        --required = { "key" },
      },
    },
    policy = { type = "string", enum = { "local", "redis" }, default = "local", },
    group = { type = "string" },
  },
  --required = { "limits" },
}, { _schema, redis_schema })
local schema_copy = tab_copy(schema)


local _M = plugin.new({
  version = 0.4,
  priority = 6200,
  name = plugin_name,
  schema = schema,
  metadata_schema = metadata_schema,
  --attr_schema = attr_schema,
  default_attr_schema = default_plugin_attr_schema,
  default_attr = default_plugin_attr,
  lrucaches = lrucaches,
})



local function group_conf(conf)
  return conf
end


local function check(conf)
  if conf.group then
    local fields = {}
    for k in pairs(schema_copy.properties) do
      if not _schema.properties[k] then
        tab_insert(fields, k)
      end
    end

    local prev_conf = lrucaches.group(conf.group, "", group_conf, conf)

    for _, field in ipairs(fields) do
      if not tab_eq(prev_conf[field], conf[field]) then
        log_error(_M.name, "group [previous]", prev_conf.group, " conf: ", json_encode(prev_conf))
        log_error(_M.name, "group [current]", conf.group, " conf: ", json_encode(conf))
        return false, "group conf mismatched"
      end
    end
  end

  if conf.header_name then
    if type(conf.header_name) ~= 'string' then
      return false, 'invalid type as header name'
    end

    if #conf.header_name == 0 then
      return false, 'invalid length in header name'
    end

    if not lib_utils.validate_header_field(conf.header_name) then
      return false, 'invalid character in header name'
    end
  end

  return true
end
_M.check = check


local function plugin_name_encode(str)
  if type(str) ~= 'string' then
    return ""
  end
  return tostring(ngx_crc32_short(str))
end


local function create_limit_obj(limit, conf)
  local conf_policy = conf.policy or "local"

  if limit_local_new and conf_policy == "local" then
    local lim = limit_local_new("plugin_".._M.name, limit.count, limit.window)
    if not lim then
      lim = limit_local_new("plugin_"..plugin_name, limit.count, limit.window)
    end
    return lim
  end

  if limit_redis_new and conf_policy == "redis" then
    local md_conf = _M.meta or {}
    return limit_redis_new(_M.name, limit.count, limit.window, md_conf, conf)
  end

  return nil
end


local function process_limit(key, limit, conf, ctx)
  local conf_policy = conf.policy or "local"

  local lim, err
  local cache_key = conf_policy.."["..limit.count..","..limit.window.."]"
  if not conf.group then
    --lim, err = lrucache_lib.plugin_ctx(lrucaches.limits, ctx, cache_key, create_limit_obj, limit, conf)
    lim, err = lrucaches.limits(plugin_ctx_key(ctx, cache_key), "", create_limit_obj, limit, conf)
  else
    lim, err = lrucaches.limits(conf.group.."#"..cache_key, "", create_limit_obj, limit, conf)
  end

  if not lim then
    log_error("failed to fetch limit count object: ", err)
    return MATCH_ERROR, nil, "failed to fetch limit object"
  end

  local remaining, err
  if conf_policy == "local" then
    remaining, err = lim:incoming(key)
    if remaining and remaining < 0 then
      return MATCH_COUNT, remaining
    end
  end

  remaining, err = lim:incoming(key, true)
  if not remaining then
    log_error("failed to limit count: [", fix_str(key), "]", err)
    return MATCH_ERROR, nil, "failed to limit count"
  end

  return MATCH_COUNT, remaining
end

function _M.access(conf, ctx)
  local ctx_var = ctx.var or {}
  local ctx_state = ctx_var["plugin_state"] or {}
  local pluginstate = ctx_state[_M.name]
  local md_conf = _M.meta or {}

  local remaining_min = -1

  local conf_message = conf.message or md_conf.message
  local conf_status = conf.status or md_conf.status

  local conf_limits = conf.limits
  if not conf_limits then return end

  local limit_code, remaining, err_msg
  local rkey, limit_key
  pluginstate["remaining"] = core_tab.new(#conf_limits, 0)
  for _i, _limit in ipairs(conf_limits) do
    repeat
      limit_key = _limit.key
      rkey = resolve_var0(limit_key, ctx.var)
      if rkey == nil then
        pluginstate["remaining"][_i] = {MATCH_MISSING, rkey or "-", 0, "missing key"}
        if conf.bypass_missing_key ~= false then
          break
        end
        pluginstate:risks_mark(0, "missing", {limit_key})
        return conf_status, conf_message
      end

      if not conf.group then
        local name_encode = lrucaches.encode(_M.name, "", plugin_name_encode, _M.name)
        if is_var_plugin(conf, ctx) then
          rkey = plugin_ctx_id(ctx, name_encode..'#'..plugin.conf_version(conf)) .. ':' .. rkey
        else
          rkey = plugin_ctx_key(ctx, name_encode..'#'..plugin.conf_version(conf)) .. ':' .. rkey
        end
      else
        rkey = conf.group .. ':' .. rkey
      end

      limit_code, remaining, err_msg = process_limit(rkey, _limit, conf, ctx)
      pluginstate["remaining"][_i] = {limit_code, rkey, remaining, err_msg}
      if limit_code == MATCH_ERROR then
        if conf.bypass_error_limit ~= false then
          break
        end
        pluginstate:risks_mark(-1, limit_key, {rkey})
        return conf_status, conf_message
      end
      if remaining then
        if remaining < 0 then
          local denyid = _limit.key
          --local denyvalue = fix_str(rkey)..fix_str({_limit.count,_limit.window})
          local denyvalue = {rkey, {_limit.count,_limit.window}}
          pluginstate:risks_mark(_i, denyid, denyvalue)
          return conf_status, conf_message
        end
        if remaining_min < 0 then
          remaining_min = remaining
        else
          remaining_min = math_min(remaining, remaining_min)
        end
      end
    until true
  end

  pluginstate["remaining_min"] = remaining_min
  local show_resp_limit_header = conf.show_resp_limit_header
  if show_resp_limit_header == nil then show_resp_limit_header = md_conf.show_resp_limit_header end
  if remaining_min >= 0 and show_resp_limit_header then
    local header_name = conf.header_name or md_conf.header_name or DEFAULT_RESP_HEADER_LIMIT
    core.response.set_header(header_name, remaining_min)
  end
end


function _M.destroy()
  --lib_util.pkg_unload("edge.plugins."..plugin_name..".local")
  --lib_util.pkg_unload("edge.plugins."..plugin_name..".redis")
end


function _M.init()
  limit_local_new = require("edge.plugins."..plugin_name..".local").new
  limit_redis_new = require("edge.plugins."..plugin_name..".redis").new
end


return _M
