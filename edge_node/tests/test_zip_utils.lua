package.path = package.path .. ";../lib/?.lua"
local zip_utils = require("zip_utils")

local function read_file(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

local pass = 0
local fail = 0

local function assert_eq(got, expected, msg)
    if got == expected then
        pass = pass + 1
    else
        fail = fail + 1
        io.stderr:write(string.format("FAIL: %s (got: %s, expected: %s)\n", msg, tostring(got), tostring(expected)))
    end
end

local function assert_nil(got, msg)
    if got == nil then
        pass = pass + 1
    else
        fail = fail + 1
        io.stderr:write(string.format("FAIL: %s (expected nil, got %s)\n", msg, tostring(got)))
    end
end

local function assert_not_nil(got, msg)
    if got ~= nil then
        pass = pass + 1
    else
        fail = fail + 1
        io.stderr:write(string.format("FAIL: %s (expected non-nil)\n", msg))
    end
end

-- 1. is_zip tests
do
    local ok, err = zip_utils.is_zip(nil)
    assert_eq(ok, false, "is_zip(nil) returns false")
    assert_eq(err, "empty data", "is_zip(nil) error message")
end

do
    local empty_data = read_file("test_empty.bin")
    local ok, err = zip_utils.is_zip(empty_data)
    assert_eq(ok, false, "is_zip(empty) returns false")
    assert_eq(err, "empty data", "is_zip(empty) error message")
end

do
    local ok, err = zip_utils.is_zip("ABC")
    assert_eq(ok, false, "is_zip(too short) returns false")
    assert_eq(err, "data too short for ZIP signature", "is_zip(too short) error message")
end

do
    local ok, err = zip_utils.is_zip("not a zip file content here")
    assert_eq(ok, false, "is_zip(not zip) returns false")
    assert_eq(err, "invalid ZIP signature", "is_zip(not zip) error message")
end

do
    local zip_data = read_file("test_valid.zip")
    local ok, err = zip_utils.is_zip(zip_data)
    assert_eq(ok, true, "is_zip(valid) returns true")
    assert_nil(err, "is_zip(valid) error is nil")
end

-- 2. list_files tests
do
    local zip_data = read_file("test_valid.zip")
    local files = zip_utils.list_files(zip_data)
    assert_not_nil(files, "list_files(valid) returns table")
    if files then
        assert_eq(#files, 4, "list_files has 4 entries")
        local names = {}
        for _, f in ipairs(files) do
            names[f.name] = true
        end
        assert_eq(names["index.html"], true, "list_files includes index.html")
        assert_eq(names["js/app.js"], true, "list_files includes js/app.js")
        assert_eq(names["css/style.css"], true, "list_files includes css/style.css")
        assert_eq(names["assets/img/logo.png"], true, "list_files includes assets/img/logo.png")
        for _, f in ipairs(files) do
            assert_not_nil(f.name, "file entry has name")
            assert_not_nil(f.size, "file entry has size")
            assert_not_nil(f.compression_method, "file entry has compression_method")
            assert_not_nil(f.crc, "file entry has crc")
        end
    end
end

do
    local zip_data = read_file("test_valid.zip")
    local files = zip_utils.list_files(zip_data, "js/")
    assert_not_nil(files, "list_files with prefix returns table")
    if files then
        assert_eq(#files, 1, "list_files(js/) has 1 entry")
        assert_eq(files[1].name, "js/app.js", "list_files(js/) filters correctly")
    end
end

do
    local zip_data = read_file("test_valid.zip")
    local files = zip_utils.list_files(zip_data, "nonexistent/")
    assert_not_nil(files, "list_files with no-match prefix returns table")
    assert_eq(#files, 0, "list_files(no match) returns empty table")
end

-- 3. extract_file tests
do
    local zip_data = read_file("test_valid.zip")
    local content = zip_utils.extract_file(zip_data, "index.html")
    assert_eq(content, "<html><body>Hello</body></html>", "extract_file index.html content")
end

do
    local zip_data = read_file("test_valid.zip")
    local content = zip_utils.extract_file(zip_data, "nonexistent.txt")
    assert_nil(content, "extract_file nonexistent returns nil")
end

do
    local zip_data = read_file("test_uncompressed.zip")
    local content = zip_utils.extract_file(zip_data, "readme.txt")
    assert_eq(content, "Hello World", "extract_file uncompressed content")
end

-- 4. truncated ZIP tests
do
    local zip_data = read_file("test_truncated.zip")
    local ok, err = zip_utils.is_zip(zip_data)
    assert_eq(ok, true, "truncated ZIP may pass signature check")
end

-- 5. extract_selected tests
do
    local zip_data = read_file("test_valid.zip")
    local ok, err = zip_utils.extract_selected(zip_data, "/tmp/zip_test_out", {"index.html", "js/app.js"})
    assert_eq(ok, true, "extract_selected returns true")
end

do
    local zip_data = read_file("test_valid.zip")
    local ok, err = zip_utils.extract_selected(zip_data, "/tmp/zip_test_out", {"nonexistent1.txt", "nonexistent2.txt"})
    assert_nil(ok, "extract_selected with missing files returns nil")
end

io.write(string.format("\nResults: %d passed, %d failed, %d total\n", pass, fail, pass + fail))
if fail > 0 then
    os.exit(1)
end
