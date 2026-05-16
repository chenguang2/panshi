
local require = require
local type = type
local next = next
local pcall = pcall
local error = error
local pairs = pairs
local ipairs = ipairs
local assert = assert
local select = select
local tostring = tostring
local tonumber = tonumber
local getmetatable = getmetatable
local setmetatable = setmetatable
local string = string
local table = table
local math = math
local io = io
local os = os
local ngx = ngx

local core = require("edge.core")
local plugin = require("edge.plugin")

local config_local = core.config_local
local core_req = core.request
local core_tab = core.table

local req_get_body = core_req.get_body
local tab_copy = core_tab.copy

local log = core.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info


local plugin_name = "static_resource"


local STATIC_BASE_PATH = "/data/edge/static"


local function ensure_directory(dirpath)
  local ok, err = os.rename(dirpath, dirpath)
  if not ok then
    local mkdir_cmd = "mkdir -p " .. dirpath
    os.execute(mkdir_cmd)
  end
end


local function remove_directory(dirpath)
  os.execute("rm -rf " .. dirpath)
end


local function extract_zip(zip_path, target_dir)
  ensure_directory(target_dir)
  local cmd = "unzip -o " .. zip_path .. " -d " .. target_dir .. " 2>/dev/null"
  local ok = os.execute(cmd)
  if ok then
    os.execute("chmod -R 755 " .. target_dir)
  end
  return ok
end


local function build_resource_key(name)
  return "/static_resources/" .. name
end


local function build_resource_path(name)
  return STATIC_BASE_PATH .. "/" .. name
end


local function save_temp_zip(data)
  local tmp_path = "/tmp/edge_static_upload_" .. tostring(ngx.time()) .. "_" .. tostring(math.random(10000, 99999)) .. ".zip"
  local f, err = io.open(tmp_path, "wb")
  if not f then
    return nil, err
  end
  f:write(data)
  f:close()
  return tmp_path
end


local function handle_upload(name)
  if not name or name == "" then
    ngx.status = 400
    return { error_msg = "resource name is required" }
  end

  if string.find(name, "..") or string.find(name, "/") then
    ngx.status = 400
    return { error_msg = "invalid resource name" }
  end

  local req_body = req_get_body()
  if not req_body or req_body == "" then
    ngx.status = 400
    return { error_msg = "request body is empty" }
  end

  -- save incoming zip data to temp file
  local zip_path, err = save_temp_zip(req_body)
  if not zip_path then
    log_error("failed to save temp zip: ", err)
    ngx.status = 500
    return { error_msg = "failed to save upload data" }
  end

  local resource_dir = build_resource_path(name)
  remove_directory(resource_dir)

  -- extract zip to resource directory
  local ok = extract_zip(zip_path, resource_dir)

  -- clean up temp file
  os.remove(zip_path)

  if not ok then
    log_error("failed to extract zip for resource: ", name)
    ngx.status = 500
    return { error_msg = "failed to extract zip" }
  end

  log_info("static resource uploaded: ", name, " -> ", resource_dir)

  return {
    action = "set",
    node = {
      key = build_resource_key(name),
      value = {
        id = name,
        dir = resource_dir,
        update_time = ngx.time(),
      },
    },
  }
end


local function handle_delete(name)
  if not name or name == "" then
    ngx.status = 400
    return { error_msg = "resource name is required" }
  end

  local resource_dir = build_resource_path(name)
  remove_directory(resource_dir)

  log_info("static resource deleted: ", name)

  return {
    action = "delete",
    node = {
      key = build_resource_key(name),
      value = nil,
    },
  }
end


local function handle_list()
  local resources = {}
  local handle = io.popen("ls -1 " .. STATIC_BASE_PATH .. " 2>/dev/null")
  if handle then
    for name in handle:lines() do
      if name and name ~= "" then
        table.insert(resources, {
          id = name,
          dir = build_resource_path(name),
        })
      end
    end
    handle:close()
  end

  return {
    node = {
      dir = true,
      nodes = resources,
    },
  }
end


local schema = {
  type = "object",
  properties = {
    base_path = { type = "string" },
  },
}

local default_attr_schema = {
  type = "object",
  properties = {
    base_path = { type = "string" },
  },
}

local default_attr = {
  base_path = STATIC_BASE_PATH,
}


local _M = plugin.new({
  version = 0.1,
  priority = 0,
  name = plugin_name,
  schema = schema,
  attr_schema = default_attr_schema,
  default_attr_schema = default_attr_schema,
  default_attr = default_attr,
})


function _M.control_api()
  return {
    {
      methods = {"PUT"},
      uris = {"/edge/admin/static_resources/*"},
      handler = function(params)
        local name = params.name
        return handle_upload(name)
      end,
    },
    {
      methods = {"DELETE"},
      uris = {"/edge/admin/static_resources/*"},
      handler = function(params)
        local name = params.name
        return handle_delete(name)
      end,
    },
    {
      methods = {"GET"},
      uris = {"/edge/admin/static_resources"},
      handler = function()
        return handle_list()
      end,
    },
  }
end


function _M.destroy()

end


function _M.init()

end


return _M
