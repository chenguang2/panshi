## Decisions

- 在删除资源前显式执行 DELETE 语句清理关联记录
- 覆盖所有关联表：UpstreamTarget、RoutePlugin、ConfigVersion
