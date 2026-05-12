# traffic_split



## 描述

流量分发插件，通过配置限制条件，将请求分发到指定负载。



## 基础属性

| 名称                   | 类型    | 默认值 | 说明                                                         |
| ---------------------- | ------- | ------ | ------------------------------------------------------------ |
| splits    | array[object] | `空` | 分发策略，可以配置复数个，例如：`[split1,split2,...]` 等。 |
| splitN    | object | `空` | 单个分发策略，例如：`{"ups_expr": ..., "upstreams": ...}` 等。 |
| splitN.ups_expr    | array[array] | `空` | 条件表达式，例如：`[["arg_dc","==","1"]]` 等。 |
| splitN.upstreams    | array[object] | `空` | 负载信息，可以配置复数个，例如：`[ups1,ups2,...]` 等。 |
| upsN    | object | `空` | 单个负载信息，例如：`{"upstream_id": ..., "weight": ...}` 等。 |
| upsN.upstream_id    | string | `空` | 负载地址，例如：`ups_test1` 等。 |
| upsN.weight     | integer | `1` | 权重，例如： `1`。 |



## 数据属性

无




> **注意**
> 
> 1. 如果 **splitN.ups_expr** 未配置时，视为条件成立。
> 2. 如果 **upsN.upstream_id** 未配置时，即使用当前路由的负载信息。







## 事例



### 启用插件


修改 `conf/plugins.cfg` ，确保插件 `traffic_split` 已启用

```shell
plugins:
  ...
  - traffic_split
  ...
```


### 配置负载信息


```
/edge/admin/upstreams/ups_test1
```
```json
{
    "type": "roundrobin",
    "nodes": {
        "127.0.0.1:8111": 1
    }
}
```

```
/edge/admin/upstreams/ups_test2
```
```json
{
    "type": "roundrobin",
    "nodes": {
        "127.0.0.1:8112": 1
    }
}
```

```
/edge/admin/upstreams/ups_test3
```
```json
{
    "type": "roundrobin",
    "nodes": {
        "127.0.0.1:8113": 1
    }
}
```



### 配置插件


在指定路由上启用 `traffic_split` 插件：

```
/edge/admin/routes/3001
```
```json
{
    "uri": "/hello1/*",
    "plugins": {
        "log_process": {
            "logs": ["logs/process.log"]
        },
        "traffic_split": {
            "splits": [
                {
                    "ups_expr": [
                        ["arg_dc", "==", "1"]
                    ],
                    "upstreams": [
                        {
                            "upstream_id": "ups_test1"
                        }
                    ]
                },
                {
                    "ups_expr": [
                        ["arg_dc", "==", "2"]
                    ],
                    "upstreams": [
                        {
                            "upstream_id": "ups_test2"
                        }
                    ]
                },
                {
                    "ups_expr": [
                        ["arg_dc", "==", "12"]
                    ],
                    "upstreams": [
                        {
                            "upstream_id": "ups_test1",
                            "weight": 1
                        },
                        {
                            "upstream_id": "ups_test2",
                            "weight": 2
                        },
                        {
                            "weight": 3
                        }
                    ]
                }
            ]
        }
    },
    "upstream_id": "ups_test3"
}
```





### 测试插件



- 测试条件1

  ```shell
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=1'
  
  127.0.0.1:8111/hello1/h1?dc=1 traceid=
  ```

  > 请求一直被分发到 `ups_test1` 的负载地址上


- 测试条件2

  ```shell
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=2'
  
  127.0.0.1:8112/hello1/h1?dc=2 traceid=
  ```

  > 请求一直被分发到 `ups_test2` 的负载地址上


- 测试条件3

  ```shell
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  curl -L 'http://127.0.0.1:9980/hello1/h1?dc=12'
  
  127.0.0.1:8113/hello1/h1?dc=12 traceid=
  127.0.0.1:8112/hello1/h1?dc=12 traceid=
  127.0.0.1:8113/hello1/h1?dc=12 traceid=
  127.0.0.1:8112/hello1/h1?dc=12 traceid=
  127.0.0.1:8111/hello1/h1?dc=12 traceid=
  127.0.0.1:8113/hello1/h1?dc=12 traceid=
  ```

  > 所有请求会按照 `1:2:3` 的权重，被分发到 `ups_test1`，`ups_test2`，`ups_test3` 的负载地址上
  > 其中第3段配置中，未配置负载信息，会使用当前路由的负载信息，即：`ups_test3`


- 测试条件4

  ```shell
  curl -L 'http://127.0.0.1:9980/hello1/h1'
  
  127.0.0.1:8113/hello1/h1 traceid=
  ```

  > 所有条件都不满足的情况下，会分发到当前路由的负载地址 `ups_test3` 上，相当于未使用该插件

  

