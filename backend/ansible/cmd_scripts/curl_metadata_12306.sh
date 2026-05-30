#!/bin/bash
#调用命令请使用绝对路径





plugin="data_center"
#plugin="security_super_redis"
#plugin="security_fengkong"
#plugin="security_fengkong_env"
#plugin="data_center"

POST_STR="curl -s -L -X GET 'http://127.0.0.1:16620/edge/admin/plugin_metadata/$plugin' -H 'X-API-KEY: f9357106bff442f89d4de7169c37c61e'"

eval "$POST_STR" | curl -s -X POST -d @- http://127.0.0.1:17001/trans-curl | jq | sed 's/\x1b\[[0-9;]*m//g'| sed 's/["\\]//g'



#free -m
