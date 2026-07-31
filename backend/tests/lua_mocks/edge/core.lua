-- Mock of edge.core for unit testing static_resource.lua
-- Only the members used by static_resource.lua are provided.
local core = {}

core.log = {
    error = function() end,
    warn = function() end,
    info = function() end
}

core.table = {
    copy = function(t)
        local r = {}
        for k, v in pairs(t or {}) do r[k] = v end
        return r
    end
}

core.schema = {
    TYPE_CONSUMER = "consumer",
    merge = function(...)
        return {}
    end,
    check = function()
        return true
    end
}

core.request = {
    get_body = function()
        return ""
    end
}

return core
