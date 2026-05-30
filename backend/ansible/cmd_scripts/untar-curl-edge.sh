#!/bin/bash
#调用命令请使用绝对路径

mv /work/jboss/temp/test-edge.tar.gz /work/jboss/uapm/soft/
rm -rf /work/jboss/uapm/soft/test-edge
cd /work/jboss/uapm/soft/
tar -zxvf test-edge.tar.gz
cp /work/jboss/uapm/soft/test-edge/nginx_server_17001.conf  /work/jboss/uapm/openresty-22306/nginx/conf/





#free -m
