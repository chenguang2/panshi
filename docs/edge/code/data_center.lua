
local require = require
local type = type
local next = next
local pcall = pcall
local error = error
local pairs = pairs
local ipairs = ipairs
local assert = assert
local select = select
local unpack = unpack
local tostring = tostring
local tonumber = tonumber
local loadstring = loadstring
local getmetatable = getmetatable
local setmetatable = setmetatable
local collectgarbage = collectgarbage
local package = package
local string = string
local table = table
local math = math
local io = io
local os = os
local bit = bit
local ngx = ngx

local core = require("edge.core")
local plugin = require("edge.plugin")

local config_local = core.config_local
local core_schema = core.schema
local core_lru = core.lrucache
local core_tab = core.table
local core_req = core.request

local schema_check = core_schema.check
local schema_merge = core_schema.merge
local tab_copy = core_tab.copy
local req_get_body = core_req.get_body

local ngx_subsystem = ngx.config.subsystem
local is_http = ngx_subsystem == "http"

local log = core.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info



local plugin_name = "data_center"
local plugin_pre_process_name = "pre_process"
local common, common_worksite


local lrucaches = {}
lrucaches.plugin = core_lru.new({ type = 'plugin', })
lrucaches.redis = core_lru.new({ ttl = 30, count = 4096, invalid_stale = true, })


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
}

local default_plugin_meta_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_meta = {
}


local attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}


local _schema = {
  type = "object",
  properties = {
  },
}

local metadata_schema = schema_merge({
  type = "object",
  properties = {
  },
  --required = {},
}, { _schema })

local schema = schema_merge({
  type = "object",
  properties = {
  },
  --required = {},
}, { _schema })


local _M = plugin.new({
  version = 0.1,
  priority = 0,
  name = plugin_name,
  schema = schema,
  attr_schema = attr_schema,
  metadata_schema = metadata_schema,
  default_attr_schema = default_plugin_attr_schema,
  default_attr = default_plugin_attr,
  default_meta_schema = default_plugin_meta_schema,
  default_meta = default_plugin_meta,
  lrucaches = lrucaches,
  run_stream = true,
  run_unique = true,
})


local function get_plugin_names()
  local http_plugin_names
  local stream_plugin_names

  local local_conf, err = config_local.local_conf()
  if not local_conf then
    error("failed to load the configuration file: " .. err)
  end

  http_plugin_names = local_conf.plugins
  stream_plugin_names = local_conf.stream_plugins

  if not is_http then
    return stream_plugin_names
  end

  return http_plugin_names
end


local function check_plugins_schema(conf)
  local schema_type = core_schema.TYPE_METADATA

  local plugin_names  = get_plugin_names()
  local plugin_obj
  local ok, err, _conf
  for _i, _name in pairs(plugin_names) do
    repeat
      if _name == _M.name then
        break
      end
      plugin_obj = plugin.plugins_hash[_name]
      if plugin_obj then
        --if schema_type == core_schema.TYPE_METADATA then
        if plugin_obj.metadata_schema then
          _conf = tab_copy(conf)
          if type(_conf[_name]) == 'table' then
            ok, err = plugin_obj.check_schema(_conf[_name], schema_type)
            if not ok then
              return nil, "{" .. _name .. "[" .. _name .. "]} " .. err
            end
          end
          ok, err = plugin_obj.check_schema(_conf, schema_type)
          if not ok then
            return nil, "{" .. _name .. "} " .. err
          end
        end
        --end
      end
    until true
  end
  return true
end
_M.metadata_check = check_plugins_schema


--[[
function _M.check_schema(conf, schema_type)
  if schema_type == core_schema.TYPE_METADATA then
    local ok, err = core_schema.check(metadata_schema, conf)
    if not ok then
      return nil, err
    end
    return check_plugins_schema(conf, schema_type)
  end

  local ok, err = core_schema.check(schema, conf)
  if not ok then
    return nil, err
  end
  return true
end
--]]


if is_http then

local function args_encode()
  local req_body = req_get_body()
  local encoded = ngx_password_encode(req_body)
  ngx.header.content_type = "text/plain"
  return 200, encoded
end

local function args_decode()
  local req_body = req_get_body()
  local decoded = ngx_password_decode(req_body)
  ngx.header.content_type = "text/plain"
  return 200, decoded
end

local config_update = require("edge.core.config_update")
function _M.control_api()
  return {
    {
      methods = {"GET", "POST"},
      uris = {"/config/*"},
      handler = config_update.update,
    },
    {
      methods = {"POST"},
      uris = {"/edge/args/encode"},
      handler = args_encode,
    },
    {
      methods = {"POST"},
      uris = {"/edge/args/decode"},
      handler = args_decode,
    },
  }
end

end --if is_http then


function _M.destroy()

end


function _M.init()

end


return _M
