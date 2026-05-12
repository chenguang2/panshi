
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
local edge_upstream = require("edge.upstream")
local ipmatcher = require("resty.ipmatcher")
local roundrobin = require("resty.roundrobin")
local expr_lib = require("resty.expr.v1")

local core_resolver = core.resolver
local core_schema = core.schema
local core_json = core.json
local core_lru = core.lrucache
local core_str = core.string
local core_tab = core.table
local core_parse_addr = core.parse_addr
local log = core.log
local log_error = log.error
local log_info = log.info
local log_warn = log.warn

local schema_check = core_schema.check
local schema_merge = core_schema.merge
local expr_new = expr_lib.new
local lru_new = core_lru.new
local str_find = core_str.find
local str_find_plain = core_str.find_plain
local tab_copy = core_tab.copy
local tab_insert = table.insert
local tab_isarray = core_tab.isarray
local tab_try_read_attr = core_tab.try_read_attr
local tab_pool = core_tab.pool
local tab_pool_fetch = tab_pool.fetch
local tab_pool_release = tab_pool.release
local json_decode = core_json.decode
local json_encode = core_json.encode
local json_delay_encode = core_json.delay_encode
local json_stably_encode = core_json.stably_encode




local plugin_name = "traffic_split"


local lrucaches = {}
lrucaches.plugin = lru_new({ type = 'plugin', serial_creating = true, })
lrucaches.ups = lru_new({ ttl = 0, count = 1024, })


local DEFAULT_UPSTREAM_WEIGHT = 1


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
  --key = DEFAULT_PLUGIN_KEY,
  --status = DEFAULT_PLUGIN_STATUS,
  --message = DEFAULT_PLUGIN_MESSAGE,
}


local default_plugin_meta_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_meta = {
  --key = DEFAULT_PLUGIN_KEY,
  --status = DEFAULT_PLUGIN_STATUS,
  --message = DEFAULT_PLUGIN_MESSAGE,
}


local attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}


local expr_schema = {
  type = "array",
  minItems = 1,
  items = {
    oneOf = {
      { type = "string" },
      { type = "array" },
    },
  },
}

local upstreams_schema = {
  type = "array",
  items = {
    type = "object",
    properties = {
      upstream_id = core_schema.id_schema,
      upstream = core_schema.upstream,
      weight = { type = "integer", minimum = 0, } --default = DEFAULT_UPSTREAM_WEIGHT
    }
  },
  minItems = 1,
  maxItems = 32,
}

local _schema = {
  type = "object",
  properties = {
    splits = {
      type = "array",
      items = {
        type = "object",
        properties = {
          ups_expr = expr_schema,
          upstreams = upstreams_schema
        },
      },
    },
  },
}

local metadata_schema = schema_merge({
  type = "object",
  properties = {
  },
}, { })

local schema = schema_merge({
  type = "object",
  properties = {
  },
}, { _schema })




local _M = plugin.new({
  version = 0.1,
  priority = 5990,
  name = plugin_name,
  schema = schema,
  --metadata_schema = metadata_schema,
  run_stream = true,
  run_unique = true,
})


local function check_list_schema(conf)
  if conf.splits then
    for _, _split in ipairs(conf.splits) do
      if _split.ups_expr then
        local ok, err = expr_new(_split.ups_expr)
        if not ok then
          return false, "failed to validate the 'ups_expr' expression: " .. err
        end
      end
    end
  end
  return true
end
_M.check = check_list_schema


local function parse_domain_for_node(node)
  local host = node.host
  if not ipmatcher.parse_ipv4(host) and not ipmatcher.parse_ipv6(host) then
    node.domain = host

    local ip, err = core_resolver:parse_domain(host)
    if ip then
      node.host = ip
    end

    if err then
      log_error("dns resolver domain: ", host, " error: ", err)
    end
  end
end


local function set_upstream(upstream_info, ctx)
  local nodes = upstream_info.nodes
  local new_nodes = {}

  if tab_isarray(nodes) then
    for _, node in ipairs(nodes) do
      parse_domain_for_node(node)
      tab_insert(new_nodes, node)
    end
  else
    for addr, weight in pairs(nodes) do
      local node = {}
      local port, host
      host, port = core_parse_addr(addr)
      node.host = host
      parse_domain_for_node(node)
      node.port = port
      node.weight = weight
      tab_insert(new_nodes, node)
    end
  end

  local up_conf = {
    name = upstream_info.name,
    type = upstream_info.type,
    hash_on = upstream_info.hash_on,
    pass_host = upstream_info.pass_host,
    upstream_host = upstream_info.upstream_host,
    key = upstream_info.key,
    nodes = new_nodes,
    timeout = upstream_info.timeout,
    scheme = upstream_info.scheme,
  }

  local ok, err = edge_upstream.check_schema(up_conf)
  if not ok then
    log_error("failed to validate generated upstream: ", err)
    return 500, err
  end

  local matched_route = ctx.matched_route
  up_conf.parent = matched_route

  local upstream_key = up_conf.type .. "#route_" ..  matched_route.value.id .. "_" .. upstream_info.vid
  if upstream_info.node_tid then
    upstream_key = upstream_key .. "_" .. upstream_info.node_tid
  end

  --log_info("upstream_key: ", upstream_key)
  edge_upstream.set(ctx, upstream_key, ctx.conf_version, up_conf)

  if upstream_info.scheme == "https" then
    edge_upstream.set_scheme(ctx, up_conf)
  end
end


local function new_rr_obj(upstreams)
  local server_list = {}

  for i, upstream_obj in ipairs(upstreams) do
    if upstream_obj.upstream_id then
      server_list[upstream_obj.upstream_id] = upstream_obj.weight or DEFAULT_UPSTREAM_WEIGHT
    elseif upstream_obj.upstream then
      upstream_obj.upstream.vid = i
      local node_tid = tostring(upstream_obj.upstream.nodes):sub(#"table: " + 1)
      upstream_obj.upstream.node_tid = node_tid
      server_list[upstream_obj.upstream] = upstream_obj.weight or DEFAULT_UPSTREAM_WEIGHT
    else
      upstream_obj.upstream = "plugin#upstream#is#empty"
      server_list[upstream_obj.upstream] = upstream_obj.weight or DEFAULT_UPSTREAM_WEIGHT
    end
  end

  return roundrobin:new(server_list)
end


local function vars_expr_match(ups, conf, ctx)
  local pluginstate = _M.state(ctx)
  --local md_conf = _M.meta or {}

  local conf_ups_expr = ups.ups_expr
  if not conf_ups_expr then
    return nil
  end

  local ex, ok, err, exv
  if ctx then
    ex, err = lrucaches.plugin(conf_ups_expr, plugin.conf_version(conf), expr_new, conf_ups_expr)
  else
    if not ups._ups_expr then
      local vars_expr, err = expr_new(conf_ups_expr)
      ups._ups_expr = vars_expr
    end
    ex = ups._ups_expr
  end
  if not ex then
    log_warn("failed to get the 'vars' expression: ", err , " plugin_name: ", _M.name)
    return false
  end

  ok, err, exv = ex:eval(plugin.state_ctx(_M.name, ctx))
  if err then
    log_warn("failed to run the 'vars' expression: ", err, " plugin_name: ", _M.name)
    return false
  end
  return ok, exv
end


function _M.access(conf, ctx)
  local pluginstate = _M.state(ctx)
  --local md_conf = _M.meta or {}

  if not conf or not conf.splits then
    return
  end

  local upstreams
  local match_passed = true

  for _, _split in ipairs(conf.splits) do
    if _split.upstreams then
      for _, _ups in ipairs(_split.upstreams) do
        local ups_id = _ups.upstream_id
        if ups_id then
          local ups = edge_upstream.get_by_id(ups_id)
          if not ups then
            return 500, "failed to fetch upstream info by upstream id: " .. ups_id
          end
        end
      end
    end

    if not _split.ups_expr then
      match_passed = true
      upstreams = _split.upstreams
      break
    end

    match_passed = vars_expr_match(_split, conf, ctx)

    if match_passed then
      upstreams = _split.upstreams
      break
    end
  end

  --log_info("match_passed: ", match_passed)
  if not match_passed then
    return
  end

  if not upstreams then
    return
  end

  local rr_up, err = lrucaches.ups(upstreams, nil, new_rr_obj, upstreams)
  if not rr_up then
    log_error("lrucache roundrobin failed: ", err)
    return 500
  end

  local upstream = rr_up:find()
  if upstream and type(upstream) == 'table' then
    --log_info("upstream: ", json_encode(upstream))
    return set_upstream(upstream, ctx)
  elseif upstream and upstream ~= "plugin#upstream#is#empty" then
    ctx.upstream_id = upstream
    --log_info("upstream_id: ", upstream)
    return
  end

  ctx.upstream_id = nil
  --log_info("route_up: ", upstream)
  return
end


function _M.init()
end


return _M
