
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


local plugin_name = "admin_static_resources"


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


local function parse_multipart_file(req_body, content_type)
  -- 1. 提取 boundary (这里用纯文本查找 '=' 符号来截取)
  local _, boundary_start = string.find(content_type, "boundary=", 1, true)
  if not boundary_start then return nil, nil end
  local boundary = string.sub(content_type, boundary_start + 1)
  
  -- 2. 拼接实际的分隔符
  local delimiter = "--" .. boundary

  local file_data = nil
  local file_name = nil
  local search_pos = 1
  local req_body_len = #req_body

  -- 3. 循环查找分隔符，把 multipart 数据一块块切出来
  while search_pos <= req_body_len do
      -- 纯文本查找分隔符的位置
      local seg_start, seg_end = string.find(req_body, delimiter, search_pos, true)
      if not seg_start then break end

      -- 截取两个分隔符之间的内容块
      local part = string.sub(req_body, search_pos, seg_start - 1)
      
      -- 【核心修复】纯文本查找 'filename="' 的位置，绝对不碰 string.match
      local fname_tag = 'filename="'
      local fname_start, fname_end = string.find(part, fname_tag, 1, true)
      
      if fname_start then
          -- 找到了 filename="，接下来去找它后面的结束引号 "
          local quote_end = string.find(part, '"', fname_end + 1, true)
          if quote_end then
              -- 截取中间的文件名
              file_name = string.sub(part, fname_end + 1, quote_end - 1)
              
              -- 纯文本查找 header 和 body 的分隔符 \r\n\r\n
              local header_end = string.find(part, "\r\n\r\n", 1, true)
              if header_end then
                  -- 提取真正的文件数据（去掉末尾的 \r\n）
                  file_data = string.sub(part, header_end + 4, -3) 
                  break -- 找到文件后直接退出
              end
          end
      end

      search_pos = seg_end + 1 -- 移动指针，继续找下一个分隔符
  end

  return file_name, file_data
end

local function handle_upload()
  -- 已经通过 req_get_body() 和 ngx.req.get_headers() 拿到了以下两个变量：
  local req_body = req_get_body()
  local headers = ngx.req.get_headers()
  local content_type = headers["content-type"] or ""

  -- 调用封装好的函数进行解析
  local file_name, zip_data = parse_multipart_file(req_body, content_type)

  if not zip_data then
      -- 解析失败的处理
      return 400, { error_msg = "未在请求体中解析出有效的文件" }
  end

  local name = headers ["name"] or ""
  if not name or name == "" then
    return 400, { error_msg = "resource name is required" }
  end

  if string.find(name, "..", 1, true) or string.find(name, "/",1, true) or string.find(name, "'",1, true) then
    return 400, { error_msg = "invalid resource name" }
  end

  log_error("file_name=[" .. file_name .. "]")

  if not req_body or #req_body == 0 then
    return 400, { error_msg = "request body is empty" }
  end

  -- 获取 req_body 的大小（单位是字节 Byte）
  local body_size = #req_body
  local zip_size = #zip_data
  -- 打印出来看看（方便调试）
  log_error("body_size 大小为: ", body_size, " 字节")
  log_error("上传的 zip 文件大小为: ", zip_size, " 字节")

  local ok = is_valid_zip(zip_data)
  if not ok then
    log_error("it is not a valid zip data")
    return 400, { error_msg = "only zip files are supported" }
  end

  log_error("上传的 zip files are supported ")

  local dest_dir = STATIC_BASE_PATH .. "/" .. name

  -- save incoming zip data to temp file
  local zip_path, err = save_temp_zip(zip_data)
  if not zip_path then
    log_error("failed to save temp zip: ", err)
    return 500, { error_msg = "failed to save upload data" }
  end

  local resource_dir = build_resource_path(name)
  remove_directory(resource_dir)

  -- extract zip to resource directory
  local ok = extract_zip(zip_path, resource_dir)

  -- clean up temp file
  os.remove(zip_path)

  if not ok then
    log_error("failed to extract zip for resource: ", name)
    return 500, { error_msg = "failed to extract zip" }
  end

  log_info("static resource uploaded: ", name, " -> ", resource_dir)

  log_info("static resource uploaded: ", name, " -> ", dest_dir)

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
      uris = {"/edge/panshi/admin_static_resources"},
      handler = function()
        return handle_upload()
      end,
    },
    {
      methods = {"DELETE"},
      uris = {"/edge/panshi/admin_static_resources"},
      handler = function()
        return handle_delete()
      end,
    },
    {
      methods = {"GET"},
      uris = {"/edge/panshi/admin_static_resources"},
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
