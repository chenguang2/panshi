local zip_utils = require("lib.zip_utils")
local cjson = require("cjson.safe")

local handler = {}

local STATIC_BASE_DIR = "/data/edge/static"

function handler.put(name)
    ngx.req.read_body()
    local zip_data = ngx.req.get_body_data()
    if not zip_data or #zip_data == 0 then
        ngx.status = 400
        ngx.say(cjson.encode({ error_msg = "empty request body" }))
        return
    end

    local ok, err = zip_utils.is_zip(zip_data)
    if not ok then
        ngx.status = 400
        ngx.say(cjson.encode({ error_msg = err }))
        return
    end

    local dest_dir = STATIC_BASE_DIR .. "/" .. name
    local ok2, err2 = zip_utils.extract_all(zip_data, dest_dir)
    if not ok2 then
        ngx.status = 500
        ngx.say(cjson.encode({ error_msg = err2 }))
        return
    end

    local files = zip_utils.list_files(zip_data)
    local total_size = 0
    if files then
        for _, f in ipairs(files) do
            total_size = total_size + (f.size or 0)
        end
    end

    ngx.status = 200
    ngx.say(cjson.encode({
        message = "static resource uploaded and extracted",
        name = name,
        path = dest_dir,
        file_count = files and #files or 0,
        total_size = total_size,
    }))
end

return handler
