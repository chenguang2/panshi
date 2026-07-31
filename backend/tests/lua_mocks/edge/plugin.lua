-- Mock of edge.plugin for unit testing static_resource.lua
-- plugin.new() returns a table carrying the opts; the plugin file then
-- attaches check_schema/access/etc. onto it, exactly like the real framework.
local plugin = {}

function plugin.new(opts)
    local _M = {}
    for k, v in pairs(opts or {}) do
        _M[k] = v
    end
    return _M
end

return plugin
