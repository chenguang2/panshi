
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
local lrucache_lib = lib_util.lrucache
local plugin_ctx = lrucache_lib.plugin_ctx
local plugin_ctx_key = lrucache_lib.plugin_ctx_key

local core_schema = core.schema
local schema_merge = core_schema.merge
local json = lib_util.json
local cjson = lib_util.cjson
local core_str = core.string
local core_tab = core.table
local util_str = lib_util.string
local util_tab = lib_util.table

local str_find = util_str.find
local tab_pool = util_tab.pool
local tab_new = util_tab.new



local plugin_name = "pre_functions"


local lrucaches = {}
lrucaches.plugin = lrucache_lib.new({ type = 'plugin', count = 1024, })
--lrucaches.funcs = lrucache_lib.new({ type = 'plugin', count = 4096, })


local default_attr
local default_meta
local default_data


local DEFAULT_FUNCTIONS_KEY = "function"
local DEFAULT_FUNCTIONS_STATUS = 403

local phases = {
  "preread",
  "rewrite",
  "access",
  "before_proxy",
  "header_filter",
  "body_filter",
  "log",
}
local phases_regex = util_tab.concat(phases, "|")
phases_regex = "^(?:"..phases_regex..")$"


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
  --key = DEFAULT_FUNCTIONS_KEY,
  --status = DEFAULT_FUNCTIONS_STATUS,
}



local schema = {
  type = "object",
  patternProperties = {
    [ phases_regex ] = {
      type = "array",
      items = {type = "string"},
      minItems = 1
    },
  },
  minProperties = 1,
  additionalProperties = false,
}


local _M = plugin.new({
  version = 0.1,
  priority = 9999,
  name = plugin_name,
  schema = schema,
  --metadata_schema = metadata_schema,
  --attr_schema = attr_schema,
  default_attr_schema = default_plugin_attr_schema,
  default_attr = default_plugin_attr,
  lrucaches = lrucaches,
  run_stream = true,
})


local function load_funcs(functions)
  local funcs = tab_new(#functions, 0)

  local index = 1
  for _, func_str in ipairs(functions) do
    local _, func = pcall(loadstring(func_str))
    funcs[index] = func
    index = index + 1
  end

  return funcs
end


local function call_funcs(phase, conf, ctx)
  if not conf[phase] then
    return
  end

  local functions
  if lrucaches.funcs then
    functions = plugin_ctx(lrucaches.funcs, ctx, phase, load_funcs, conf[phase])
  else
    if not conf._funcs then
      conf._funcs = tab_new(0,8)
    end
    if not conf._funcs[phase] then
      conf._funcs[phase] = load_funcs(conf[phase])
    end
    functions = conf._funcs[phase]
  end
  if not functions then return end

  for _, func in ipairs(functions) do
    local code, body = func(conf, ctx)
    if code or body then
      return code, body
    end
  end
end


function _M.check(conf)
  for _, _phase in ipairs(phases) do
    if conf[_phase] then
      local functions = conf[_phase]
      for _, func_str in ipairs(functions) do
        local func, err = loadstring(func_str)
        if err then
          return false, 'failed to loadstring: ' .. err
        end

        local ok, ret = pcall(func)
        if not ok then
          return false, 'pcall error: ' .. ret
        end
        if type(ret) ~= 'function' then
          return false, 'only accept Lua function, the input code type is ' .. type(ret)
        end
      end
    end
  end

  return true
end


for _, phase in ipairs(phases) do
  _M[phase] = function (conf, ctx)
    return call_funcs(phase, conf, ctx)
  end
end


return _M

