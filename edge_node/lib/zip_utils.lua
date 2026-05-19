local inflate = require("lib.inflate")
local zip_utils = {}

local ZIP_HEADER = string.char(0x50, 0x4B, 0x03, 0x04)


function zip_utils.is_zip(data)
    if not data or #data == 0 then
        return false, "empty data"
    end
    if #data < 4 then
        return false, "data too short for ZIP signature"
    end
    if string.sub(data, 1, 4) ~= ZIP_HEADER then
        return false, "invalid ZIP signature"
    end
    local ok, err = pcall(inflate.new, data)
    if not ok then
        return false, "invalid ZIP structure: " .. tostring(err)
    end
    return true
end


function zip_utils.list_files(data, prefix)
    local ok, err = zip_utils.is_zip(data)
    if not ok then
        return nil, err
    end
    local ok2, stream = pcall(inflate.new, data)
    if not ok2 then
        return nil, tostring(stream)
    end
    local files = {}
    for name, offset, size, packed, crc in stream:files() do
        if not prefix or name:find(prefix, 1, true) == 1 then
            files[#files + 1] = {
                name = name,
                size = size,
                compression_method = packed and 8 or 0,
                crc = crc,
            }
        end
    end
    return files
end


function zip_utils.extract_file(data, filepath)
    local ok, err = zip_utils.is_zip(data)
    if not ok then
        return nil, err
    end
    local ok2, stream = pcall(inflate.new, data)
    if not ok2 then
        return nil, tostring(stream)
    end
    for name, offset, size, packed, crc in stream:files() do
        if name == filepath then
            if packed then
                local ok3, result = pcall(function()
                    return stream:inflate(offset, crc)
                end)
                if not ok3 then
                    return nil, tostring(result)
                end
                return result
            end
            return stream:extract(offset, size)
        end
    end
    return nil, 'file "' .. filepath .. '" not found in archive'
end


local function ensure_dir(dirpath)
    if dirpath and #dirpath > 0 then
        os.execute('mkdir -p ' .. dirpath)
    end
end


local function safe_filename(name)
    if name:find("..") then
        return nil, "path traversal detected in filename: " .. name
    end
    if name:find("'") then
        return nil, "invalid character in filename: " .. name
    end
    return name
end


function zip_utils.extract_all(data, dest_dir)
    if not dest_dir or #dest_dir == 0 then
        return nil, "destination directory is required"
    end
    if dest_dir:sub(-1) ~= "/" then
        dest_dir = dest_dir .. "/"
    end
    local ok, err = zip_utils.is_zip(data)
    if not ok then
        return nil, err
    end
    local ok2, stream = pcall(inflate.new, data)
    if not ok2 then
        return nil, tostring(stream)
    end
    ensure_dir(dest_dir)
    for name, offset, size, packed, crc in stream:files() do
        local safe_name, name_err = safe_filename(name)
        if not safe_name then
            return nil, name_err
        end
        local fullpath = dest_dir .. safe_name
        if safe_name:sub(-1) == "/" then
            ensure_dir(fullpath)
        else
            local slash = safe_name:find("/[^/]*$")
            if slash then
                ensure_dir(dest_dir .. safe_name:sub(1, slash - 1))
            end
            local content
            if packed then
                local ok3, result = pcall(function()
                    return stream:inflate(offset, crc)
                end)
                if not ok3 then
                    return nil, "failed to inflate " .. safe_name .. ": " .. tostring(result)
                end
                content = result
            else
                content = stream:extract(offset, size)
            end
            if content then
                local fh, ferr = io.open(fullpath, "wb")
                if not fh then
                    return nil, "failed to write " .. fullpath .. ": " .. tostring(ferr)
                end
                fh:write(content)
                fh:close()
            end
        end
    end
    return true
end


function zip_utils.extract_selected(data, dest_dir, path_list)
    if not path_list or #path_list == 0 then
        return nil, "file list is empty"
    end
    local targets = {}
    for _, p in ipairs(path_list) do
        targets[p] = true
    end
    if not dest_dir or #dest_dir == 0 then
        return nil, "destination directory is required"
    end
    if dest_dir:sub(-1) ~= "/" then
        dest_dir = dest_dir .. "/"
    end
    local ok, err = zip_utils.is_zip(data)
    if not ok then
        return nil, err
    end
    local ok2, stream = pcall(inflate.new, data)
    if not ok2 then
        return nil, tostring(stream)
    end
    ensure_dir(dest_dir)
    for name, offset, size, packed, crc in stream:files() do
        if targets[name] then
            local content
            if packed then
                local ok3, result = pcall(function()
                    return stream:inflate(offset, crc)
                end)
                if not ok3 then
                    return nil, "failed to inflate " .. name .. ": " .. tostring(result)
                end
                content = result
            else
                content = stream:extract(offset, size)
            end
            if content then
                local slash = name:find("/[^/]*$")
                if slash then
                    ensure_dir(dest_dir .. name:sub(1, slash - 1))
                end
                local fh, ferr = io.open(dest_dir .. name, "wb")
                if not fh then
                    return nil, "failed to write " .. dest_dir .. name .. ": " .. tostring(ferr)
                end
                fh:write(content)
                fh:close()
                targets[name] = nil
            end
        end
    end
    local missing = {}
    for p, _ in pairs(targets) do
        missing[#missing + 1] = p
    end
    if #missing > 0 then
        return nil, "files not found in archive: " .. table.concat(missing, ", ")
    end
    return true
end

return zip_utils
