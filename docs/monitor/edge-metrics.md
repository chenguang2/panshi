# Edge 指标监控文档

> 数据源：ClickHouse `esapm_metrics` 库（OpenTelemetry 格式）
> 连接：`192.168.100.42:9000`，数据库 `esapm_metrics`，用户 `default`
> 数据时间范围：2026-08-20 ~ 2026-09-01

## 指标总览

共 **18 个唯一指标**，全部来自 `edge` 服务。按功能分为以下几类：

| 分类 | 指标数 | 说明 |
|---|---|---|
| HTTP 请求 | 4 | 请求数、延迟、状态码 |
| 带宽 | 1 | 网络流量 |
| 插件 | 3 | 插件延迟 |
| 连接 | 1 | 当前连接数 |
| 共享内存 | 2 | nginx shared DICT 使用情况 |
| 错误 | 1 | 指标采集错误 |
| 采集（Prometheus） | 5 | 抓取元数据 |

## 指标详情

### HTTP 请求指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_http_requests_total` | gauge | - | EDGE 启动以来的客户端请求总数 | `ip` |
| `edge_http_latency` | histogram | ms | HTTP 请求延迟分布 | `ip`, `node`, `route`, `type` |
| `edge_http_latency_max` | gauge | ms | HTTP 最大延迟 | `ip`, `node`, `route`, `type` |
| `edge_http_latency_min` | gauge | ms | HTTP 最小延迟 | `ip`, `node`, `route`, `type` |
| `edge_http_status` | sum | - | HTTP 状态码分布 | `code`, `ip`, `matched_uri`, `node`, `route` |

### 带宽指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_bandwidth` | sum | bytes | 每个服务消耗的总带宽 | `ip`, `node`, `route`, `type` |

### 插件指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_plugin_latency` | histogram | ms | 插件延迟分布 | `ip`, `name`, `node`, `route` |
| `edge_plugin_latency_max` | gauge | ms | 插件最大延迟 | `ip`, `name`, `node`, `route` |
| `edge_plugin_latency_min` | gauge | ms | 插件最小延迟 | `ip`, `name`, `node`, `route` |

### 连接指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_nginx_http_current_connections` | gauge | - | 当前 HTTP 连接数 | `ip`, `state` |

### 共享内存指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_shared_dict_capacity_bytes` | gauge | bytes | nginx 共享 DICT 总容量 | `ip`, `name` |
| `edge_shared_dict_free_space_bytes` | gauge | bytes | nginx 共享 DICT 剩余空间 | `ip`, `name` |

### 错误指标

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `edge_metric_errors_total` | sum | - | 指标采集错误总数 | `ip` |

### 采集元数据（Prometheus Scraper）

| 指标名称 | 类型 | 单位 | 描述 | 维度（Attributes） |
|---|---|---|---|---|
| `up` | gauge | - | 抓取是否成功（1=成功） | `ip` |
| `scrape_duration_seconds` | gauge | s | 抓取耗时 | `ip` |
| `scrape_samples_scraped` | gauge | - | 目标暴露的样本数 | `ip` |
| `scrape_samples_post_metric_relabeling` | gauge | - | 指标重标签后剩余的样本数 | `ip` |
| `scrape_series_added` | gauge | - | 本次抓取新增的近似序列数 | `ip` |

## 全局资源属性（ResourceAttributes）

所有指标均携带以下资源属性：

| 属性 | 说明 |
|---|---|
| `service.name` | 服务名称 |
| `service.instance.id` | 服务实例 ID |
| `server.address` | 服务器地址 |
| `server.port` | 服务器端口 |
| `url.scheme` | URL 协议（http/https） |

## ClickHouse 表结构

数据按 OpenTelemetry 指标类型分表存储：

| 表名 | 说明 | 对应指标 |
|---|---|---|
| `otel_metrics_gauge` | 瞬时值指标 | `edge_http_requests_total`, `edge_http_latency_max/min`, `edge_plugin_latency_max/min`, `edge_nginx_http_current_connections`, `edge_shared_dict_*`, `up`, `scrape_*` |
| `otel_metrics_sum` | 累加值指标 | `edge_bandwidth`, `edge_http_status`, `edge_metric_errors_total` |
| `otel_metrics_histogram` | 直方图指标 | `edge_http_latency`, `edge_plugin_latency` |
| `otel_metrics_exponential_histogram` | 指数直方图（当前无数据） | - |
| `otel_metrics_summary` | 摘要指标（当前无数据） | - |

## 指标查询结果（截至 2026-09-01）

| 序号 | 指标名称 | 表 | 类型 | 单位 | 数据行数 | 描述 | 维度 |
|---:|---|---|---|---|---:|---|---|
| 1 | `edge_bandwidth` | sum | sum | - | 31,624 | Total bandwidth in bytes consumed per service in EDGE | `ip`, `node`, `route`, `type` |
| 2 | `edge_http_latency` | histogram | histogram | - | 79,050 | HTTP request latency in milliseconds per service in EDGE | `ip`, `node`, `route`, `type` |
| 3 | `edge_http_latency_max` | gauge | gauge | - | 79,040 | - | `ip`, `node`, `route`, `type` |
| 4 | `edge_http_latency_min` | gauge | gauge | - | 79,040 | - | `ip`, `node`, `route`, `type` |
| 5 | `edge_http_requests_total` | gauge | gauge | - | 16,946 | The total number of client requests since EDGE started | `ip` |
| 6 | `edge_http_status` | sum | sum | - | 15,812 | HTTP status codes per service in EDGE | `code`, `ip`, `matched_uri`, `node`, `route` |
| 7 | `edge_metric_errors_total` | sum | sum | - | 16,950 | Number of metric errors | `ip` |
| 8 | `edge_nginx_http_current_connections` | gauge | gauge | - | 101,676 | Number of HTTP connections | `ip`, `state` |
| 9 | `edge_plugin_latency` | histogram | histogram | - | 15,810 | Plugin latency in milliseconds per service in EDGE | `ip`, `name`, `node`, `route` |
| 10 | `edge_plugin_latency_max` | gauge | gauge | - | 15,808 | - | `ip`, `name`, `node`, `route` |
| 11 | `edge_plugin_latency_min` | gauge | gauge | - | 15,808 | - | `ip`, `name`, `node`, `route` |
| 12 | `edge_shared_dict_capacity_bytes` | gauge | gauge | - | 694,786 | The capacity of each nginx shared DICT since EDGE start | `ip`, `name` |
| 13 | `edge_shared_dict_free_space_bytes` | gauge | gauge | - | 694,786 | The free space of each nginx shared DICT since EDGE start | `ip`, `name` |
| 14 | `scrape_duration_seconds` | gauge | gauge | s | 16,946 | Duration of the scrape | `ip` |
| 15 | `scrape_samples_post_metric_relabeling` | gauge | gauge | - | 16,946 | The number of samples remaining after metric relabeling was applied | `ip` |
| 16 | `scrape_samples_scraped` | gauge | gauge | - | 16,946 | The number of samples the target exposed | `ip` |
| 17 | `scrape_series_added` | gauge | gauge | - | 16,946 | The approximate number of new series in this scrape | `ip` |
| 18 | `up` | gauge | gauge | - | 16,946 | The scraping was successful | `ip` |

## 常用查询示例

```sql
-- 查询所有指标名称
SELECT DISTINCT MetricName FROM otel_metrics_gauge
UNION ALL SELECT DISTINCT MetricName FROM otel_metrics_sum
UNION ALL SELECT DISTINCT MetricName FROM otel_metrics_histogram
ORDER BY MetricName;

-- 按节点查询 HTTP 请求数
SELECT Attributes['node'] as node, sum(Value) as total
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
GROUP BY node;

-- 查询 HTTP 状态码分布
SELECT Attributes['code'] as code, sum(Value) as count
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
GROUP BY code ORDER BY count DESC;

-- 查询某路由的延迟 P99（histogram）
SELECT 
    Attributes['route'] as route,
    quantile(0.99)(Value) as p99_latency
FROM otel_metrics_histogram
WHERE MetricName = 'edge_http_latency'
GROUP BY route;
```

```
序号	指标名称	类型	描述
1	edge_bandwidth	sum	每个服务在 EDGE 中消耗的总带宽（字节）
2	edge_http_latency	histogram	每个服务的 HTTP 请求延迟（毫秒）
3	edge_http_latency_max	gauge	HTTP 最大延迟
4	edge_http_latency_min	gauge	HTTP 最小延迟
5	edge_http_requests_total	gauge	EDGE 启动以来的客户端请求总数
6	edge_http_status	sum	每个服务的 HTTP 状态码分布
7	edge_metric_errors_total	sum	指标错误总数
8	edge_nginx_http_current_connections	gauge	当前 HTTP 连接数
9	edge_plugin_latency	histogram	每个服务的插件延迟（毫秒）
10	edge_plugin_latency_max	gauge	插件最大延迟
11	edge_plugin_latency_min	gauge	插件最小延迟
12	edge_shared_dict_capacity_bytes	gauge	nginx 共享 DICT 总容量
13	edge_shared_dict_free_space_bytes	gauge	nginx 共享 DICT 剩余空间
14	scrape_duration_seconds	gauge	抓取耗时（秒）
15	scrape_samples_post_metric_relabeling	gauge	指标重标签后剩余的样本数
16	scrape_samples_scraped	gauge	目标暴露的样本数
17	scrape_series_added	gauge	本次抓取新增的近似序列数
18	up	gauge	抓取是否成功
```