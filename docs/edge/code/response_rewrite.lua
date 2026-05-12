
local require = require
local type = type
local pcall = pcall
local error = error
local pairs = pairs
local ipairs = ipairs
local select = select
local assert = assert
local unpack = unpack
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
local expr_lib = require("resty.expr.v1")
local re_compile = require("resty.core.regex").re_match_compile
local lib_util = core.lib_util
local lib_utils = core.lib_utils
local lrucache_lib = lib_util.lrucache

local core_schema = core.schema
local schema_merge = core_schema.merge
local json = lib_util.json
local cjson = lib_util.cjson
local util_str = lib_util.string
local util_tab = lib_util.table
local utils_resp = lib_utils.resp
local fix_str = lib_util.fixstring

local str_sub = util_str.sub
local str_gsub = util_str.gsub
local str_find = util_str.find
local tab_pool = util_tab.pool
local tab_new = util_tab.new
local tab_copy = util_tab.copy
local tab_clear = util_tab.clear
local tab_insert = util_tab.insert
local tab_concat = util_tab.concat
local re_sub = ngx.re.sub
local re_gsub = ngx.re.gsub
local re_find = util_str.re_find
local re_find_nth = util_str.re_find_nth
local resp_add_header = utils_resp.add_header
local resp_set_header = utils_resp.set_header

local log = lib_util.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info



local plugin_name = "response_rewrite"


local lrucaches = {}


local default_attr
local default_meta
local default_data
local default_dict


local DEFAULT_PLUGIN_KEYS_MAX = 8
local DEFAULT_PLUGIN_KEY_PREFIX = ""
local DEFAULT_PLUGIN_KEY = "${uri}"
local DEFAULT_PLUGIN_STATUS = 200
local DEFAULT_PLUGIN_MESSAGE = "Your request is not allowed."
local DEFAULT_PLUGIN_HEADER_NAME = "X-Edge-Resp-Rewrite-By"


local default_plugin_attr_schema = {
  type = "object",
  properties = {
  },
  --required = {},
}
local default_plugin_attr = {
  --key_prefix = DEFAULT_PLUGIN_KEY_PREFIX,
  --key = DEFAULT_PLUGIN_KEY,
  --status = DEFAULT_PLUGIN_STATUS,
  --message = DEFAULT_PLUGIN_MESSAGE,

  header_name = DEFAULT_PLUGIN_HEADER_NAME,
}


local expr_schema = tab_copy(core_schema.expr_schema)
local page_method = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "CONNECT", "TRACE", "PURGE"}
local page_method_pattern = tab_concat(page_method, [[|]])
page_method_pattern = "^"..page_method_pattern.."$"


local regex_schema = {
  type = "array", minItems = 1,
  items = {
    type = "array", minItems = 2, maxItems = 4,
    items = {
      { type = "string", minLength = 1, }, -- regex
      { type = "string", }, -- replace
      { type = "integer", }, -- count
      { type = "string", }, -- opts
    },
  },
}

local headers_schema = {
  type = "object",
  patternProperties = {
    [ [=[^.+$]=] ] = {
      oneOf = {
        { type = "number" },
        { type = "string" },
        { type = "array", minItems = 3, maxItems = 5,
          items = {
            { type = "string", },
            { type = "string", minLength = 1, },
            { type = "string", },
            { type = "integer", },
            { type = "string", },
          },
        },
        { type = "array", minItems = 2, maxItems = 2,
          items = {
            { type = "string", },
            regex_schema,
          },
        },
        regex_schema,
      }
    }
  },
  additionalProperties = false,
}

local _schema = {
  type = "object",
  properties = {
    status = { type = "integer", minimum = 200, maximum = 599, },
    add_headers = headers_schema,
    headers = headers_schema,
    body = {
      oneOf = {
        { type = "string" },
        { type = "array" },
        { type = "object" },
      },
    },
    regex_body = regex_schema,
    plain_text = { type = "boolean", },
  },
}

local metadata_schema = schema_merge({
  type = "object",
  properties = {
  },
}, { _schema })

local schema = schema_merge({
  type = "object",
  properties = {
    include_add_headers_expr = expr_schema,
    include_headers_expr = expr_schema,
    include_body_expr = expr_schema,
  },
  patternProperties = {
    [ page_method_pattern ] = _schema,
  },
}, { _schema })
--[[
local schema = tab_copy(_schema)
schema.properties.include_body_expr = {
  type="array", minItems=1, items={oneOf={{type="string"},{type="array"},},},
}
schema.patternProperties = {
  [ page_method_pattern ] = _schema,
}


local _M = {
  version = 0.1,
  priority = 5899,
  name = plugin_name,
  schema = schema,
}
--]]


local _M = plugin.new({
  version = 0.1,
  priority = 5899,
  name = plugin_name,
  schema = schema,
  --metadata_schema = metadata_schema,
  --attr_schema = attr_schema,
  default_attr_schema = default_plugin_attr_schema,
  default_attr = default_plugin_attr,
  lrucaches = lrucaches,
})


local function check(conf)
  local conf_method = { conf }
  for _i, _method in ipairs(page_method) do
    if conf[_method] then
      tab_insert(conf_method, conf[_method])
    end
  end

  for _i, _conf in ipairs(conf_method) do
    local _headers = {_conf.add_headers, _conf.headers}
    for _, _headers_i in ipairs(_headers) do
      if _headers_i then
        for field, value in pairs(_headers_i) do
          if type(field) ~= 'string' then
            return false, 'invalid type as header field'
          end

          if type(value) == 'table' then
            if type(value[1]) == 'table' then
              for _, filter in ipairs(value) do
                local ok, err = pcall(re_compile, filter[1], "jo")
                if not ok then
                  return false, "invalid regex_header("..field..", "..filter[1].."): " .. err
                end
              end
            elseif type(value[2]) == 'table' then
              for _, filter in ipairs(value[2]) do
                local ok, err = pcall(re_compile, filter[1], "jo")
                if not ok then
                  return false, "invalid regex_header("..field..", "..filter[1].."): " .. err
                end
              end
            else
              local ok, err = pcall(re_compile, value[2], "jo")
              if not ok then
                return false, "invalid regex_header("..field..", ".. value[2].."): " .. err
              end
            end

          elseif type(value) ~= 'string' and type(value) ~= 'number' then
            return false, 'invalid type as header value'
          end

          if #field == 0 then
            return false, 'invalid field length in header'
          end

          if not lib_utils.validate_header_field(field) then
            return false, 'invalid field character in header'
          end

          if type(value) == 'string' and not lib_utils.validate_header_value(value) then
            return false, 'invalid value character in header'
          end
        end
      end
    end

    if _conf.regex_body then
      for _, filter in ipairs(_conf.regex_body) do
        local ok, err = pcall(re_compile, filter[1], "jo")
        if not ok then
          return false, "invalid regex_body("..filter[1].."): "  .. err
        end
      end
    end

    if _conf.include_add_headers_expr then
      local ok, err = expr_lib.new(_conf.include_add_headers_expr)
      if not ok then
        return false, "invalid include_add_headers_expr expression: " .. err
      end
    end
    if _conf.include_headers_expr then
      local ok, err = expr_lib.new(_conf.include_headers_expr)
      if not ok then
        return false, "invalid include_headers_expr expression: " .. err
      end
    end
    if _conf.include_body_expr then
      local ok, err = expr_lib.new(_conf.include_body_expr)
      if not ok then
        return false, "invalid include_body_expr expression: " .. err
      end
    end

  end

  return true
end
_M.check = check
--_M.metadata_check = check


local function conf_expr_match(expr_name, conf, ctx)
  local ctx_var = ctx.var or {}
  local method = ctx_var.method
  local conf_method = conf[method] or conf
  local conf_expr = conf_method[expr_name] --or conf[expr_name]

  if not conf_expr then
    return true
  end

  local _expr_name = "_"..expr_name
  if not conf_method[_expr_name] then
    local _expr, _ = expr_lib.new(conf_expr)
    conf_method[_expr_name] = _expr
  end

  local match_result = conf_method[_expr_name]:eval(ctx)

  return match_result
end
local function add_headers_expr_match(conf, ctx)
  return conf_expr_match("include_add_headers_expr", conf, ctx)
end
local function headers_expr_match(conf, ctx)
  return conf_expr_match("include_headers_expr", conf, ctx)
end
local function body_expr_match(conf, ctx)
  return conf_expr_match("include_body_expr", conf, ctx)
end
--[[
local function body_expr_match(conf, ctx)
  local ctx_var = ctx.var or {}
  local method = ctx_var.method
  local conf_method = conf[method] or conf

  if not conf.include_body_expr then
    return true
  end

  if not conf._body_expr then
    local body_expr, _ = expr_lib.new(conf.include_body_expr)
    conf._body_expr = body_expr
  end

  --local pluginstate = plugin.state.fetch(_M.name, ctx)
  --if pluginstate["body_expr_eval_result"] == nil then
  --  pluginstate["body_expr_eval_result"] = conf._body_expr:eval(ctx)
  --end
  --local match_result = pluginstate["body_expr_eval_result"]
  local match_result = conf._body_expr:eval(ctx)

  return match_result
end
--]]


do
local function _regex_sub_body(body, regs, ctx)
  if not body then return end
  if type(regs) ~= 'table' then return body end
  if type(regs[1]) ~= 'table' then return body end

  local _body = body
  local replace, n, err
  for _, filter in ipairs(regs) do
    replace = ngx_resolve_vars(filter[2], ctx)
    if filter[3] == nil then
      _body, n, err = re_sub(_body, filter[1], replace, filter[4] or "jo")
    elseif filter[3] > 0 then
      for i = 1, filter[3] do
        _body, n, err = re_sub(_body, filter[1], replace, filter[4] or "jo")
      end
    elseif filter[3] < 0 then
      local from, to
      local nth = -filter[3]
      from, to, err = re_find_nth(_body, filter[1], filter[4] or "jo", nth)
      if from and to and (not err) then
        _body = str_sub(_body,1,from-1) .. replace .. str_sub(_body,to+1)
      end
    else
      _body, n, err = re_gsub(_body, filter[1], replace, filter[4] or "jo")
    end
    if err ~= nil then
      log_error("regex("..filter[1]..") substitutes failed:" .. err)
    end
  end
  return _body
end


function _M.header_filter(conf, ctx)
  local ctx_var = ctx.var or {}
  local method = ctx_var.method
  local conf_method = conf[method] or conf
  local conf_body = conf_method.body --or conf.body
  local conf_regex_body = conf_method.regex_body --or conf.regex_body

  if _M.name == plugin_name then
    ctx.response_rewrite_body_matched = body_expr_match(conf, ctx)
    if ctx.response_rewrite_body_matched then
      if conf_body or conf_regex_body then
        utils_resp.hold_headers(ctx)
        utils_resp.clear_header_as_body_modified()
      end
    end
  end

  local conf_status = conf_method.status --or conf.status
  local conf_headers = conf_method.headers --or conf.headers
  local conf_add_headers = conf_method.add_headers --or conf.add_headers
  if conf_status then
    utils_resp.hold_headers(ctx)
  elseif conf_add_headers or conf_headers then
    utils_resp.hold_headers(ctx)
  else
    return
  end

  if conf_status then
    ngx.status = conf_status
  end

  if (not conf_headers) and (not conf_add_headers) then
    return
  end

  local ctx_var = ctx.var or {}
  local resp_headers = ctx_var["resp_headers"] or {}

  local newvalue

  if conf_add_headers and add_headers_expr_match(conf, ctx) then
    for field, value in pairs(conf_add_headers) do
      if type(value) == 'table' then
        if type(value[1]) == 'table' then
          if resp_headers[field] then
            newvalue = _regex_sub_body(resp_headers[field], value, ctx)
            resp_add_header(field, newvalue)
          end
        else
          local repvalue
          if value[1] == "" then
            repvalue = resp_headers[field]
          else
            repvalue = ngx_resolve_var(value[1], ctx)
          end
          if repvalue then
            local regs
            if type(value[2]) == 'table' then
              regs = value[2]
            else
              regs = {{value[2], value[3], value[4], value[5]}}
            end
            --local regs = {{value[2], value[3], value[4], value[5]}}
            newvalue = _regex_sub_body(repvalue, regs, ctx)
            resp_add_header(field, newvalue)
          end
        end
      else
        newvalue = ngx_resolve_var(fixString(value), ctx)
        resp_add_header(field, newvalue)
      end
    end
  end

  if conf_headers and headers_expr_match(conf, ctx) then
    for field, value in pairs(conf_headers) do
      if type(value) == 'table' then
        if type(value[1]) == 'table' then
          if resp_headers[field] then
            newvalue = _regex_sub_body(resp_headers[field], value, ctx)
            resp_set_header(field, newvalue)
          end
        else
          local repvalue
          if value[1] == "" then
            repvalue = resp_headers[field]
          else
            repvalue = ngx_resolve_var(value[1], ctx)
          end
          if repvalue then
            local regs
            if type(value[2]) == 'table' then
              regs = value[2]
            else
              regs = {{value[2], value[3], value[4], value[5]}}
            end
            --local regs = {{value[2], value[3], value[4], value[5]}}
            newvalue = _regex_sub_body(repvalue, regs, ctx)
            resp_set_header(field, newvalue)
          end
        end
      else
        newvalue = ngx_resolve_var(fixString(value), ctx)
        resp_set_header(field, newvalue)
      end
    end
  end

end


function _M.body_filter(conf, ctx)
  if _M.name ~= plugin_name then return end
  if not ctx.response_rewrite_body_matched then return end

  local ctx_var = ctx.var or {}
  local method = ctx_var.method
  local conf_method = conf[method] or conf
  local conf_body = conf_method.body --or conf.body
  local conf_regex_body = conf_method.regex_body --or conf.regex_body

  if not conf_body and not conf_regex_body then
    return
  end

  if not utils_resp.hold_body_chunk(false, ctx) then
    return
  end

  local body, n, err
  if conf_body then
    body = conf_body
    local conf_plain_text = conf_method.plain_text
    --if conf_plain_text == nil then
    --  conf_plain_text = conf.plain_text
    --end
    if not conf_plain_text then
      body = ngx_resolve_vars(body, ctx)
    end
  else
    body = ctx_var["ups_resp_body"]
  end

  if body and conf_regex_body then
    body = fixString(body)
    body = _regex_sub_body(body, conf_regex_body, ctx)
  end

  body = fixString(body)
  ctx.resp_body = body
  ngx.arg[1] = body
end
end  -- do


return _M
