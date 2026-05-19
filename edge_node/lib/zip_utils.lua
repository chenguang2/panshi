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
                    return nil, "CRC32 checksum mismatch"
                end
                return result
            end
            return stream:extract(offset, size)
        end
    end
    return nil, 'file "' .. filepath .. '" not found in archive'
end

function zip_utils.extract_all(data, dest_dir)
    if not dest_dir or #dest_dir == 0 then
        return nil, "destination directory is required"
    end
    if string.sub(dest_dir, -1) ~= "/" then
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
    for name, offset, size, packed, crc in stream:files() do
        local slash_pos = 0
        for i = #name, 1, -1 do
            if string.byte(name, i) == 47 then
                slash_pos = i
                break
            end
        end
        if slash_pos > 0 then
            os.execute('mkdir -p "' .. dest_dir .. string.sub(name, 1, slash_pos) .. '"')
        end
        local content
        if packed then
            local ok3, result = pcall(function()
                return stream:inflate(offset, crc)
            end)
            if not ok3 then
                return nil, "CRC32 checksum mismatch for " .. name
            end
            content = result
        else
            content = stream:extract(offset, size)
        end
        if content then
            local fh, ferr = io.open(dest_dir .. name, "wb")
            if not fh then
                return nil, "failed to write " .. dest_dir .. name .. ": " .. tostring(ferr)
            end
            fh:write(content)
            fh:close()
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
    if string.sub(dest_dir, -1) ~= "/" then
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
    for name, offset, size, packed, crc in stream:files() do
        if targets[name] then
            local content
            if packed then
                local ok3, result = pcall(function()
                    return stream:inflate(offset, crc)
                end)
                if not ok3 then
                    return nil, "CRC32 checksum mismatch for " .. name
                end
                content = result
            else
                content = stream:extract(offset, size)
            end
            if content then
                local slash_pos = 0
                for i = #name, 1, -1 do
                    if string.byte(name, i) == 47 then
                        slash_pos = i
                        break
                    end
                end
                if slash_pos > 0 then
                    os.execute('mkdir -p "' .. dest_dir .. string.sub(name, 1, slash_pos) .. '"')
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
