
local require = require
local type = type
local next = next
local pcall = pcall
local error = error
local pairs = pairs
local ipairs = ipairs
local select = select
local assert = assert
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
local timers = require("edge.core.timers")
local resty_lock = require("resty.lock")
local expr_lib = require("resty.expr.v1")

local core_schema = core.schema
local core_time = core.time
local core_json = core.json
local core_lru = core.lrucache
local core_str = core.string
local core_tab = core.table
local core_ctx = core.ctx
local core_req = core.request
local core_resp = core.response
local core_vers = core.version
local log = core.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info

local schema_check = core_schema.check
local schema_merge = core_schema.merge
local expr_new = expr_lib.new
local time_fmt = core_time.fmt
local lru_new = core_lru.new
local str_len = string.len
local str_format = string.format
local str_has_prefix = core_str.has_prefix
local tab_new = core_tab.new
local tab_copy = core_tab.copy
local tab_clear = core_tab.clear
local tab_concat = core_tab.concat
local tab_insert = core_tab.insert
local tab_isarray = core_tab.isarray
local tab_arr_renew = core_tab.array_renew
local tab_arr_reset = core_tab.array_reset
local tab_try_read_attr = core_tab.try_read_attr
local tab_pool = core_tab.pool
local tab_pool_fetch = tab_pool.fetch
local tab_pool_release = tab_pool.release
local json_decode = core_json.decode
local json_encode = core_json.encode
local json_delay_encode = core_json.delay_encode
local json_stably_encode = core_json.stably_encode
local time_rotate_interval = core_time.rotate_interval
local util_file_path_info = core.io.file_path_info
local math_ceil = math.ceil
local math_floor = math.floor
local fix_num = core.fixnumber
local fix_str = core.fixstring
local fix_dk_str = core.fixdkstring
local core_get_hostname = core.get_hostname
local core_resolve_var = core.resolve_var
local core_resolve_jvar = core.resolve_jvar
local ctx_register_var = core_ctx.register_var
local ctx_register_phase_var = core_ctx.register_phase_var
local req_start_time = ngx.req.start_time
local req_get_method = ngx.req.get_method
local req_get_headers = ngx.req.get_headers
local req_read_body = core_req.read_body
local req_get_body_data = ngx.req.get_body_data
local req_get_body_file = ngx.req.get_body_file
local resp_get_headers = core_resp.get_headers
local resp_hold_headers = core_resp.hold_headers
local resp_hold_body_chunk = core_resp.hold_body_chunk
local timers_unregister_timer = timers.unregister_timer
local timers_register_timer = timers.register_timer
local io_open = io.open
local ngx_now = ngx.now
local ngx_time = ngx.time
local ngx_timer_at = ngx.timer.at
local ngx_update_time = ngx.update_time

local is_http = core.is_http



local function date_format_ms(fmt, ts)
  return time_fmt(fmt or "%Y%m%d%H%M%S", ".%03d", ts)
end
local function date_format_msec(ts)
  return date_format_ms("%Y%m%d%H%M%S", ts or ngx.time())
end



local plugin_name = "log_process"
local plugin_log_rotate_name = "log_rotate"


local lrucaches = {}
lrucaches.plugin = lru_new({ type = 'plugin', count = 1024, })

local default_rotate_attr
local default_attr
local default_logs
local default_caches
local default_caches1
local default_caches2


local DEFAULT_PROCESS_LOG_PATH = "logs/process.log"
local DEFAULT_ROTATE = 0
local DEFAULT_INTERVAL = "1h"
local DEFAULT_CACHE_TIME = 1

local DEFAULT_LOGS_MAX = 32
local DEFAULT_CACHE_ROTATE = 8
local DEFAULT_CACHE_LOGS_MAX = 512
local DEFAULT_CACHE_SIZE_MAX = 8*1024*1024

local FORMATS_SEP = "|;"
local FORMATS_MAX = 32
local FORMATS_DEF
if is_http then
FORMATS_DEF = {
  "${req_start_time#time_format,%Y%m%d%H%M%S,%03d}",
  "${http_x-edge-traceid}",
  "${clientip}",
  "${username}",
  "${deviceid}",
  "${udid}",
  "${cookie_JSESSIONID}",
  "${method}",
  "${uri}",
  "${req_args_string#limitn,2048}",
  "${http_referer}",
  "${http_cookie}",
  "${http_user-agent}",
  "${req_headers}",
  "${upstream_addr}",
  "${upstream_response_time#fixdefault,0,0}",
  "${request_time}",
  "${status}",
  "${route_id}",
  "${plugin_riskinfo}",
  "${plugin_riskid#fixdefault,,0}",
}
else
FORMATS_DEF = {
  "${host}",
  "${time_iso8601}",
  "${remote_addr}",
}
DEFAULT_PROCESS_LOG_PATH = "logs/process.stream.log"
end


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
  --rotate = DEFAULT_ROTATE,
}


local default_plugin_meta_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_meta = {
  --formats = FORMATS_DEF,
  formats_sep = FORMATS_SEP,
  rotate = DEFAULT_ROTATE,
  interval = DEFAULT_INTERVAL,
  cache_time = DEFAULT_CACHE_TIME,
}


local attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}


local item_schema = {
  type = "object",
  properties = {
    file = { type = "string", minLength = 1, pattern = [=[^[a-zA-Z0-9./_-]+$]=], },
    formats = {
      oneOf = {
        { type = "string", minLength = 1 },
        { type = "object", minProperties = 1 },
        { type = "array", minItems = 1, },
      },
      --default = FORMATS_DEF,
    },
    formats_json = { type = "boolean", },
    formats_sep = { type = "string", minLength = 0, },
    json = { type = "string", enum = {"cjson", "dkjson"}, },
    cache_time = { type = "integer", minimum = 0, maximum = 10, },
  },
  --required = {"file"},
}

local items_schema = tab_copy(item_schema)
items_schema.required = {"file"}

local metadata_schema = {
  type = "object",
  properties = {
    logs = {
      oneOf = {
        {
          type = "object", minProperties = 1, maxProperties = DEFAULT_LOGS_MAX,
          patternProperties = {
            [ item_schema.properties.file.pattern ] = item_schema,
          },
          additionalProperties = false,
          default = {
            [DEFAULT_PROCESS_LOG_PATH] = { formats = FORMATS_DEF, },
          },
        },
        {
          type = "array", minItems = 1, maxItems = DEFAULT_LOGS_MAX,
          items = items_schema,
          default = {
            { file = DEFAULT_PROCESS_LOG_PATH, formats = FORMATS_DEF, },
          },
        },
      },
      default = {
        --{ file = DEFAULT_PROCESS_LOG_PATH, formats = FORMATS_DEF, },
        [DEFAULT_PROCESS_LOG_PATH] = { formats = FORMATS_DEF, },
      },
    },
    formats_sep = { type = "string", minLength = 0, },
    json = { type = "string", enum = {"cjson", "dkjson"}, },
    cache_time = { type = "integer", minimum = 0, maximum = 10, },
  },
}


local schema = {
  type = "object",
  properties = {
    logs = {
      oneOf = {
        item_schema.properties.file,
        {
          type = "array", maxItems = DEFAULT_LOGS_MAX,
          items = item_schema.properties.file,
        },
      },
      default = DEFAULT_PROCESS_LOG_PATH,
    },
    entries = {
      oneOf = {
        { type = "string", minLength = 1 },
        { type = "object", minProperties = 1 },
        { type = "array", items = { type = "string", minLength = 1, pattern = [[^\S+$]], }, },
      },
    },
    formats = {
      oneOf = {
        { type = "string", minLength = 1 },
        { type = "object", minProperties = 1 },
        { type = "array", items = { type = "string", minLength = 1, pattern = [[^\S+$]], }, },
      },
      --default = FORMATS_DEF,
    },
    formats_sep = { type = "string", minLength = 0, },
    json = { type = "string", enum = {"cjson", "dkjson"}, },
    cache_time = { type = "integer", minimum = 0, maximum = 10, },
    include_req_body = { type = "boolean" },
    include_req_body_expr = { type="array", minItems=1, items={oneOf={{type="string"},{type="array"},},}, },
    include_resp_body = { type = "boolean" },
    include_resp_body_expr = { type="array", minItems=1, items={oneOf={{type="string"},{type="array"},},}, },
  },
}


local _M = plugin.new({
  version = "0.1",
  priority = 5200,
  name = plugin_name,
  schema = schema,
  --attr_schema = attr_schema,
  metadata_schema = metadata_schema,
  default_attr_schema = default_plugin_attr_schema,
  default_attr = default_plugin_attr,
  default_meta_schema = default_plugin_meta_schema,
  default_meta = default_plugin_meta,
  lrucaches = lrucaches,
  run_stream = true,
  run_unique = true,
})


local file_locks_name = "file_locks"


local function check_expr_schema(conf)
  if conf.include_req_body_expr then
    local ok, err = expr_new(conf.include_req_body_expr)
    if not ok then
      return nil, "failed to validate the 'include_req_body_expr' expression: " .. err
    end
  end
  if conf.include_resp_body_expr then
    local ok, err = expr_new(conf.include_resp_body_expr)
    if not ok then
      return nil, "failed to validate the 'include_resp_body_expr' expression: " .. err
    end
  end
  return true, nil
end
_M.check = check_expr_schema

--[[
function _M.check_schema(conf, schema_type)
  if schema_type == core_schema.TYPE_METADATA then
    return schema_check(metadata_schema, conf)
  end

  local ok, err = schema_check(schema, conf)
  if not ok then
    return nil, err
  end
  return check_expr_schema(conf)
end
--]]


--[[
local function rotate_attr_index(t, key)
  if type(key) ~= "string" then
    error("invalid argument, expect string value", 2)
  end

  local data_conf = t.data_conf
  if data_conf and data_conf ~= t and data_conf[key] ~= nil then
    return data_conf[key]
  end

  local attr_conf = t.attr_conf
  if attr_conf and attr_conf ~= t and attr_conf[key] ~= nil then
    return attr_conf[key]
  end

  local _default_attr = default_rotate_attr
  if _default_attr and _default_attr ~= t then
    local ttype = t["type"]
    if ttype then
      local default_type = _default_attr[ttype]
      if default_type and default_type ~= t and default_type[key] ~= nil then
        return default_type[key]
      end
    end
    if _default_attr[key] ~= nil then
      return _default_attr[key]
    end
  end

  return default_plugin_meta and default_plugin_meta[key]
end

local function init_rotate_attr(data_info, data_conf, attr_conf)
  local prefix = ngx.config.prefix()
  local logdir, logname, logext = util_file_path_info(data_conf.file, prefix)
  local _info
  if logname then
    local key = data_conf.id or data_conf.file
    data_info[key] = {
      ["type"] = key,
      name = logname,
      dir = logdir,
      ext = logext,
      file = logname .. logext,
      newfile = logname .. ".%s" .. logext,
      data_conf = data_conf or {},
      attr_conf = attr_conf or {},
    }
    setmetatable(data_info[key], { __index = rotate_attr_index })
    --default_caches[key] = tab_new(0, DEFAULT_CACHE_ROTATE)
  end
end
_M.init_rotate_attr = init_rotate_attr
--]]


local function rotate_log_time(file_log_info, now_time)
  local logtype = file_log_info["type"]
  local interval = file_log_info.interval
  local rotate_time = file_log_info.rotate_time
  local rotate_time_last = file_log_info.rotate_time_last
  local rotate_format = file_log_info.rotate_format
  local rotate_format_last = file_log_info.rotate_format_last

  if not rotate_time or not rotate_format then
    rotate_time, rotate_format = time_rotate_interval(interval, now_time)
    file_log_info.rotate_time = rotate_time
    file_log_info.rotate_format = rotate_format
    --log_info("[", logtype, "]first init rotate time is: ", rotate_time)
    return rotate_time, rotate_format
  end

  if rotate_time_last and now_time < rotate_time_last then
    return rotate_time_last or rotate_time, rotate_format_last or rotate_format
  end

  if now_time < rotate_time then
    return rotate_time, rotate_format
  end

  file_log_info.rotate_time_last = rotate_time
  file_log_info.rotate_format_last = rotate_format
  rotate_time, rotate_format = time_rotate_interval(interval, now_time)
  file_log_info.rotate_time = rotate_time
  file_log_info.rotate_format = rotate_format

  return rotate_time, rotate_format
end
_M.rotate_log_time = rotate_log_time


local function rotate_log_file(file_log_info, log_time)
  local logdir = file_log_info.dir
  local logfile

  if not file_log_info.file or not file_log_info.newfile then
    return
  end
  if file_log_info.rotate > 0 then
    logfile = str_format(file_log_info.newfile, log_time)
  else
    logfile = file_log_info.file
  end

  return logdir, logfile
end
_M.rotate_log_file = rotate_log_file


--[[
local function init_default_rotate_attr()
  if default_rotate_attr then
    return
  end

  local _rotate_attr = tab_new(0, DEFAULT_LOGS_MAX)
  local attr = plugin.plugin_attr(plugin_log_rotate_name)
  if attr and attr.enable ~= false then
    if attr and attr.logs then
      local logs = attr.logs
      local logn
      for _n, _log in pairs(logs) do
        if type(_log) == 'table' then
          logn = _log
          if not _log.file then
            logn = tab_copy(_log)
            logn.file = fix_str(_n)
          end
          init_rotate_attr(_rotate_attr, logn, attr)
          --if logn.file then
          --  init_rotate_attr(_rotate_attr, logn, attr)
          --end
        end
      end
    end
  end
  default_rotate_attr = _rotate_attr
end


local function init_default_logs()
  if default_logs then
    return
  end

  local _default_logs = tab_new(0, DEFAULT_LOGS_MAX)

  local metadata = plugin.plugin_metadata(_M.name)
  local attr = metadata and metadata.value
  if attr and attr.enable == false then
    default_logs = _default_logs
    return
  end

  if attr and attr.logs then
    local logs = attr.logs
    local logn
    for _n, _log in pairs(logs) do
      if type(_log) == 'table' then
        logn = _log
        if not _log.file then
          logn = tab_copy(_log)
          logn.file = fix_str(_n)
        end
        --init_rotate_attr(_default_logs, logn, default_rotate_attr[logn.file])
        init_rotate_attr(_default_logs, logn, attr)
      end
    end
  else
    init_rotate_attr(_default_logs, {file=DEFAULT_PROCESS_LOG_PATH}, attr)
  end

  default_logs = _default_logs
end
--]]


local function add_wrapped_attr(wrapped_conf, data_conf, attr_conf)
  local prefix = ngx.config.prefix()
  local logdir, logname, logext = util_file_path_info(data_conf.file, prefix)
  if logname then
    local key = data_conf.id or data_conf.file
    local val = {
      ["type"] = key,
      name = logname,
      dir = logdir,
      ext = logext,
      file = logname .. logext,
      newfile = logname .. ".%s" .. logext,
      data_conf = data_conf,
      attr_conf = attr_conf,
    }
    wrapped_conf[key] = val
  end
end

function _M.init_wrapped_attr(wrapped_conf, raw_conf)
  local log_rotate_attr = plugin.plugin_attr(plugin_log_rotate_name)
  if log_rotate_attr and log_rotate_attr.logs then
    local logs = log_rotate_attr.logs
    local logn
    for _n, _log in pairs(logs) do
      if type(_log) == 'table' then
        logn = _log
        if not _log.file then
          logn = tab_copy(_log)
          logn.file = fix_str(_n)
        end
        add_wrapped_attr(wrapped_conf, logn, log_rotate_attr)
      end
    end
  end
  return true
end


local function add_wrapped_meta(wrapped_conf, data_conf, attr_conf)
  add_wrapped_attr(wrapped_conf, data_conf, attr_conf)
end

function _M.init_wrapped_meta(wrapped_conf, raw_conf)
  if raw_conf and raw_conf.logs then
    local logs = raw_conf.logs
    local logn
    for _n, _log in pairs(logs) do
      if type(_log) == 'table' then
        logn = _log
        if not _log.file then
          logn = tab_copy(_log)
          logn.file = fix_str(_n)
        end
        add_wrapped_meta(wrapped_conf, logn)
      end
    end
  else
    add_wrapped_meta(wrapped_conf, {file=DEFAULT_PROCESS_LOG_PATH})
  end
  return true
end


local function init_default_caches()
  if not default_caches then
    default_caches1 = tab_new(0, DEFAULT_LOGS_MAX)
    default_caches2 = tab_new(0, DEFAULT_LOGS_MAX)
    default_caches = default_caches1
  end
end


local function req_body_expr_match(conf, ctx)
  if not conf.include_req_body_expr then
    return true
  end

  if not conf._req_body_expr then
    local req_body_expr, err = expr_new(conf.include_req_body_expr)
    if not req_body_expr then
      log_error('generate req_body_expr err: ' .. err)
      return
    end
    conf._req_body_expr = req_body_expr
  end

  --local pluginstate = plugin.state.fetch(_M.name, ctx)
  local ctx_state = ctx_var["plugin_state"] or {}
  local pluginstate = ctx_state[_M.name]
  --local pluginstate = _M.state(ctx)
  if pluginstate["req_body_expr_eval_result"] == nil then
    pluginstate["req_body_expr_eval_result"] = conf._req_body_expr:eval(ctx)
  end
  local match_result = pluginstate["req_body_expr_eval_result"]

  return match_result
end


local function resp_body_expr_match(conf, ctx)
  if not conf.include_resp_body_expr then
    return true
  end

  if not conf._resp_body_expr then
    local resp_body_expr, err = expr_new(conf.include_resp_body_expr)
    if not resp_body_expr then
      log_error('generate resp_body_expr err: ' .. err)
      return
    end
    conf._resp_body_expr = resp_body_expr
  end

  --local pluginstate = plugin.state.fetch(_M.name, ctx)
  local ctx_state = ctx_var["plugin_state"] or {}
  local pluginstate = ctx_state[_M.name]
  if pluginstate["resp_body_expr_eval_result"] == nil then
    pluginstate["resp_body_expr_eval_result"] = conf._resp_body_expr:eval(ctx)
  end
  local match_result = pluginstate["resp_body_expr_eval_result"]

  return match_result
end



local _log_newline = "\n"
local function log_write_file(log_conf, log_time, log_message)
  local logmsgs = log_message

  if type(logmsgs) == 'table' then
    if #logmsgs <= 0 then
      return
    end
  else
    logmsgs = {logmsgs}
  end

  --log_info("log_write_file: ", fix_str(log_time), ", rotate: ", log_conf.rotate)

  --[[
  local logdir = log_conf.dir
  local logfile
  if not log_conf.file or not log_conf.newfile then
    return
  end
  if log_conf.rotate > 0 then
    logfile = str_format(log_conf.newfile, log_time)
  else
    logfile = log_conf.file
  end
  --]]
  local logdir, logfile = rotate_log_file(log_conf, log_time)
  if not logdir or not logfile then
    return
  end

  local lock, name_err = resty_lock:new(file_locks_name)
  if not lock then
    log_error("failed to create lock: [", file_locks_name ,"] ", name_err)
    return nil, name_err
  end

  --local lock_ok, lock_err = lock:lock(logdir..logfile)
  local pcall_lock_ok, lock_ok, lock_err = pcall(lock.lock, lock, logdir..logfile)
  if not pcall_lock_ok then
    lock_err = lock_ok
    lock_ok = nil
  end
  if not lock_ok then
    --log_error("failed to lock: ", lock_err)
    --return nil, lock_err
  end

  local file, err = io_open(logdir..logfile, 'ab')
  if not file then
    lock:unlock()
    log_error("failed to open file: ", logfile, ", error info: ", err)
    return
  end

  for _, _msg in ipairs(logmsgs) do
    local ok, err = file:write(fix_str(_msg), _log_newline)
    if not ok then
      log_error("failed to write file: ", logfile, ", error info: ", err)
    end
  end

  file:flush()
  file:close()

  lock:unlock()
  return true
end


local _last_time_caches = tab_new(DEFAULT_CACHE_ROTATE, 0)
local function log_cache_timer(premature)
  local _default_logs = _M.wrapped_meta
  local log_conf, log_cache
  if not default_caches or not _default_logs then
    return
  end

  local _default_caches = default_caches
  if default_caches == default_caches1 then
    default_caches = default_caches2
  else
    default_caches = default_caches1
  end

  for _type, _caches in pairs(_default_caches) do
    log_conf = _default_logs[_type]
    if type(log_conf) == 'table' then
      log_cache = _default_caches[_type]
      if type(log_cache) == 'table' then
        tab_clear(_last_time_caches)
        for _time, _logs in pairs(log_cache) do
          log_write_file(log_conf, _time, _logs)
          tab_clear(_logs)
          if _time ~= log_conf.rotate_format_last and _time ~= log_conf.rotate_format then
            tab_insert(_last_time_caches, _time)
          end
        end
        if #_last_time_caches > 0 then
          for _i, _t in ipairs(_last_time_caches) do
            log_cache[_t] = nil
          end
        end
        tab_clear(_last_time_caches)
      end
    end
  end
end


local _log_newline_size = str_len(_log_newline)
local function log_cache_size()
  local _default_logs = _M.wrapped_meta
  if not default_caches or not _default_logs then
    return 0
  end

  local cache_size = 0
  for _type, _caches in pairs(default_caches) do
    if type(_caches) == 'table' then
      for _time, _logs in pairs(_caches) do
        if _logs.size then
          cache_size = cache_size + _logs.size
        else
          for _i, _msg in ipairs(_logs) do
            cache_size = cache_size + str_len(_msg) + _log_newline_size
          end
          _logs.size = cache_size
        end
      end
    end
  end
  return cache_size
end


local function log_cache_file(log_conf, log_time, log_message)
  local log_type = log_conf["type"]
  local log_cache = default_caches[log_type]
  if not log_cache then
    log_cache = tab_new(0, DEFAULT_CACHE_ROTATE)
    default_caches[log_type] = log_cache
  end
  if not log_cache[log_time] then
    log_cache[log_time] = tab_new(DEFAULT_CACHE_LOGS_MAX, 0)
  end
  local log_time_cache = log_cache[log_time]

  tab_insert(log_time_cache, log_message)
  log_time_cache.size = (log_time_cache.size or 0) + log_message:len() + _log_newline_size

  local cache_size = log_cache_size()
  if cache_size > DEFAULT_CACHE_SIZE_MAX then
    log_cache_timer(true)
  end
  return true
end


local function log_default_detail(conf, ctx)
  local var = ctx.var
  local url = var.scheme .. "://" .. var.host .. ":" .. var.server_port .. var.request_uri
  local matched_route = ctx.matched_route and ctx.matched_route.value
  local service_id
  local route_id

  if matched_route then
    service_id = matched_route.service_id or ""
    route_id = matched_route.id
  else
    service_id = var.host
  end

  local consumer
  if ctx.consumer then
    consumer = {
      username = ctx.consumer.username
    }
  end

  local now_time = req_start_time()
  local detail =  {
    request = {
      method = var.method or req_get_method(),
      headers = var.req_headers or req_get_headers(0),
      url = url,
      scheme = var.scheme,
      host = var.host,
      port = var.server_port,
      request_uri = var.request_uri,
      uri = var.uri,
      is_args = var.is_args,
      args = var.args,
      --uri_args = ngx.req.get_uri_args(),
      size = var.request_length
    },
    response = {
      status = ngx.status,
      headers = var.ups_resp_headers or resp_get_headers(0),
      size = var.bytes_sent
    },
    server = {
      hostname = core_get_hostname(),
      version = core_vers.VERSION
    },
    remote_addr = var.remote_addr or '',
    upstream = var.upstream_addr,
    service_id = service_id,
    route_id = route_id,
    consumer = consumer,
    request_time_ms = math_ceil(fix_num(var.request_time, 0) * 1000),
    upstream_time_ms = math_ceil(fix_num(var.upstream_response_time, 0) * 1000),
    start_time = now_time,
    --start_time_ms = math_floor(now_time * 1000),
    start_time_fmt = date_format_msec(now_time),
    traceid = var.traceid,
  }

  if ctx.ups_resp_body then
    detail.response.body = ctx.ups_resp_body
  end

  if conf.include_req_body then
    if req_body_expr_match(conf, ctx) then
      local body = req_get_body_data()
      if body then
        detail.request.body = body
      else
        local body_file = req_get_body_file()
        if body_file then
          detail.request.body_file = body_file
        end
      end
    end
  end

  return detail
end


local function log_entries_detail(conf, ctx)
  local entries = conf.entries

  local detail
  if type(entries) ~= 'table' then
    detail = fix_str(entries)
    return detail
  end

  if tab_isarray(entries) then
    local t = tab_new(#entries, 0)
    --local fixstring_fun = conf.json == "dkjson" and fix_dk_str or fix_str
    local fixstring_fun = fix_str
    if conf.json == "dkjson" then
      fixstring_fun = fix_dk_str
    end
    for i, entry in ipairs(entries) do
      t[i] = fixstring_fun(entry)
    end
    detail = tab_concat(t, _log_newline)
  else
    --local json = conf.json == "dkjson" and dkjson or cjson
    local json_encode_fun = json_encode
    if conf.json == "dkjson" then
      json_encode_fun = json_stably_encode
    end
    detail = json_encode_fun(entries)
  end
  return detail
end

local format_prefix_keep_origin_tag = "__keep_origin__"
local format_prefix_keep_format_tag = "__keep_string__"
local function _log_formats_detail(formats, json_encode_fun, ctx)
  local detail
  if type(formats) ~= 'table' then
    if type(formats) == 'string' then
      if str_has_prefix(formats, format_prefix_keep_origin_tag) then
        detail = formats:sub(format_prefix_keep_origin_tag:len()+1)
      else
        detail = core_resolve_jvar(fix_str(formats), ctx)
      end
      --if detail ~= formats and type(detail) == 'string' then
      if type(detail) == 'string' then
        if str_has_prefix(detail, format_prefix_keep_format_tag) then
          detail = detail:sub(format_prefix_keep_format_tag:len()+1)
        else
          local detail_tmp = json_decode(detail)
          if detail_tmp then
            detail = detail_tmp
          end
        end
      end
      return detail
    else
      return formats
    end
  end

  local formats_detail_tmp = {}
  for _k, _format in pairs(formats) do
    formats_detail_tmp[_k] = _log_formats_detail(_format, json_encode_fun, ctx)
  end
  --detail = json_encode_fun(formats_detail_tmp)
  detail = formats_detail_tmp
  return detail
end


--local _formats_detail = tab_new(FORMATS_MAX, 0)
local TABLEPOOL_LOG_FORMATS_DETAIL_TAG = "tablepool_log_formats_detail"
local function table_log_formats_detail_new()
  --tab_clear(_formats_detail)
  --return _formats_detail
  return tab_pool_fetch(TABLEPOOL_LOG_FORMATS_DETAIL_TAG, FORMATS_MAX, 0)
end
local function table_log_formats_detail_release(t)
  tab_pool_release(TABLEPOOL_LOG_FORMATS_DETAIL_TAG, t)
end

local function log_formats_detail(log_conf, conf, ctx)
  local formats = conf.formats or log_conf.formats
  local formats_sep = conf.formats_sep or log_conf.formats_sep
  local formats_json = conf.formats_json
  if formats_json == nil then
    formats_json = log_conf.formats_json
  end

  local detail
  if type(formats) ~= 'table' then
    if formats_json then
      detail = core_resolve_jvar(fix_str(formats), ctx)
    else
      detail = core_resolve_var(fix_str(formats), ctx)
    end
    return detail
  end

  local conf_json = conf.json or log_conf.json
  --local _json = conf_json == "dkjson" and dkjson or cjson
  local json_encode_fun = json_encode
  if conf_json == "dkjson" then
    json_encode_fun = json_stably_encode
  end
  if not formats_json and tab_isarray(formats) then
    --detail = ctx.var["log_process_default"]
    --detail = ctx.var["log_process_detail"]
    ---[[
    local formats_detail = table_log_formats_detail_new()
    tab_arr_reset(formats_detail, formats, function(_i, _format)
    --local formats_detail = tab_arr_renew(formats, function(_i, _format)
      local log_format
      if type(_format) == 'string' then
        if str_has_prefix(_format, format_prefix_keep_origin_tag) then
          log_format = _format:sub(format_prefix_keep_origin_tag:len()+1)
        else
          log_format = core_resolve_var(fix_str(_format), ctx)
        end
        if type(log_format) == 'string' then
          if str_has_prefix(log_format, format_prefix_keep_format_tag) then
            log_format = log_format:sub(format_prefix_keep_format_tag:len()+1)
          end
        end
      else
        if formats_json then
          log_format = core_resolve_jvar(fix_str(_format), ctx)
        else
          log_format = _log_formats_detail(_format, json_encode_fun, ctx)
        end
      end
      return fix_str(log_format)
    end)
    detail = tab_concat(formats_detail, formats_sep)
    table_log_formats_detail_release(formats_detail)
    --]]
  else
    detail = _log_formats_detail(formats, json_encode_fun, ctx)
  end
  return detail
end


function _M.rewrite(conf, ctx)
  if conf.include_req_body then
    if req_body_expr_match(conf, ctx) then
      --ngx.req.read_body()
      req_read_body(ctx)
    end
  end
end


function _M.header_filter(conf, ctx)
  if conf.include_resp_body and not ctx.ups_resp_body then
    if resp_body_expr_match(conf, ctx) then
      resp_hold_headers(ctx)
    end
  end
end


function _M.body_filter(conf, ctx)
  if conf.include_resp_body and not ctx.ups_resp_body then
    if resp_body_expr_match(conf, ctx) then
      if not resp_hold_body_chunk(true, ctx) then
        return
      end
    end
  end
end


function _M.log(conf, ctx)
  --init_default_logs()
  local _default_logs = _M.wrapped_meta

  local now_time = req_start_time()
  local log_detail
  local log_conf, log_time, log_format
  local conf_cachetime, conf_json, fixstring_fun

  if now_time == 0 then
    now_time = ngx_now()
  end
  local logs = conf.logs or conf.files or {}
  if type(logs) ~= "table" then
    logs = {logs}
  end
  for _, _log in pairs(logs) do
    repeat
      log_conf = _default_logs[_log]
      if not log_conf then
        log_warn("not found log_conf: ", _log)
        --init_rotate_attr(_default_logs, {file=_log}, default_rotate_attr[_log])
        add_wrapped_meta(wrapped_conf, {file=_log})
        log_conf = _default_logs[_log]
      end
      if not log_conf then
        break
      end

      if conf.entries then
        log_detail = log_entries_detail(conf, ctx)
      elseif conf.formats or log_conf.formats then
        log_detail = log_formats_detail(log_conf, conf, ctx)
      else
        log_detail = log_default_detail(conf, ctx)
        if not log_detail.route_id then
          log_detail.route_id = "no-matched"
        end
      end

      log_time, log_format = rotate_log_time(log_conf, now_time)
      conf_cachetime = conf.cache_time or log_conf.cache_time or DEFAULT_CACHE_TIME
      conf_json = conf.json or log_conf.json
      --fixstring_fun = conf_json == "dkjson" and fix_dk_str or fix_str
      fixstring_fun = fix_str
      if conf_json == "dkjson" then
        fixstring_fun = fix_dk_str
      end
      if conf_cachetime > 0 then
        log_cache_file(log_conf, log_format, fixstring_fun(log_detail))
      else
        log_write_file(log_conf, log_format, fixstring_fun(log_detail))
      end
    until true
  end
end


function _M.destroy()
  timers_unregister_timer("plugin#".._M.name)
  log_cache_timer(true)
end


function _M.init()
  --init_default_rotate_attr()
  init_default_caches()

  ctx_register_phase_var("log_process_default", "log", function(ctx)
    return log_default_detail({}, ctx)
  end)
  ctx_register_phase_var("log_process_detail", "log", function(ctx)
    local ctx_var = ctx.var or {}
    local now_time = req_start_time()
    local log_detail = {
      date_format_msec(now_time),
      fix_str(ctx_var["http_x-edge-traceid"]),
      fix_str(ctx_var["username"]),
      fix_str(ctx_var["clientip"]),
      fix_str(ctx_var["deviceid"]),
      fix_str(ctx_var["udid"]),
      fix_str(ctx_var["cookie_JSESSIONID"]),
      fix_str(ctx_var["method"]),
      fix_str(ctx_var["uri"]),
      fix_str(ctx_var["req_args_string"]):sub(1,2048),
      --fix_str(ctx_var["http_X-Rip"]),
      --fix_str(ctx_var["http_referer"]),
      --fix_str(ctx_var["http_cookie"]),
      --fix_str(ctx_var["http_user-agent"]),
      --fix_str(ctx_var["http_X-Via"]),
      --fix_str(ctx_var["http_X-Cdn-Src-Port"]),
      --fix_str(ctx_var["http_X-Client-Ip-City"]),
      fix_str(ctx_var["req_headers"]),
      fix_str(ctx_var["upstream_addr"]),
      fix_str(ctx_var["upstream_response_time"] or "0"),
      fix_str(ctx_var["request_time"]),
      fix_str(ctx_var["status"]),
      fix_str(ctx_var["route_id"]),
      fix_str(ctx_var["plugin_riskinfo"]),
      fix_str(ctx_var["plugin_riskid"] or "0"),
    }
    return tab_concat(log_detail, "|;")
  end)

  timers_register_timer("plugin#".._M.name, log_cache_timer)
end


return _M
