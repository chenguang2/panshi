## ADDED Requirements

### Requirement: 支持 POST 参数匹配
系统 SHALL 支持使用 POST 请求 body 中的参数进行条件匹配，参数 key 前缀为 `postarg_`。

#### Scenario: POST 参数等于匹配
- **WHEN** 用户选择"POST参数"类型，填写 key="user_id"，运算符为 `>`，值为 `100`
- **THEN** 系统生成 vars 条目 `["postarg_user_id", ">", "100"]`

#### Scenario: POST 参数正则匹配
- **WHEN** 用户选择"POST参数"类型，填写 key="name"，运算符为 `~~`，值为 `^admin`
- **THEN** 系统生成 vars 条目 `["postarg_name", "~~", "^admin"]`

### Requirement: 支持内置参数匹配
系统 SHALL 支持使用内置参数进行条件匹配，内置参数无前缀，直接使用变量名。

#### Scenario: 内置 URI 正则匹配
- **WHEN** 用户选择"内置参数"类型，填写 key="uri"，运算符为 `~~`，值为 `/api/v\d+`
- **THEN** 系统生成 vars 条目 `["uri", "~~", "/api/v\\d+"]`

#### Scenario: 内置参数大于匹配
- **WHEN** 用户选择"内置参数"类型，填写 key="request_length"，运算符为 `>`，值为 `1000`
- **THEN** 系统生成 vars 条目 `["request_length", ">", "1000"]`

### Requirement: 支持所有判断条件运算符
系统 SHALL 支持以下 8 种判断条件运算符：等于、不等于、大于、小于、正则匹配、大小写敏感正则、包含、不包含。

#### Scenario: 所有运算符正确构建 vars
- **WHEN** 用户选择任意支持的运算符
- **THEN** 系统将运算符字符串原样传递到 vars 条目中

## MODIFIED Requirements

### Requirement: 参数位置选项
系统 SHALL 支持请求头、查询参数、POST参数、Cookie、内置参数五种参数位置进行路由匹配。

#### Scenario: 参数类型切换
- **WHEN** 用户在已有规则后切换参数类型
- **THEN** 系统清空 key 和 value，重置运算符为 `==`

### Requirement: 判断条件运算符
系统 SHALL 支持以下 8 种判断条件运算符：等于(`==`)、不等于(`!=`)、大于(`>`)、小于(`<`)、正则匹配(`~~`)、大小写敏感正则(`~*`)、包含(`IN`)、不包含(`NOT IN`)。

#### Scenario: 移除客户端IP 匹配类型
- **WHEN** 用户需要匹配客户端 IP
- **THEN** 该功能已移除，用户应使用内置参数或其他方式实现
