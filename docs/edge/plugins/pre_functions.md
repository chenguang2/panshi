# pre_functions/post_functions



## 描述

自定义方法，在指定阶段调用插件 **前** 或 **后** 执行自定义方法，用于对数据做预处理，或直接响应结果。



## 基础属性

| 名称                   | 类型    | 默认值 | 说明                                                         |
| ---------------------- | ------- | ------ | ------------------------------------------------------------ |
| rewrite<br>access<br/>header_filter<br/>body_filter<br/>log | array[string] | `空` | 自定义方法列表，可以包含多个方法，例如：`["return function(conf, ctx) ngx.log(ngx.ERR, 'hello'); end", "return function(conf, ctx) ngx.log(ngx.ERR, 'world'); end"]` 等。 |



## 数据属性

无




> **注意**
>
> 1. 每一个自定义方法都必须返回函数类型。
> 2. 可以在 `ctx.var` 中自定义变量，变量命名时需统一前缀 `fpre_` / `fpost_` ，避免与内部变量冲突。
> 3. 如果其中一个方法返回 `status, message` ，将中断当前请求，并将响应状态码`status`，提示信息`message`返回给前端，例如：`["return function(conf, ctx) return 200, 'OK'; end"]` 。







## 事例



### 配置插件



配置日志格式：

```
/admin/plugin_metadata/log_process
```

```json
{
    "logs": {
        "logs/process.log": {
            "formats": [
                "${req_start_time#time_format,%Y%m%d%H%M%S}",
                "${remote_addr}",
                "${method}",
                "${uri}",
                "${fpre_test1}",
                "${fpre_test2}",
                "${fpre_test3}",
                "${status}"
            ]
        }
    }
}
```



在指定路由上启用 `pre_functions` 插件：

```
/edge/admin/routes/3001
```
```json
{
    "uri": "/hello1/*",
    "plugin_config_id": "plugins_common",
    "plugins": {
        "log_process": {},
        "pre_functions": {
            "access": [
                "return function(conf, ctx) local ctx_var = ctx.var or {}; ctx_var.fpre_test1='hello1'; end",
                "return function(conf, ctx) local ctx_var = ctx.var or {}; ctx_var.fpre_test2='hello2'; return 200, 'OK'; end",
                "return function(conf, ctx) local ctx_var = ctx.var or {}; ctx_var.fpre_test3='hello3'; end"
            ]
        }
    },
    "upstream": {
        "type": "roundrobin",
        "nodes": {
            "127.0.0.1:8111": 1
        }
    }
}
```





### 测试插件

发送一个测试请求

```shell
curl -L 'http://127.0.0.1:9980/hello1/h1'

OK
```

查看日志

```shell
20240715104625|;127.0.0.1|;GET|;/hello1/h1|;hello1|;hello2|;|;200
```

发现 `${fpre_test1}`，`${fpre_test2}` 的值正确打印，因第二个方法中断了请求，`${fpre_test3}` 为空。
