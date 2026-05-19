
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

local core_req = core.request

local req_get_body = core_req.get_body

local log = core.log
local log_error = log.error
local log_warn = log.warn
local log_info = log.info


local plugin_name = "static_resource"


local STATIC_BASE_PATH = "/work/jboss/data/edge/static"

-- zip magic bytes: PK\x03\x04
local ZIP_MAGIC_BYTES = string.char(0x50, 0x4B, 0x03, 0x04)


local function shell_quote(path)
  return "'" .. string.gsub(path, "'", "'\\''") .. "'"
end


local function ensure_directory(dirpath)
  local cmd = "mkdir -p " .. shell_quote(dirpath)
  local ok = os.execute(cmd)
  if not ok then
    log_error("failed to create directory: ", dirpath)
  end
  return ok
end


local function remove_directory(dirpath)
  local cmd = "rm -rf " .. shell_quote(dirpath)
  os.execute(cmd)
end


local function is_directory_empty(dirpath)
  local q = shell_quote(dirpath)
  local handle = io.popen("ls -1A " .. q .. " 2>/dev/null")
  if not handle then
    return true
  end
  local count = 0
  for _ in handle:lines() do
    count = count + 1
    if count > 0 then
      break
    end
  end
  handle:close()
  return count == 0
end


local function extract_zip(zip_path, target_dir)
  if not ensure_directory(target_dir) then
    return nil, "failed to create target directory"
  end
  local q_zip = shell_quote(zip_path)
  local q_dir = shell_quote(target_dir)
  local cmd = "unzip -o " .. q_zip .. " -d " .. q_dir .. " 2>/dev/null"
  local ok = os.execute(cmd)
  if not ok then
    return nil, "unzip command failed"
  end
  os.execute("chmod -R 755 " .. q_dir)
  return true
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


local function is_valid_zip(data)
  if #data < 4 then
    return false
  end
  return string.sub(data, 1, 4) == ZIP_MAGIC_BYTES
end


local function handle_upload(name)
  if not name or name == "" then
    return 400, { error_msg = "resource name is required" }
  end

  if string.find(name, "..") or string.find(name, "/") or string.find(name, "'") then
    return 400, { error_msg = "invalid resource name" }
  end

  local req_body = req_get_body()
  if not req_body or req_body == "" then
    return 400, { error_msg = "request body is empty" }
  end

  if not is_valid_zip(req_body) then
    return 400, { error_msg = "only zip files are supported" }
  end

  local zip_path, err = save_temp_zip(req_body)
  if not zip_path then
    log_error("failed to save temp zip: ", err)
    return 500, { error_msg = "failed to save upload data" }
  end

  local resource_dir = build_resource_path(name)
  remove_directory(resource_dir)

  local ok, ex_err = extract_zip(zip_path, resource_dir)

  os.remove(zip_path)

  if not ok then
    log_error("failed to extract zip for resource: ", name, ", error: ", ex_err or "unknown")
    return 500, { error_msg = "failed to extract zip" }
  end

  if is_directory_empty(resource_dir) then
    log_warn("extracted zip for resource ", name, " produced empty directory")
    remove_directory(resource_dir)
    return 400, { error_msg = "zip archive is empty" }
  end

  log_info("static resource uploaded: ", name, " -> ", resource_dir)

  return 200, {
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
    return 400, { error_msg = "resource name is required" }
  end

  local resource_dir = build_resource_path(name)
  remove_directory(resource_dir)

  log_info("static resource deleted: ", name)

  return 200, {
    action = "delete",
    node = {
      key = build_resource_key(name),
      value = nil,
    },
  }
end


local function list_directory(dirpath)
  local entries = {}
  local q = shell_quote(dirpath)
  local handle = io.popen("ls -1A " .. q .. " 2>/dev/null")
  if handle then
    for name in handle:lines() do
      if name and name ~= "" then
        table.insert(entries, {
          id = name,
          dir = build_resource_path(name),
        })
      end
    end
    handle:close()
  end
  return entries
end


local function handle_list()
  local resources = list_directory(STATIC_BASE_PATH)

  return 200, {
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
  priority = 9090,
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
      uris = {"/edge/panshi/static_resources/*"},
      handler = function(params)
        local name = params.name
        return handle_upload(name)
      end,
    },
    {
      methods = {"DELETE"},
      uris = {"/edge/panshi/static_resources/*"},
      handler = function(params)
        local name = params.name
        return handle_delete(name)
      end,
    },
    {
      methods = {"GET"},
      uris = {"/edge/panshi/static_resources"},
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
