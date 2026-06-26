#!/bin/bash
#调用命令请使用绝对路径






POST_STR="curl -s -L -X GET 'http://127.0.0.1:16621/edge/admin/routes' -H 'X-API-KEY: f9357106bff442f89d4de7169c37c61e'"

eval "$POST_STR" | curl -s -X POST -d @- http://127.0.0.1:17001/trans-curl | jq -r |  sed 's/\x1b\[[0-9;]*m//g' | sed 's/["\\]//g'
#eval "$POST_STR" | curl -s -X POST -d @- http://127.0.0.1:17001/trans-curl   



#free -m
